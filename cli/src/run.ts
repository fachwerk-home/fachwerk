/**
 * `fachwerk run <dir>` (S-6): verknotet den Faden — Gewerk laden/validieren,
 * Registry + Engine starten, KNX-Treiber verbinden, Datenpunkte ↔ Bus koppeln.
 * Traces gehen als JSONL nach stdout (E-5: Pflicht, nicht Option);
 * Statusmeldungen nach stderr. Konfiguration über Env (Container-first):
 * FACHWERK_KNX_HOST / FACHWERK_KNX_PORT / FACHWERK_DATEN_DIR (Persistenz).
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  BausteinSandbox,
  DatenpunktRegistry,
  LogikEngine,
  Speicher,
  analysiereLogik,
  loadGewerk,
  sandboxAlsBaustein,
  type Baustein,
  type Wert,
} from "@fachwerk/core";
import { KnxTreiber } from "@fachwerk/driver-knx";

export async function run(dir: string): Promise<number> {
  const { gewerk, fehler } = loadGewerk(dir);
  if (fehler.length > 0 || !gewerk) {
    for (const f of fehler) console.error(`FEHLER: ${f.datei} ${f.pfad}: ${f.meldung}`);
    return 1;
  }
  // Eigene Bausteine in Sandboxen (P4-5): plain JS im Worker, Zeit-/Speicher-Limit.
  const sandboxen: BausteinSandbox[] = [];
  const eigene = new Map<string, Baustein>();
  for (const [id, def] of gewerk.bausteine ?? []) {
    const sandbox = new BausteinSandbox(def.jsPfad);
    sandboxen.push(sandbox);
    eigene.set(id, sandboxAlsBaustein(id, sandbox));
  }
  const resolver = (typ: string): Baustein | undefined => eigene.get(typ);

  const analyse = analysiereLogik(gewerk, resolver);
  for (const w of analyse.warnungen) console.error(`WARNUNG: ${w}`);
  if (analyse.fehler.length > 0) {
    for (const f of analyse.fehler) console.error(`FEHLER: ${f}`);
    return 1;
  }

  // Persistenz (ADR-0006): Zustand lebt auf einem Volume, nie im Image.
  const datenDir = process.env["FACHWERK_DATEN_DIR"] ?? "./daten";
  mkdirSync(datenDir, { recursive: true });
  const speicher = new Speicher(join(datenDir, "zustand.sqlite"));

  const registry = new DatenpunktRegistry(gewerk);

  // Remanente Werte VOR dem Engine-Start einspielen (keine Kaskaden dabei).
  let wiederhergestellt = 0;
  for (const [schluessel, wert] of speicher.ladeWerte()) {
    if (registry.definition(schluessel)?.remanent) {
      if (registry.schreibe(schluessel, wert, "system").angenommen) wiederhergestellt++;
    }
  }
  if (wiederhergestellt > 0) {
    console.error(`Persistenz: ${wiederhergestellt} remanente(r) Wert(e) wiederhergestellt`);
  }
  // Timer-Pumpwerk (E-8): setTimeout auf die früheste Fälligkeit, monotone Uhr.
  const uhr = (): number => performance.now();
  let timerHandle: ReturnType<typeof setTimeout> | null = null;
  const pumpe = (): void => {
    if (timerHandle) clearTimeout(timerHandle);
    timerHandle = null;
    const naechste = engine.naechsteFaelligkeit();
    if (naechste === null) return;
    timerHandle = setTimeout(
      () => {
        engine.verarbeiteFaellige(uhr());
        pumpe();
      },
      Math.max(0, naechste - uhr()),
    );
    timerHandle.unref?.();
  };
  const engine = new LogikEngine(gewerk, registry, {
    onTrace: (t) => {
      console.log(JSON.stringify(t));
      // Nach jeder Kaskade: Timer + Baustein-Zustände sichern (T-5/T-6).
      speicher.sichereEngine(engine.momentaufnahme());
    },
    onWarnung: (w) => console.error(`WARNUNG: ${w}`),
    bausteine: resolver,
    uhr,
    onTimerAenderung: () => pumpe(),
  });
  engine.start();

  // Engine-Zustand (Timer/Baustein-Zustände) aus dem letzten Lauf fortsetzen;
  // Überfälliges feuert einmal nach — kein hängender Ausgang (T-5).
  const engineZustand = speicher.ladeEngine();
  if (engineZustand) {
    engine.stelleWiederHer(engineZustand);
    if (engineZustand.timer.length > 0) {
      console.error(`Persistenz: ${engineZustand.timer.length} Timer fortgesetzt/nachgeholt`);
    }
  }

  // Remanente Werte fortlaufend sichern.
  registry.abonniere((e) => {
    if (registry.definition(e.schluessel)?.remanent) {
      speicher.sichereWert(e.schluessel, e.wert);
    }
  });

  // KNX-Zuordnung: GA ↔ Datenpunkt + DPT-Karte (P4-4).
  const gaZuDp = new Map<string, { schluessel: string; typ: string }>();
  const dpZuGa = new Map<string, string>();
  const dpts = new Map<string, "1.001" | "5.001" | "9.001">();
  for (const [gruppe, datei] of gewerk.datenpunkte) {
    for (const [key, def] of Object.entries(datei)) {
      if (def.klasse === "bus" && def.treiber === "knx" && def.adresse) {
        const schluessel = `${gruppe}.${key}`;
        gaZuDp.set(def.adresse, { schluessel, typ: def.typ });
        dpZuGa.set(schluessel, def.adresse);
        dpts.set(def.adresse, def.dpt ?? (def.typ === "bool" ? "1.001" : "9.001"));
      }
    }
  }

  const host = process.env["FACHWERK_KNX_HOST"] ?? "127.0.0.1";
  const port = Number(process.env["FACHWERK_KNX_PORT"] ?? 3671);
  const treiber = new KnxTreiber({
    host,
    port,
    dpts,
    onTelegramm: (t) => {
      const dp = gaZuDp.get(t.ga);
      if (!dp || t.art !== "write") return;
      const erg = registry.schreibe(dp.schluessel, t.wert as Wert, "treiber");
      if (!erg.angenommen) console.error(`WARNUNG: Bus→${dp.schluessel}: ${erg.grund}`);
    },
    onFehler: (m) => console.error(`KNX: ${m}`),
  });

  // Engine-/System-Schreibvorgänge auf Bus-Datenpunkte gehen aufs KNX.
  registry.abonniere((e) => {
    if (e.quelle === "treiber") return; // kam vom Bus — kein Echo
    const ga = dpZuGa.get(e.schluessel);
    if (ga !== undefined && typeof e.wert !== "string") {
      treiber.sende(ga, e.wert);
    }
  });

  // Verbinden mit Wiederholung: im Container startet der Simulator parallel.
  let versuch = 0;
  for (;;) {
    try {
      await treiber.verbinde();
      break;
    } catch (e) {
      if (++versuch >= 15) throw e;
      console.error(`KNX: Verbindung fehlgeschlagen (Versuch ${versuch}) — neuer Versuch …`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  console.error(
    `fachwerk läuft: „${gewerk.manifest.name}" — ${gaZuDp.size} KNX-Zuordnung(en), Endpunkt ${host}:${port}`,
  );

  // Sauberer Shutdown (Container-first: SIGTERM ist der normale Weg).
  await new Promise<void>((resolve) => {
    const stop = (): void => {
      console.error("fachwerk: Shutdown …");
      void treiber.trenne().then(() => {
        engine.stop();
        if (timerHandle) clearTimeout(timerHandle);
        speicher.sichereEngine(engine.momentaufnahme()); // letzter Stand (T-5)
        speicher.schliesse();
        for (const s of sandboxen) s.beende();
        resolve();
      });
    };
    process.on("SIGTERM", stop);
    process.on("SIGINT", stop);
  });
  return 0;
}

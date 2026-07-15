/**
 * `fachwerk run <dir>` (S-6): verknotet den Faden — Gewerk laden/validieren,
 * Registry + Engine starten, KNX-Treiber verbinden, Datenpunkte ↔ Bus koppeln.
 * Traces gehen als JSONL nach stdout (E-5: Pflicht, nicht Option);
 * Statusmeldungen nach stderr. Konfiguration über Env (Container-first):
 * FACHWERK_KNX_HOST / FACHWERK_KNX_PORT.
 */
import {
  DatenpunktRegistry,
  LogikEngine,
  analysiereLogik,
  loadGewerk,
  type Wert,
} from "@fachwerk/core";
import { KnxTreiber } from "@fachwerk/driver-knx";

export async function run(dir: string): Promise<number> {
  const { gewerk, fehler } = loadGewerk(dir);
  if (fehler.length > 0 || !gewerk) {
    for (const f of fehler) console.error(`FEHLER: ${f.datei} ${f.pfad}: ${f.meldung}`);
    return 1;
  }
  const analyse = analysiereLogik(gewerk);
  for (const w of analyse.warnungen) console.error(`WARNUNG: ${w}`);
  if (analyse.fehler.length > 0) {
    for (const f of analyse.fehler) console.error(`FEHLER: ${f}`);
    return 1;
  }

  const registry = new DatenpunktRegistry(gewerk);
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
    onTrace: (t) => console.log(JSON.stringify(t)),
    onWarnung: (w) => console.error(`WARNUNG: ${w}`),
    uhr,
    onTimerAenderung: () => pumpe(),
  });
  engine.start();

  // KNX-Zuordnung: GA ↔ Datenpunkt (Skeleton: nur typ bool auf dem Bus).
  const gaZuDp = new Map<string, { schluessel: string; typ: string }>();
  const dpZuGa = new Map<string, string>();
  for (const [gruppe, datei] of gewerk.datenpunkte) {
    for (const [key, def] of Object.entries(datei)) {
      if (def.klasse === "bus" && def.treiber === "knx" && def.adresse) {
        const schluessel = `${gruppe}.${key}`;
        gaZuDp.set(def.adresse, { schluessel, typ: def.typ });
        dpZuGa.set(schluessel, def.adresse);
      }
    }
  }

  const host = process.env["FACHWERK_KNX_HOST"] ?? "127.0.0.1";
  const port = Number(process.env["FACHWERK_KNX_PORT"] ?? 3671);
  const treiber = new KnxTreiber({
    host,
    port,
    onTelegramm: (t) => {
      const dp = gaZuDp.get(t.ga);
      if (!dp || t.art !== "write") return;
      const wert: Wert = dp.typ === "bool" ? t.wert !== 0 : t.wert;
      const erg = registry.schreibe(dp.schluessel, wert, "treiber");
      if (!erg.angenommen) console.error(`WARNUNG: Bus→${dp.schluessel}: ${erg.grund}`);
    },
    onFehler: (m) => console.error(`KNX: ${m}`),
  });

  // Engine-/System-Schreibvorgänge auf Bus-Datenpunkte gehen aufs KNX.
  registry.abonniere((e) => {
    if (e.quelle === "treiber") return; // kam vom Bus — kein Echo
    const ga = dpZuGa.get(e.schluessel);
    if (ga !== undefined && typeof e.wert === "boolean") {
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
        resolve();
      });
    };
    process.on("SIGTERM", stop);
    process.on("SIGINT", stop);
  });
  return 0;
}

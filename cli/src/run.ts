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
  UhrDienst,
  analysiereLogik,
  loadGewerk,
  sandboxAlsBaustein,
  uhrDatenpunkte,
  type Baustein,
  type Wert,
} from "@fachwerk/core";
import { KnxTreiber } from "@fachwerk/driver-knx";
import { MqttTreiber, textZuWert, wertZuText } from "@fachwerk/driver-mqtt";

/**
 * Rohe Nutzlast lesbar machen, wenn kein DPT bekannt ist: Hex + Byte-Zahl,
 * bei kurzen Nutzlasten zusätzlich die Ganzzahl. Bewusst KEINE geratene
 * Interpretation — ohne DPT weiß niemand, was die Bytes bedeuten.
 */
function rohText(bytes: Uint8Array): string {
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join(" ");
  if (bytes.length <= 4) {
    const zahl = bytes.reduce((a, b) => a * 256 + b, 0);
    return `0x${hex} (${zahl})`;
  }
  return `0x${hex} (${bytes.length} Byte)`;
}

export async function run(dir: string): Promise<number> {
  // Ganz zuerst: Startbanner. Damit erzeugt JEDER Start sofort eine Zeile —
  // auch wenn gleich danach etwas scheitert (Diagnose im Container).
  const knxHost = process.env["FACHWERK_KNX_HOST"] ?? "127.0.0.1";
  const knxPort = Number(process.env["FACHWERK_KNX_PORT"] ?? 3671);
  const beobachten = process.env["FACHWERK_KNX_MODUS"] === "beobachten";
  // Im Beobachtungsmodus auch ungemappte Telegramme zeigen (Default an).
  const rxAlle = process.env["FACHWERK_KNX_RX_ALLE"] !== "0";
  console.error(
    `fachwerk startet — Gewerk: ${dir} · KNX: ${knxHost}:${knxPort} · ` +
      `Modus: ${beobachten ? "beobachten (sendet nie)" : "normal (sendet)"}`,
  );

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
  try {
    mkdirSync(datenDir, { recursive: true });
  } catch (e) {
    console.error(
      `FEHLER: Zustands-Verzeichnis „${datenDir}" nicht anlegbar: ` +
        `${e instanceof Error ? e.message : String(e)}`,
    );
    console.error("Tipp: FACHWERK_DATEN_DIR auf ein beschreibbares Verzeichnis/Volume setzen.");
    return 1;
  }
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
  // Trace-Ausgabe: FACHWERK_TRACE = kompakt (Default) | voll | aus.
  // „kompakt" unterdrückt leere Kaskaden (z. B. der sekündliche Uhr-Tick,
  // wenn kein Baustein feuert) — sonst ist das Log nicht lesbar.
  const traceModus = process.env["FACHWERK_TRACE"] ?? "kompakt";
  const engine = new LogikEngine(gewerk, registry, {
    onTrace: (t) => {
      const leer = t.schritte.length === 0 && t.schreibvorgaenge.length === 0;
      if (traceModus === "voll" || (traceModus !== "aus" && !leer)) {
        console.log(JSON.stringify(t));
      }
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

  // Uhr-Dienst: speist deklarierte System-Datenpunkte (zeit/datum/unix/wochentag).
  const uhrZiele = uhrDatenpunkte(gewerk);
  const uhr_dienst = new UhrDienst(registry, uhrZiele);
  if (uhrZiele.size > 0) {
    uhr_dienst.start();
    console.error(`Uhr-Dienst: speist ${[...uhrZiele.keys()].join(", ")}`);
  }


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

  const host = knxHost;
  const port = knxPort;
  const treiber = new KnxTreiber({
    host,
    port,
    dpts,
    beobachten,
    onWuerdeSenden: (ga, wert) => console.error(`[BEOBACHTUNG] würde senden  ${ga} = ${wert}`),
    onTelegramm: (t) => {
      const dp = gaZuDp.get(t.ga);
      if (beobachten) {
        // Im Beobachtungsmodus ALLES zeigen — auch ungemappte GAs. Genau dafür
        // ist er da: sehen, was der Bus wirklich tut (und welche GAs es gibt).
        // FACHWERK_KNX_RX_ALLE=0 blendet Ungemapptes aus (stiller, busy Bus).
        if (dp) console.error(`RX  ${t.ga} = ${t.wert}  → ${dp.schluessel}`);
        else if (rxAlle) console.error(`RX  ${t.ga} = ${rohText(t.rohBytes)}  (nicht gemappt)`);
      }
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

  // ---- MQTT (ADR-0007: Core-Treiber) ----------------------------------------
  // Datenpunkte: klasse bus, treiber mqtt, adresse = Topic.
  const topicZuDp = new Map<string, { schluessel: string; typ: "bool" | "zahl" | "text" }>();
  const dpZuTopic = new Map<string, string>();
  for (const [gruppe, datei] of gewerk.datenpunkte) {
    for (const [key, def] of Object.entries(datei)) {
      if (def.klasse === "bus" && def.treiber === "mqtt" && def.adresse) {
        topicZuDp.set(def.adresse, { schluessel: `${gruppe}.${key}`, typ: def.typ });
        dpZuTopic.set(`${gruppe}.${key}`, def.adresse);
      }
    }
  }
  let mqtt: MqttTreiber | null = null;
  if (topicZuDp.size > 0 && !process.env["FACHWERK_MQTT_HOST"]) {
    // Kein Broker konfiguriert: MQTT-Datenpunkte bleiben stumm statt die
    // Runtime in einen endlosen 127.0.0.1-Verbindungsversuch zu schicken.
    console.error(
      `WARNUNG: ${topicZuDp.size} MQTT-Datenpunkt(e) im Gewerk, aber FACHWERK_MQTT_HOST ` +
        "ist nicht gesetzt — MQTT bleibt deaktiviert.",
    );
  } else if (topicZuDp.size > 0) {
    const mqttBeobachten = process.env["FACHWERK_MQTT_MODUS"] === "beobachten";
    mqtt = new MqttTreiber({
      host: process.env["FACHWERK_MQTT_HOST"]!,
      port: Number(process.env["FACHWERK_MQTT_PORT"] ?? 1883),
      ...(process.env["FACHWERK_MQTT_BENUTZER"]
        ? { benutzer: process.env["FACHWERK_MQTT_BENUTZER"] }
        : {}),
      ...(process.env["FACHWERK_MQTT_PASSWORT"]
        ? { passwort: process.env["FACHWERK_MQTT_PASSWORT"] }
        : {}),
      beobachten: mqttBeobachten,
      onWuerdeSenden: (topic, text) =>
        console.error(`[BEOBACHTUNG] würde publizieren  ${topic} = ${text}`),
      onStatus: (ok, m) => console.error(`MQTT: ${m}${ok ? "" : " — Reconnect läuft"}`),
      onNachricht: (n) => {
        const dp = topicZuDp.get(n.topic);
        if (!dp) return;
        const wert = textZuWert(dp.typ, n.text);
        if (wert === null) {
          console.error(`WARNUNG: MQTT ${n.topic}: „${n.text}" ist kein ${dp.typ} — verworfen`);
          return;
        }
        if (mqttBeobachten) console.error(`RX  mqtt ${n.topic} = ${n.text}  → ${dp.schluessel}`);
        const erg = registry.schreibe(dp.schluessel, wert, "treiber");
        if (!erg.angenommen) console.error(`WARNUNG: MQTT→${dp.schluessel}: ${erg.grund}`);
      },
    });
    registry.abonniere((e) => {
      if (e.quelle === "treiber") return; // kam vom Broker — kein Echo
      const topic = dpZuTopic.get(e.schluessel);
      if (topic !== undefined) mqtt!.publiziere(topic, wertZuText(e.wert));
    });
  }

  // Verbinden mit Backoff — UNENDLICH, nie aufgeben: ein Dienst, der wegen
  // eines vorübergehend unerreichbaren Gateways stirbt, erzeugt nur einen
  // Crash-Loop (und reißt seine Logs mit). Lieber laufen bleiben und den Grund
  // jedes Mal nennen. (Beenden geht sauber über SIGTERM/Stop.)
  let versuch = 0;
  for (;;) {
    try {
      await treiber.verbinde();
      break;
    } catch (e) {
      versuch++;
      const wartenMs = Math.min(30_000, 1000 * 2 ** Math.min(versuch - 1, 5));
      const grund = e instanceof Error ? e.message : String(e);
      console.error(
        `KNX: Verbindung zu ${host}:${port} fehlgeschlagen (Versuch ${versuch}): ${grund}`,
      );
      if (versuch === 1) {
        console.error(
          "KNX: Häufige Ursachen — falsche IP, Gateway nicht erreichbar, " +
            "alle Tunnel-Slots belegt, KNX Secure, oder Container ohne Host-Netz.",
        );
      }
      console.error(`KNX: neuer Versuch in ${wartenMs / 1000}s …`);
      await new Promise((r) => setTimeout(r, wartenMs));
    }
  }
  console.error(
    `fachwerk läuft: „${gewerk.manifest.name}" — ${gaZuDp.size} KNX-Zuordnung(en), Endpunkt ${host}:${port}`,
  );
  // Welchen Tunnel/welche Individualadresse hat uns der Router gegeben?
  console.error(
    `KNX verbunden: Tunnel-Kanal ${treiber.kanal}, Individualadresse ${treiber.adresse ?? "?"}`,
  );

  // MQTT verbinden (gleiches Prinzip: unendlicher Backoff, Grund benennen).
  if (mqtt) {
    let mVersuch = 0;
    for (;;) {
      try {
        await mqtt.verbinde();
        break;
      } catch (e) {
        mVersuch++;
        const wartenMs = Math.min(30_000, 1000 * 2 ** Math.min(mVersuch - 1, 5));
        console.error(
          `MQTT: Verbindung fehlgeschlagen (Versuch ${mVersuch}): ` +
            `${e instanceof Error ? e.message : e} — neuer Versuch in ${wartenMs / 1000}s …`,
        );
        await new Promise((r) => setTimeout(r, wartenMs));
      }
    }
    for (const topic of topicZuDp.keys()) mqtt.abonniere(topic);
    console.error(
      `MQTT verbunden: ${topicZuDp.size} Topic(s)` +
        (mqtt.beobachtet ? " — BEOBACHTUNG (publiziert nie)" : ""),
    );
  }

  // Systemstart-Signal NACH Treiber-Verbindung: system-Datenpunkte mit
  // Schlüssel `start` bekommen einmal true (Gegenstück zum Systemstart-KO) —
  // Startup-Kaskaden können so auch Bus-Datenpunkte erreichen.
  for (const [gruppe, datei] of gewerk.datenpunkte) {
    for (const [key, def] of Object.entries(datei)) {
      if (def.klasse === "system" && key === "start" && def.typ === "bool") {
        registry.schreibe(`${gruppe}.${key}`, true, "system");
      }
    }
  }
  if (beobachten) {
    console.error(
      "== BEOBACHTUNGSMODUS == empfange Bustelegramme, sende NIE. " +
        "RX = vom Bus empfangen; [BEOBACHTUNG] wuerde senden = was die Logik taete." +
        (rxAlle ? " Zeige ALLE GAs (FACHWERK_KNX_RX_ALLE=0 = nur gemappte)." : ""),
    );
  }

  // Sauberer Shutdown (Container-first: SIGTERM ist der normale Weg).
  await new Promise<void>((resolve) => {
    const stop = (): void => {
      console.error("fachwerk: Shutdown …");
      mqtt?.trenne();
      void treiber.trenne().then(() => {
        engine.stop();
        uhr_dienst.stop();
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

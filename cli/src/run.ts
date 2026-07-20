/**
 * `fachwerk run <dir>` (S-6): verknotet den Faden — Gewerk laden/validieren,
 * Registry + Engine starten, KNX-Treiber verbinden, Datenpunkte ↔ Bus koppeln.
 * Traces gehen als JSONL nach stdout (E-5: Pflicht, nicht Option);
 * Statusmeldungen nach stderr. Konfiguration über Env (Container-first):
 * FACHWERK_KNX_HOST / FACHWERK_KNX_PORT / FACHWERK_DATEN_DIR (Persistenz).
 *
 * Seit P5-10a ist die Laufzeit zweigeteilt: Der KERN (Gewerk, Registry,
 * Engine, Sandboxen, Visu, Archive) ist austauschbar, alles andere (Treiber-
 * Verbindungen, HTTP/WS, Persistenz, Beobachtungsmodus) bleibt über einen
 * Reload hinweg bestehen. Nur so kann ein Editor ein Gewerk aktivieren, ohne
 * die KNX-Verbindung abzureißen.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  ApiServer,
  ArchivDienst,
  AuditProtokoll,
  BausteinSandbox,
  DatenpunktRegistry,
  LogikEngine,
  Schreibbremse,
  Speicher,
  TracePuffer,
  UhrDienst,
  WsServer,
  analysiereLogik,
  holeMitGrenzen,
  ladeArchive,
  loeseFaehigkeitenAuf,
  ladeVisu,
  loadGewerk,
  pruefeGewerkPfad,
  sandboxAlsBaustein,
  uhrDatenpunkte,
  type Baustein,
  type Gewerk,
  type GewerkDateien,
  type TreiberStatus,
  type Wert,
} from "@fachwerk/core";
import type { VisuDesigns, VisuSeite } from "@fachwerk/schema";
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

/** Der beim Reload austauschbare Teil der Laufzeit (P5-10a). */
interface Kern {
  gewerk: Gewerk;
  registry: DatenpunktRegistry;
  engine: LogikEngine;
  sandboxen: BausteinSandbox[];
  uhrDienst: UhrDienst | null;
  archiv: ArchivDienst | null;
  archivTimer: ReturnType<typeof setInterval> | null;
  visu: { seiten: Map<string, VisuSeite>; designs: VisuDesigns };
}

export async function run(dir: string): Promise<number> {
  // Ganz zuerst: Startbanner. Damit erzeugt JEDER Start sofort eine Zeile —
  // auch wenn gleich danach etwas scheitert (Diagnose im Container).
  const knxHost = process.env["FACHWERK_KNX_HOST"] ?? "127.0.0.1";
  const knxPort = Number(process.env["FACHWERK_KNX_PORT"] ?? 3671);
  // Beobachtungsmodus: kommt aus der Umgebung und lebt AUSSERHALB des Kerns.
  // Ein Reload kann ihn damit konstruktionsbedingt nicht aufheben (heilig).
  const beobachten = process.env["FACHWERK_KNX_MODUS"] === "beobachten";
  // Im Beobachtungsmodus auch ungemappte Telegramme zeigen (Default an).
  const rxAlle = process.env["FACHWERK_KNX_RX_ALLE"] !== "0";
  console.error(
    `fachwerk startet — Gewerk: ${dir} · KNX: ${knxHost}:${knxPort} · ` +
      `Modus: ${beobachten ? "beobachten (sendet nie)" : "normal (sendet)"}`,
  );

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

  // ---- Stabile Teile: ueberleben jeden Reload ---------------------------------
  const uhr = (): number => performance.now();
  const traceModus = process.env["FACHWERK_TRACE"] ?? "kompakt";
  const tracePuffer = new TracePuffer(Number(process.env["FACHWERK_TRACE_PUFFER"] ?? 500));
  const ws = new WsServer();

  // Diese Karten werden beim Reload BEFUELLT, nie ersetzt: der KNX-Treiber
  // haelt eine Referenz auf `dpts` und darf sie nicht verlieren.
  const gaZuDp = new Map<string, { schluessel: string; typ: string }>();
  const dpZuGa = new Map<string, string>();
  const dpts = new Map<string, "1.001" | "5.001" | "9.001">();
  const topicZuDp = new Map<string, { schluessel: string; typ: "bool" | "zahl" | "text" }>();
  const dpZuTopic = new Map<string, string>();

  let timerHandle: ReturnType<typeof setTimeout> | null = null;
  // Timer-Pumpwerk (E-8): setTimeout auf die früheste Fälligkeit, monotone Uhr.
  // Liest die Engine ueber den Kern — nach einem Reload pumpt es die neue.
  const pumpe = (): void => {
    if (timerHandle) clearTimeout(timerHandle);
    timerHandle = null;
    const naechste = kern.engine.naechsteFaelligkeit();
    if (naechste === null) return;
    timerHandle = setTimeout(
      () => {
        kern.engine.verarbeiteFaellige(uhr());
        pumpe();
      },
      Math.max(0, naechste - uhr()),
    );
    timerHandle.unref?.();
  };

  /**
   * Baut einen vollstaendigen Kern aus einem Gewerk-Verzeichnis — ohne ihn zu
   * starten und ohne irgendetwas am laufenden System zu veraendern. Schlaegt
   * das fehl, laeuft der alte Kern unbehelligt weiter.
   */
  function baueKern(zielDir: string): { kern?: Kern; fehler: string[] } {
    const { gewerk, fehler } = loadGewerk(zielDir);
    if (fehler.length > 0 || !gewerk) {
      return { fehler: fehler.map((f) => `${f.datei} ${f.pfad}: ${f.meldung}`) };
    }
    // Eigene Bausteine in Sandboxen (P4-5): plain JS im Worker, Zeit-/Speicher-Limit.
    const sandboxen: BausteinSandbox[] = [];
    const eigene = new Map<string, Baustein>();
    for (const [id, def] of gewerk.bausteine ?? []) {
      // Faehigkeiten aus dem Manifest (ADR-0014 V-1) begleiten den Baustein
      // ueberallhin: der Worker sperrt danach, die Engine prueft danach.
      const faehig = loeseFaehigkeitenAuf(def.manifest.capabilities);
      const sandbox = new BausteinSandbox(def.jsPfad, { faehigkeiten: faehig });
      sandboxen.push(sandbox);
      eigene.set(id, sandboxAlsBaustein(id, sandbox, faehig));
      // Sichtbarkeit ist der halbe Schutz: der Betreiber soll im Log sehen,
      // welcher Baustein ins Netz darf und wohin.
      if (faehig.netzHosts.length > 0) {
        console.error(`Baustein ${id}: darf ins Netz zu ${faehig.netzHosts.join(", ")}`);
      } else if (faehig.alt) {
        console.error(
          `WARNUNG: Baustein ${id} hat keinen capabilities-Block (ADR-0014 V-1) — kein Netzzugriff.`,
        );
      }
    }
    const resolver = (typ: string): Baustein | undefined => eigene.get(typ);

    const analyse = analysiereLogik(gewerk, resolver);
    for (const w of analyse.warnungen) console.error(`WARNUNG: ${w}`);
    if (analyse.fehler.length > 0) {
      // Sandboxen wieder einsammeln — ein gescheiterter Bau darf keine
      // Worker-Threads zuruecklassen.
      for (const s of sandboxen) s.beende();
      return { fehler: analyse.fehler };
    }

    const registry = new DatenpunktRegistry(gewerk);
    const engine = new LogikEngine(gewerk, registry, {
      onTrace: (t) => {
        const leer = t.schritte.length === 0 && t.schreibvorgaenge.length === 0;
        if (!leer) {
          tracePuffer.hinzu(t);
          if (ws.anzahl > 0) ws.sendeAllen(JSON.stringify({ art: "trace", trace: t }));
        }
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
      // Der EINZIGE Weg nach draussen fuer Bausteine (ADR-0014 V-2).
      netz: holeMitGrenzen,
    });

    // Uhr-Dienst: speist deklarierte System-Datenpunkte (zeit/datum/unix/wochentag).
    const uhrZiele = uhrDatenpunkte(gewerk);
    const uhrDienst = uhrZiele.size > 0 ? new UhrDienst(registry, uhrZiele) : null;

    // Visu (P5-6) fuer den Client. Fehler sind hier Warnungen — validate ist
    // das Gate; run soll mit dem gueltigen Teil weiterlaufen.
    const visuGeladen = ladeVisu(zielDir, {
      definition: (schluessel: string): unknown => {
        const punkt = schluessel.indexOf(".");
        if (punkt < 0) return undefined;
        return gewerk.datenpunkte.get(schluessel.slice(0, punkt))?.[schluessel.slice(punkt + 1)];
      },
    });
    for (const f of visuGeladen.fehler) {
      console.warn(`WARNUNG Visu ${f.datei}${f.element ? ` [${f.element}]` : ""}: ${f.grund}`);
    }

    // Archive (P5-13a/13b) — ebenfalls Warnungen statt Startabbruch.
    const archivLaden = ladeArchive(zielDir, gewerk.datenpunkte);
    for (const f of archivLaden.fehler) {
      console.error(`WARNUNG Archiv ${f.datei} ${f.pfad}: ${f.meldung}`);
    }
    const archiv =
      archivLaden.archive.size > 0
        ? new ArchivDienst({
            pfad: join(datenDir, "archiv.sqlite"),
            archive: archivLaden.archive,
          })
        : null;

    return {
      kern: {
        gewerk,
        registry,
        engine,
        sandboxen,
        uhrDienst,
        archiv,
        archivTimer: null,
        visu: { seiten: visuGeladen.seiten, designs: visuGeladen.designs },
      },
      fehler: [],
    };
  }

  /** Treiber-Karten aus dem Gewerk neu befuellen (Instanzen bleiben). */
  function fuelleKarten(gewerk: Gewerk): void {
    gaZuDp.clear();
    dpZuGa.clear();
    dpts.clear();
    topicZuDp.clear();
    dpZuTopic.clear();
    for (const [gruppe, datei] of gewerk.datenpunkte) {
      for (const [key, def] of Object.entries(datei)) {
        const schluessel = `${gruppe}.${key}`;
        if (def.klasse !== "bus" || !def.adresse) continue;
        if (def.treiber === "knx") {
          gaZuDp.set(def.adresse, { schluessel, typ: def.typ });
          dpZuGa.set(schluessel, def.adresse);
          dpts.set(def.adresse, def.dpt ?? (def.typ === "bool" ? "1.001" : "9.001"));
        } else if (def.treiber === "mqtt") {
          topicZuDp.set(def.adresse, { schluessel, typ: def.typ });
          dpZuTopic.set(schluessel, def.adresse);
        }
      }
    }
  }

  /** Registry-Abos eines Kerns aufbauen (Persistenz, WS, Treiber, Archive). */
  function verdrahte(k: Kern): void {
    // Remanente Werte fortlaufend sichern + Live-Push an die UI (P5-3).
    k.registry.abonniere((e) => {
      if (k.registry.definition(e.schluessel)?.remanent) {
        speicher.sichereWert(e.schluessel, e.wert);
      }
      // JEDES angenommene Schreiben geht raus, auch das wertgleiche (E-4:
      // on-receive, nicht nur on-change). Frueher filterte diese Stelle auf
      // e.geaendert und verschluckte damit genau den Normalfall eines Tasters:
      // zweimal true hintereinander. Ein Bediener sah dann „keine Rueckmeldung",
      // obwohl Wert angenommen und Telegramm gesendet waren. `geaendert` steht
      // jetzt als Feld in der Nachricht — die UI entscheidet selbst.
      if (ws.anzahl > 0) {
        ws.sendeAllen(
          JSON.stringify({
            art: "wert",
            schluessel: e.schluessel,
            wert: e.wert,
            quelle: e.quelle,
            geaendert: e.geaendert,
            ts: k.registry.zeitstempel(e.schluessel) ?? Date.now(),
          }),
        );
      }
    });

    // Engine-/System-Schreibvorgänge auf Bus-Datenpunkte gehen aufs KNX.
    k.registry.abonniere((e) => {
      if (e.quelle === "treiber") return; // kam vom Bus — kein Echo
      const ga = dpZuGa.get(e.schluessel);
      if (ga !== undefined && typeof e.wert !== "string") {
        treiber.sende(ga, e.wert);
      }
    });

    if (mqtt) {
      k.registry.abonniere((e) => {
        if (e.quelle === "treiber") return; // kam vom Broker — kein Echo
        const topic = dpZuTopic.get(e.schluessel);
        if (topic !== undefined) mqtt!.publiziere(topic, wertZuText(e.wert));
      });
    }

    if (k.archiv) {
      // Ein Datenpunkt kann mehrere Archive speisen: Quelle -> IDs einmal beim
      // Bau bilden, damit im Wertstrom nur ein Map-Zugriff noetig ist.
      const quelleZuArchive = new Map<string, string[]>();
      for (const [id, def] of k.archiv.definitionen) {
        const bisher = quelleZuArchive.get(def.quelle);
        if (bisher) bisher.push(id);
        else quelleZuArchive.set(def.quelle, [id]);
      }
      const dienst = k.archiv;
      k.registry.abonniere((e) => {
        if (!e.geaendert) return; // Archive zeichnen Aenderungen auf, kein Rauschen
        const ids = quelleZuArchive.get(e.schluessel);
        if (!ids) return;
        const ts = k.registry.zeitstempel(e.schluessel) ?? Date.now();
        for (const id of ids) dienst.erfasse(id, e.wert, ts);
      });
      // Aufbewahrung: einmal beim Start (der Prozess kann Tage gestanden haben)
      // und danach alle 6 h. unref, damit der Timer den Prozess nie am Leben haelt.
      const geloescht = dienst.raeumeAuf();
      k.archivTimer = setInterval(() => dienst.raeumeAuf(), 6 * 60 * 60 * 1000);
      k.archivTimer.unref?.();
      console.error(
        `Archive: ${dienst.definitionen.size} aktiv auf ${quelleZuArchive.size} Datenpunkt(en)` +
          (geloescht > 0 ? ` — ${geloescht} abgelaufene(r) Punkt(e) aufgeraeumt` : ""),
      );
    }
  }

  /** Remanente Werte einspielen (keine Kaskaden dabei — vor engine.start()). */
  function spieleRemanenteEin(k: Kern): void {
    let wiederhergestellt = 0;
    for (const [schluessel, wert] of speicher.ladeWerte()) {
      if (k.registry.definition(schluessel)?.remanent) {
        if (k.registry.schreibe(schluessel, wert, "system").angenommen) wiederhergestellt++;
      }
    }
    if (wiederhergestellt > 0) {
      console.error(`Persistenz: ${wiederhergestellt} remanente(r) Wert(e) wiederhergestellt`);
    }
  }

  /** Einen Kern stilllegen: Engine, Uhr, Archiv-Timer, Sandboxen. */
  function legeStill(k: Kern): void {
    k.engine.stop();
    k.uhrDienst?.stop();
    if (k.archivTimer) clearInterval(k.archivTimer);
    k.archiv?.schliesse();
    for (const s of k.sandboxen) s.beende();
  }

  const erst = baueKern(dir);
  if (!erst.kern) {
    for (const f of erst.fehler) console.error(`FEHLER: ${f}`);
    return 1;
  }
  let kern: Kern = erst.kern;
  fuelleKarten(kern.gewerk);

  // ---- Treiber: einmal gebaut, ueber Reloads hinweg verbunden ----------------
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
      const erg = kern.registry.schreibe(dp.schluessel, t.wert as Wert, "treiber");
      if (!erg.angenommen) console.error(`WARNUNG: Bus→${dp.schluessel}: ${erg.grund}`);
    },
    onFehler: (m) => console.error(`KNX: ${m}`),
  });

  // ---- MQTT (ADR-0007: Core-Treiber) ----------------------------------------
  const mqttBeobachten = process.env["FACHWERK_MQTT_MODUS"] === "beobachten";
  let mqtt: MqttTreiber | null = null;
  if (topicZuDp.size > 0 && !process.env["FACHWERK_MQTT_HOST"]) {
    // Kein Broker konfiguriert: MQTT-Datenpunkte bleiben stumm statt die
    // Runtime in einen endlosen 127.0.0.1-Verbindungsversuch zu schicken.
    console.error(
      `WARNUNG: ${topicZuDp.size} MQTT-Datenpunkt(e) im Gewerk, aber FACHWERK_MQTT_HOST ` +
        "ist nicht gesetzt — MQTT bleibt deaktiviert.",
    );
  } else if (topicZuDp.size > 0) {
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
        const erg = kern.registry.schreibe(dp.schluessel, wert, "treiber");
        if (!erg.angenommen) console.error(`WARNUNG: MQTT→${dp.schluessel}: ${erg.grund}`);
      },
    });
  }

  // Ersten Kern scharf schalten.
  verdrahte(kern);
  spieleRemanenteEin(kern);
  kern.engine.start();
  kern.uhrDienst?.start();
  if (kern.uhrDienst) {
    console.error(`Uhr-Dienst: speist ${[...uhrDatenpunkte(kern.gewerk).keys()].join(", ")}`);
  }

  // Engine-Zustand (Timer/Baustein-Zustände) aus dem letzten Lauf fortsetzen;
  // Überfälliges feuert einmal nach — kein hängender Ausgang (T-5).
  const engineZustand = speicher.ladeEngine();
  if (engineZustand) {
    kern.engine.stelleWiederHer(engineZustand);
    if (engineZustand.timer.length > 0) {
      console.error(`Persistenz: ${engineZustand.timer.length} Timer fortgesetzt/nachgeholt`);
    }
  }

  /**
   * Reload (P5-10a): neues Gewerk bauen, und NUR wenn das komplett gelingt,
   * den laufenden Kern ersetzen. Schlaegt der Bau fehl, passiert nichts —
   * die alte Logik steuert unveraendert weiter.
   */
  function aktiviere(): { ok: true; dauerMs: number } | { ok: false; fehler: string[] } {
    const start = performance.now();
    const neu = baueKern(dir);
    if (!neu.kern) {
      console.error(`Reload abgelehnt (${neu.fehler.length} Fehler) — alte Logik laeuft weiter.`);
      if (ws.anzahl > 0) {
        ws.sendeAllen(JSON.stringify({ art: "gewerk", ereignis: "fehler", fehler: neu.fehler }));
      }
      return { ok: false, fehler: neu.fehler };
    }
    // Ab hier wird umgeschaltet. Zustand des alten Kerns sichern, bevor er geht.
    const zustand = kern.engine.momentaufnahme();
    const alt = kern;
    legeStill(alt);

    kern = neu.kern;
    fuelleKarten(kern.gewerk);
    verdrahte(kern);
    spieleRemanenteEin(kern);
    kern.engine.start();
    kern.uhrDienst?.start();
    // Laufende Timer und Baustein-Zustaende uebernehmen — ein Treppenlicht
    // darf ueber einen Reload hinweg nicht haengen bleiben (T-5).
    kern.engine.stelleWiederHer(zustand);
    // Neue MQTT-Topics abonnieren (bestehende bleiben — doppelt schadet nicht).
    if (mqtt) for (const topic of topicZuDp.keys()) mqtt.abonniere(topic);
    pumpe();

    const dauerMs = Math.round(performance.now() - start);
    console.error(
      `Gewerk neu aktiviert: „${kern.gewerk.manifest.name}" in ${dauerMs} ms ` +
        `— ${gaZuDp.size} KNX-Zuordnung(en)` +
        (beobachten ? " · Beobachtungsmodus unveraendert aktiv" : ""),
    );
    if (ws.anzahl > 0) {
      ws.sendeAllen(
        JSON.stringify({ art: "gewerk", ereignis: "aktiviert", name: kern.gewerk.manifest.name }),
      );
    }
    return { ok: true, dauerMs };
  }

  /** Datei-Dienst fuer die Editor-API — Pfadpruefung liegt im Kern (core). */
  const dateien: GewerkDateien = {
    lies(pfad) {
      const gepruft = pruefeGewerkPfad(pfad);
      if (!gepruft.ok) return { ok: false, status: 400, grund: gepruft.grund };
      try {
        return { ok: true, inhalt: readFileSync(join(dir, gepruft.rel), "utf8") };
      } catch {
        return { ok: false, status: 404, grund: `Datei nicht lesbar: ${gepruft.rel}` };
      }
    },
    schreibe(pfad, inhalt) {
      const gepruft = pruefeGewerkPfad(pfad);
      if (!gepruft.ok) return { ok: false, status: 400, grund: gepruft.grund };
      const ziel = join(dir, gepruft.rel);
      try {
        mkdirSync(dirname(ziel), { recursive: true });
        writeFileSync(ziel, inhalt, "utf8");
        return { ok: true, rel: gepruft.rel };
      } catch (e) {
        return {
          ok: false,
          status: 500,
          grund: `nicht schreibbar: ${e instanceof Error ? e.message : String(e)}`,
        };
      }
    },
    aktiviere,
  };

  // ---- HTTP-API + WebSocket (P5-2/P5-3) --------------------------------------
  const httpPort = Number(process.env["FACHWERK_HTTP_PORT"] ?? 8300);
  let api: ApiServer | null = null;
  if (httpPort > 0) {
    const uiVerzeichnis = process.env["FACHWERK_UI_DIR"] ?? "/app/ui";
    // Schreibpfad (P5-8): NUR mit Token. Ohne Token bleibt die API lesend —
    // das ist der Schalter, nicht bloss eine Empfehlung.
    const apiToken = process.env["FACHWERK_API_TOKEN"];
    const schreiblimit = Number(process.env["FACHWERK_API_SCHREIBLIMIT"] ?? 30);
    const audit = new AuditProtokoll(join(datenDir, "audit.jsonl"), (m) =>
      console.error(`WARNUNG: ${m}`),
    );
    api = new ApiServer(
      {
        // Getter statt fester Werte: nach einem Reload liefert die API den
        // NEUEN Kern, ohne dass der Server neu gebaut werden muss.
        get gewerk() {
          return kern.gewerk;
        },
        get registry() {
          return kern.registry;
        },
        get visu() {
          return kern.visu;
        },
        get archiv() {
          return kern.archiv ?? undefined;
        },
        dateien,
        schreibenAktiv: apiToken !== undefined && apiToken !== "",
        bremse: new Schreibbremse({ grenze: Number.isFinite(schreiblimit) ? schreiblimit : 30 }),
        audit: (e) => audit.schreibe(e),
        traces: tracePuffer,
        gestartet: Date.now(),
        version: "0.1.0",
        knx: (): TreiberStatus => ({
          verbunden: treiber.verbunden,
          modus: beobachten ? "beobachten" : "normal",
          endpunkt: `${host}:${port}`,
          ...(treiber.adresse !== null ? { adresse: treiber.adresse } : {}),
          ...(treiber.kanal >= 0 ? { kanal: treiber.kanal } : {}),
        }),
        mqtt: (): TreiberStatus | null =>
          mqtt
            ? {
                verbunden: mqtt.verbunden,
                modus: mqtt.beobachtet ? "beobachten" : "normal",
                topics: topicZuDp.size,
              }
            : null,
      },
      {
        port: httpPort,
        ...(existsSync(uiVerzeichnis) ? { uiVerzeichnis } : {}),
        ...(apiToken ? { token: apiToken } : {}),
        onMeldung: (m) => console.error(`API: ${m}`),
      },
    );
    api.setzeUpgrade((req, socket) => {
      if ((req.url ?? "").startsWith("/api/ws")) ws.behandleUpgrade(req, socket);
      else socket.destroy();
    });
    try {
      await api.starte();
      console.error(
        `API/UI: http://0.0.0.0:${httpPort}` +
          (existsSync(uiVerzeichnis) ? "" : " (nur /api — UI nicht gebaut)") +
          (apiToken
            ? ` [Token-Pflicht · Schreibpfad aktiv, max. ${schreiblimit}/10 s]`
            : " [ohne Token — nur lesend]"),
      );
    } catch (e) {
      console.error(`API: Start auf Port ${httpPort} fehlgeschlagen: ${
        e instanceof Error ? e.message : e
      } — läuft ohne API weiter.`);
      api = null;
    }
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
    `fachwerk läuft: „${kern.gewerk.manifest.name}" — ${gaZuDp.size} KNX-Zuordnung(en), Endpunkt ${host}:${port}`,
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
  for (const [gruppe, datei] of kern.gewerk.datenpunkte) {
    for (const [key, def] of Object.entries(datei)) {
      if (def.klasse === "system" && key === "start" && def.typ === "bool") {
        kern.registry.schreibe(`${gruppe}.${key}`, true, "system");
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
      ws.schliesseAlle();
      api?.stoppe();
      void treiber.trenne().then(() => {
        if (timerHandle) clearTimeout(timerHandle);
        speicher.sichereEngine(kern.engine.momentaufnahme()); // letzter Stand (T-5)
        legeStill(kern);
        speicher.schliesse();
        resolve();
      });
    };
    process.on("SIGTERM", stop);
    process.on("SIGINT", stop);
  });
  return 0;
}

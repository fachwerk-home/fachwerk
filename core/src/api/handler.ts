/**
 * API-Handler (P5-2) — reine Funktion Anfrage → Antwort, ohne node:http.
 * So ist die komplette API ohne Socket testbar; der Server (server.ts) ist nur
 * eine dünne Transportschicht. Read-only; der Schreibpfad kommt in P5-8.
 *
 * ADR-0009 A-1: Die UI benutzt EXAKT diese API — keine privilegierten Wege.
 */
import type { Datenpunkt, VisuDesigns, VisuSeite, WertFormat } from "@fachwerk/schema";
import type { Aggregation, ArchivDienst } from "../archiv/dienst.ts";
import type { DatenpunktRegistry, Wert } from "../datenpunkte/registry.ts";
import type { AuditEintrag } from "./audit.ts";
import type { Schreibbremse } from "./schreibbremse.ts";
import type { Gewerk } from "../gewerk/loader.ts";
import type { TracePuffer } from "./trace-puffer.ts";

export interface TreiberStatus {
  verbunden: boolean;
  modus: "normal" | "beobachten";
  endpunkt?: string;
  /** KNX: zugewiesene Individualadresse + Tunnel-Kanal. */
  adresse?: string;
  kanal?: number;
  /** MQTT: Anzahl abonnierter Topics. */
  topics?: number;
}

export interface ApiKontext {
  gewerk: Gewerk;
  registry: DatenpunktRegistry;
  traces: TracePuffer;
  /** Startzeit des Prozesses (ms) für die Uptime. */
  gestartet: number;
  version: string;
  knx: () => TreiberStatus | null;
  mqtt: () => TreiberStatus | null;
  /** Geladene Visu (P5-6); undefined = Gewerk ohne visu/. */
  visu?: { seiten: Map<string, VisuSeite>; designs: VisuDesigns };
  /**
   * Laufender Archiv-Dienst (P5-13b); undefined = Gewerk ohne Archive.
   * Ausdruecklich auch `undefined` erlaubt: die Laufzeit reicht das Feld seit
   * P5-10a als Getter durch, damit ein Reload den Dienst tauschen kann.
   */
  archiv?: ArchivDienst | undefined;
  jetzt?: () => number;

  // ---- Schreibpfad (P5-8) ---------------------------------------------------
  /**
   * Erste Verriegelung: Ohne konfiguriertes FACHWERK_API_TOKEN ist der
   * Schreibpfad KOMPLETT aus. Nicht „offen fuer alle", sondern aus — eine
   * Lese-UI soll man ohne Token betreiben koennen, schreiben nie.
   */
  schreibenAktiv?: boolean;
  /** Rate-Limit (ADR-0009 A-6). Fehlt es, wird nicht gebremst. */
  bremse?: Schreibbremse;
  /** Jeder Versuch wird protokolliert — auch der abgelehnte. */
  audit?: (eintrag: AuditEintrag) => void;

  /** Gewerk-Dateien lesen/schreiben + Reload (P5-10a); fehlt = Editor aus. */
  dateien?: GewerkDateien;
}

/**
 * Zugriff auf die deklarativen Dateien des laufenden Gewerks (P5-10a).
 * Die Umsetzung liegt in der Laufzeit (cli), damit der Handler rein bleibt.
 */
export interface GewerkDateien {
  lies(pfad: string): { ok: true; inhalt: string } | { ok: false; status: number; grund: string };
  schreibe(
    pfad: string,
    inhalt: string,
  ): { ok: true; rel: string } | { ok: false; status: number; grund: string };
  /** Validiert das Gewerk und schaltet bei Erfolg atomar um. */
  aktiviere(): { ok: true; dauerMs: number } | { ok: false; fehler: string[] };
}

export interface ApiAntwort {
  status: number;
  koerper: unknown;
}

export interface DatenpunktSicht {
  schluessel: string;
  name: string;
  klasse: Datenpunkt["klasse"];
  typ: Datenpunkt["typ"];
  treiber?: string;
  adresse?: string;
  dpt?: string;
  protected?: boolean;
  remanent?: boolean;
  /** Format-Default des Datenpunkts (ADR-0011 FMT-1 Ebene 1). */
  format?: WertFormat;
  wert: Wert | null;
  /** ms seit Epoche; null = noch nie geschrieben. */
  ts: number | null;
}

function sicht(
  schluessel: string,
  def: Datenpunkt,
  registry: DatenpunktRegistry,
): DatenpunktSicht {
  return {
    schluessel,
    name: def.name,
    klasse: def.klasse,
    typ: def.typ,
    ...(def.treiber !== undefined ? { treiber: def.treiber } : {}),
    ...(def.adresse !== undefined ? { adresse: def.adresse } : {}),
    ...(def.dpt !== undefined ? { dpt: def.dpt } : {}),
    ...(def.protected ? { protected: true } : {}),
    ...(def.remanent ? { remanent: true } : {}),
    ...(def.format !== undefined ? { format: def.format } : {}),
    wert: registry.get(schluessel) ?? null,
    ts: registry.zeitstempel(schluessel) ?? null,
  };
}

/** Alle Datenpunkte als flache Liste (Schlüssel → Definition). */
function alleDatenpunkte(gewerk: Gewerk): Array<[string, Datenpunkt]> {
  const liste: Array<[string, Datenpunkt]> = [];
  for (const [gruppe, datei] of gewerk.datenpunkte) {
    for (const [key, def] of Object.entries(datei)) liste.push([`${gruppe}.${key}`, def]);
  }
  return liste;
}

const AGGREGATIONEN: readonly string[] = ["mittel", "min", "max", "letzter"];

/**
 * Sendet der zustaendige Treiber diesen Datenpunkt gerade NICHT auf den Bus?
 * Genau dann, wenn er im Beobachtungsmodus laeuft. Die Antwort sagt das
 * ehrlich — ein „angenommen" ohne Hinweis waere eine Luege gegenueber einem
 * Bediener, der auf ein Licht drueckt und nichts passieren sieht.
 */
function sendetNicht(ktx: ApiKontext, def: Datenpunkt): boolean {
  if (def.klasse !== "bus") return false;
  if (def.treiber === "knx") return ktx.knx()?.modus === "beobachten";
  if (def.treiber === "mqtt") return ktx.mqtt()?.modus === "beobachten";
  return false;
}

/**
 * Schreibpfad (P5-8) — dreifach verriegelt und in dieser Reihenfolge:
 * Token-Schalter, Rate-Limit, Existenz, protected, Typ. Die Registry prueft
 * protected und Typ ANSCHLIESSEND noch einmal selbst (zweite Schicht), und
 * die Treiber senden im Beobachtungsmodus ohnehin nie (dritte Schicht).
 * Jeder Versuch wird protokolliert, bevor er beantwortet wird.
 */
/**
 * Gemeinsames Tor vor JEDEM schreibenden Zugriff (Datenpunkte wie Gewerk-
 * Dateien): Token-Schalter und Rate-Limit. Liefert eine Antwort, wenn der
 * Zugriff hier schon endet, sonst null. Jede Ablehnung steht im Audit.
 */
function pruefeSchreibrecht(
  ktx: ApiKontext,
  schluessel: string,
  wert: unknown,
): ApiAntwort | null {
  const jetzt = (ktx.jetzt ?? Date.now)();
  const ab = (status: number, grund: string): ApiAntwort => {
    ktx.audit?.({ ts: jetzt, schluessel, wert, quelle: "api", angenommen: false, grund });
    return { status, koerper: { angenommen: false, fehler: grund } };
  };
  // 1. Schalter: ohne Token-Konfiguration existiert der Schreibpfad nicht.
  if (!ktx.schreibenAktiv) {
    return ab(403, "Schreibpfad ist aus: FACHWERK_API_TOKEN ist nicht gesetzt");
  }
  // 2. Rate-Limit vor allem Fachlichen — auch Raten auf Schluesseln kostet.
  if (ktx.bremse && !ktx.bremse.versuche()) {
    return ab(
      429,
      `Rate-Limit erreicht: mehr als ${ktx.bremse.grenze} Schreibzugriffe in ${ktx.bremse.fensterS} s`,
    );
  }
  return null;
}

function schreibe(ktx: ApiKontext, schluessel: string, koerper: unknown): ApiAntwort {
  const jetzt = (ktx.jetzt ?? Date.now)();
  const wertRoh = (koerper as { wert?: unknown } | null | undefined)?.wert;

  const ab = (status: number, grund: string): ApiAntwort => {
    ktx.audit?.({ ts: jetzt, schluessel, wert: wertRoh ?? null, quelle: "api", angenommen: false, grund });
    return { status, koerper: { angenommen: false, fehler: grund } };
  };

  const tor = pruefeSchreibrecht(ktx, schluessel, wertRoh ?? null);
  if (tor) return tor;
  // 3. Body-Form.
  if (typeof koerper !== "object" || koerper === null || !("wert" in koerper)) {
    return ab(400, "Body muss ein JSON-Objekt mit dem Feld wert sein");
  }
  if (typeof wertRoh !== "boolean" && typeof wertRoh !== "number" && typeof wertRoh !== "string") {
    return ab(400, `wert muss bool, zahl oder text sein, nicht ${typeof wertRoh}`);
  }
  // 4. Existenz.
  const def = ktx.registry.definition(schluessel);
  if (!def) return ab(404, `unbekannter Datenpunkt: ${schluessel}`);
  // 5. protected (SPEC-001) — erste Schicht; die Registry lehnt zusaetzlich ab.
  if (def.protected) {
    return ab(403, `„${schluessel}" ist protected und ueber die API nie schreibbar`);
  }
  // 6. Typ gegen die Definition; 422 ist hier die ehrlichere Antwort als 400,
  //    weil der Body syntaktisch in Ordnung, fachlich aber falsch ist.
  if (
    (def.typ === "bool" && typeof wertRoh !== "boolean") ||
    (def.typ === "zahl" && (typeof wertRoh !== "number" || !Number.isFinite(wertRoh))) ||
    (def.typ === "text" && typeof wertRoh !== "string")
  ) {
    return ab(422, `Typverstoss auf „${schluessel}": erwartet ${def.typ}, erhalten ${typeof wertRoh}`);
  }

  const erg = ktx.registry.schreibe(schluessel, wertRoh, "agent");
  if (!erg.angenommen) return ab(403, erg.grund);

  const hinweis = sendetNicht(ktx, def) ? "beobachten: nicht auf den Bus gesendet" : undefined;
  ktx.audit?.({ ts: jetzt, schluessel, wert: wertRoh, quelle: "api", angenommen: true });
  return {
    status: 200,
    koerper: {
      angenommen: true,
      schluessel,
      wert: wertRoh,
      geaendert: erg.geaendert,
      ...(hinweis !== undefined ? { hinweis } : {}),
    },
  };
}

/** Query-Parameter als endliche Zahl; fehlt er, kommt undefined, sonst null bei Unsinn. */
function optZahl(roh: string | null): number | null | undefined {
  if (roh === null || roh === "") return undefined;
  const n = Number(roh);
  return Number.isFinite(n) ? n : null;
}

/**
 * Raster so grob wählen, dass grob ~1000 Punkte herauskommen. Bewusst eine
 * Überschlagsrechnung auf der Zeitspanne (nicht auf der echten Punktzahl):
 * sie ist billig und schützt die UI vor Antworten mit Millionen Rohpunkten.
 */
function autoRasterS(von: number, bis: number): number {
  return Math.max(1, Math.ceil((bis - von) / 1000 / 1000));
}

/**
 * Beantwortet eine API-Anfrage. `pfad` ohne Query, `query` bereits geparst.
 * Unbekannte Pfade ⇒ 404 (der Server entscheidet, ob er stattdessen die UI
 * ausliefert).
 */
export function beantworte(
  ktx: ApiKontext,
  methode: string,
  pfad: string,
  query: URLSearchParams,
  koerper?: unknown,
): ApiAntwort {
  if (methode === "POST" && pfad.startsWith("/api/datenpunkte/")) {
    return schreibe(ktx, decodeURIComponent(pfad.slice("/api/datenpunkte/".length)), koerper);
  }

  // ---- Gewerk-Dateien + Reload (P5-10a) --------------------------------------
  if (methode === "POST" && pfad === "/api/gewerk/dateien") {
    if (!ktx.dateien) return { status: 501, koerper: { fehler: "Editor-Pfad nicht verfuegbar" } };
    const roh = koerper as { pfad?: unknown; inhalt?: unknown } | null | undefined;
    const zielPfad = typeof roh?.pfad === "string" ? roh.pfad : "";
    const tor = pruefeSchreibrecht(ktx, `gewerk:${zielPfad}`, null);
    if (tor) return tor;
    if (typeof roh?.inhalt !== "string") {
      return { status: 400, koerper: { angenommen: false, fehler: "inhalt muss Text sein" } };
    }
    if (roh.inhalt.length > 1_000_000) {
      return { status: 413, koerper: { angenommen: false, fehler: "inhalt ist zu gross" } };
    }
    const erg = ktx.dateien.schreibe(zielPfad, roh.inhalt);
    const jetzt = (ktx.jetzt ?? Date.now)();
    if (!erg.ok) {
      ktx.audit?.({
        ts: jetzt,
        schluessel: `gewerk:${zielPfad}`,
        wert: null,
        quelle: "api",
        angenommen: false,
        grund: erg.grund,
      });
      return { status: erg.status, koerper: { angenommen: false, fehler: erg.grund } };
    }
    // Was geschrieben wurde, steht im Audit — aber ohne den Inhalt: eine
    // Visu-Datei blaeht das Protokoll sonst pro Speichern um Kilobytes auf.
    ktx.audit?.({
      ts: jetzt,
      schluessel: `gewerk:${erg.rel}`,
      wert: `${roh.inhalt.length} Zeichen`,
      quelle: "api",
      angenommen: true,
    });
    // Bewusst NICHT automatisch aktivieren: geschrieben ist nicht scharf.
    // Erst /api/gewerk/aktivieren schaltet um — sonst reisst ein halb
    // gespeicherter Editor-Stand die laufende Steuerung mit.
    return { status: 200, koerper: { angenommen: true, pfad: erg.rel, aktiviert: false } };
  }

  if (methode === "POST" && pfad === "/api/gewerk/aktivieren") {
    if (!ktx.dateien) return { status: 501, koerper: { fehler: "Editor-Pfad nicht verfuegbar" } };
    const tor = pruefeSchreibrecht(ktx, "gewerk:aktivieren", null);
    if (tor) return tor;
    const jetzt = (ktx.jetzt ?? Date.now)();
    const erg = ktx.dateien.aktiviere();
    ktx.audit?.({
      ts: jetzt,
      schluessel: "gewerk:aktivieren",
      wert: null,
      quelle: "api",
      angenommen: erg.ok,
      ...(erg.ok ? {} : { grund: erg.fehler.join(" | ") }),
    });
    // 422: die Anfrage war in Ordnung, das Gewerk nicht. Die alte Logik laeuft
    // unveraendert weiter — das ist der Sinn der Uebung.
    return erg.ok
      ? { status: 200, koerper: { angenommen: true, dauerMs: erg.dauerMs } }
      : { status: 422, koerper: { angenommen: false, fehler: erg.fehler } };
  }

  if (methode === "GET" && pfad.startsWith("/api/gewerk/dateien/")) {
    if (!ktx.dateien) return { status: 501, koerper: { fehler: "Editor-Pfad nicht verfuegbar" } };
    const erg = ktx.dateien.lies(decodeURIComponent(pfad.slice("/api/gewerk/dateien/".length)));
    return erg.ok
      ? { status: 200, koerper: { inhalt: erg.inhalt } }
      : { status: erg.status, koerper: { fehler: erg.grund } };
  }

  if (methode !== "GET") {
    return { status: 405, koerper: { fehler: `Methode ${methode} nicht erlaubt auf ${pfad}` } };
  }

  if (pfad === "/api/status") {
    const jetzt = (ktx.jetzt ?? Date.now)();
    const dps = alleDatenpunkte(ktx.gewerk);
    return {
      status: 200,
      koerper: {
        gewerk: ktx.gewerk.manifest.name,
        version: ktx.version,
        uptimeMs: jetzt - ktx.gestartet,
        datenpunkte: dps.length,
        logikseiten: ktx.gewerk.logik.size,
        bausteine: ktx.gewerk.bausteine?.size ?? 0,
        traces: { anzahl: ktx.traces.anzahl, kapazitaet: ktx.traces.kapazitaet },
        archive: { anzahl: ktx.archiv?.definitionen.size ?? 0 },
        knx: ktx.knx(),
        mqtt: ktx.mqtt(),
      },
    };
  }

  if (pfad === "/api/archive") {
    const dienst = ktx.archiv;
    const archive = dienst
      ? [...dienst.definitionen].map(([id, def]) => ({
          id,
          name: def.name,
          quelle: def.quelle,
          aufbewahrung_tage: def.aufbewahrung_tage,
          ...(def.mindestabstand_s !== undefined ? { mindestabstand_s: def.mindestabstand_s } : {}),
          punkte: dienst.anzahlPunkte(id),
        }))
      : [];
    return { status: 200, koerper: { anzahl: archive.length, archive } };
  }

  if (pfad.startsWith("/api/archive/")) {
    const id = decodeURIComponent(pfad.slice("/api/archive/".length));
    const dienst = ktx.archiv;
    const def = dienst?.definitionen.get(id);
    if (!dienst || !def) return { status: 404, koerper: { fehler: `unbekanntes Archiv: ${id}` } };

    const jetzt = (ktx.jetzt ?? Date.now)();
    const bisRoh = optZahl(query.get("bis"));
    const vonRoh = optZahl(query.get("von"));
    const rasterRoh = optZahl(query.get("rasterS"));
    if (bisRoh === null || vonRoh === null || rasterRoh === null) {
      return { status: 400, koerper: { fehler: "von/bis/rasterS muessen Zahlen sein" } };
    }
    const bis = bisRoh ?? jetzt;
    const von = vonRoh ?? bis - 24 * 60 * 60 * 1000;
    if (von > bis) return { status: 400, koerper: { fehler: "von liegt hinter bis" } };
    if (rasterRoh !== undefined && rasterRoh < 0) {
      return { status: 400, koerper: { fehler: "rasterS darf nicht negativ sein" } };
    }
    // rasterS=0 ist die ausdrueckliche Bitte um Rohdaten; fehlt der Parameter,
    // rastert die API selbst (sonst kippt eine 24-h-Abfrage die UI um).
    const rasterS = rasterRoh ?? autoRasterS(von, bis);

    const aggRoh = query.get("aggregation");
    if (aggRoh !== null && !AGGREGATIONEN.includes(aggRoh)) {
      return {
        status: 400,
        koerper: { fehler: `unbekannte Aggregation: ${aggRoh} (${AGGREGATIONEN.join(", ")})` },
      };
    }
    const aggregation = (aggRoh ?? "mittel") as Aggregation;

    const punkte = dienst.frage(id, {
      von,
      bis,
      ...(rasterS > 0 ? { rasterS } : {}),
      aggregation,
    });
    return {
      status: 200,
      koerper: {
        id,
        name: def.name,
        quelle: def.quelle,
        von,
        bis,
        rasterS,
        aggregation,
        anzahl: punkte.length,
        punkte,
      },
    };
  }

  if (pfad === "/api/datenpunkte") {
    const filter = (query.get("filter") ?? "").toLowerCase();
    const klasse = query.get("klasse");
    const nurGesetzt = query.get("gesetzt") === "1";
    let liste = alleDatenpunkte(ktx.gewerk).map(([s, d]) => sicht(s, d, ktx.registry));
    if (filter) {
      liste = liste.filter(
        (d) =>
          d.schluessel.toLowerCase().includes(filter) ||
          d.name.toLowerCase().includes(filter) ||
          (d.adresse ?? "").toLowerCase().includes(filter),
      );
    }
    if (klasse) liste = liste.filter((d) => d.klasse === klasse);
    if (nurGesetzt) liste = liste.filter((d) => d.ts !== null);
    return { status: 200, koerper: { anzahl: liste.length, datenpunkte: liste } };
  }

  if (pfad.startsWith("/api/datenpunkte/")) {
    const schluessel = decodeURIComponent(pfad.slice("/api/datenpunkte/".length));
    const def = ktx.registry.definition(schluessel);
    if (!def) return { status: 404, koerper: { fehler: `unbekannter Datenpunkt: ${schluessel}` } };
    return { status: 200, koerper: sicht(schluessel, def, ktx.registry) };
  }

  if (pfad === "/api/traces") {
    const n = Math.min(1000, Math.max(1, Number(query.get("n") ?? 100) || 100));
    return { status: 200, koerper: { traces: ktx.traces.letzte(n) } };
  }

  if (pfad === "/api/visu") {
    // Vertrag fuer den Visu-Client (P5-7): Seiten + Designs, wie geladen.
    const seiten: Record<string, VisuSeite> = {};
    for (const [key, s] of ktx.visu?.seiten ?? []) seiten[key] = s;
    return { status: 200, koerper: { seiten, designs: ktx.visu?.designs ?? {} } };
  }

  if (pfad === "/api/gewerk") {
    const seiten = [...ktx.gewerk.logik.entries()].map(([name, seite]) => ({
      name,
      notizen: seite.notizen ?? null,
      knoten: Object.entries(seite.knoten).map(([id, k]) => ({
        id,
        baustein: k.baustein,
        parameter: k.parameter ?? {},
      })),
      kanten: seite.kanten,
    }));
    const bausteine = [...(ktx.gewerk.bausteine?.values() ?? [])].map((b) => ({
      id: b.manifest.id,
      name: b.manifest.name,
      eingaenge: b.manifest.eingaenge,
      ausgaenge: b.manifest.ausgaenge,
      beschreibung: b.manifest.beschreibung ?? null,
    }));
    return {
      status: 200,
      koerper: { name: ktx.gewerk.manifest.name, seiten, bausteine },
    };
  }

  return { status: 404, koerper: { fehler: `unbekannter Endpunkt: ${pfad}` } };
}

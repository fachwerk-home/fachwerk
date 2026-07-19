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
  /** Laufender Archiv-Dienst (P5-13b); undefined = Gewerk ohne Archive. */
  archiv?: ArchivDienst;
  jetzt?: () => number;
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
): ApiAntwort {
  if (methode !== "GET") {
    return { status: 405, koerper: { fehler: "nur GET (Schreibpfad folgt in P5-8)" } };
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

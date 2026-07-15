/**
 * Logik-Engine (S-4) — setzt ADR-0005 um:
 *  E-1  ereignisgetrieben (Registry-Ereignisse, kein Poll)
 *  E-2  settle before evaluate: jeder Baustein höchstens EINMAL je Kaskade,
 *       ausgewertet in globaler topologischer Ordnung — glitch-frei per
 *       Konstruktion; nicht betroffene Eingänge behalten den letzten Wert
 *  E-2b Kaskade folgt Datenpunkt-Kanten über Seitengrenzen (ein Graph)
 *  E-3  atomare Kaskaden: FIFO-Queue, keine Verschränkung
 *  E-4  Trigger pro Eingang (on-change / on-receive)
 *  E-5  Pflicht-Trace je Kaskade
 *  E-6  Zyklen statisch abgelehnt (Konstruktionsfehler)
 *  E-7  Mehrfach-Schreiber als Warnung
 */
import type { Gewerk } from "../gewerk/loader.ts";
import type {
  DatenpunktRegistry,
  Wert,
  WertEreignis,
} from "../datenpunkte/registry.ts";
import { baueGraph, type LogikGraph, type KnotenId } from "./graph.ts";

export interface TraceSchritt {
  knoten: KnotenId;
  eingaenge: Record<string, Wert | undefined>;
  ausgaenge: Record<string, Wert> | null;
}

export interface TraceSchreiben {
  schluessel: string;
  wert: Wert;
  von: KnotenId;
  angenommen: boolean;
  grund?: string;
}

export interface KaskadenTrace {
  nr: number;
  ausloeser: { schluessel: string; wert: Wert; quelle: string };
  gestartet: number;
  dauerMs: number;
  schritte: TraceSchritt[];
  schreibvorgaenge: TraceSchreiben[];
}

export interface EngineOptionen {
  onTrace?: (t: KaskadenTrace) => void;
  onWarnung?: (meldung: string) => void;
  /** Injizierbare Uhr (Determinismus in Tests). */
  now?: () => number;
}

export class GraphFehler extends Error {
  readonly probleme: string[];
  constructor(probleme: string[]) {
    super(`Logik-Graph ungültig:\n  ${probleme.join("\n  ")}`);
    this.name = "GraphFehler";
    this.probleme = probleme;
  }
}

/** Statische Analyse ohne Engine-Start (für `fachwerk validate`). */
export function analysiereLogik(gewerk: Gewerk): {
  fehler: string[];
  warnungen: string[];
} {
  const g = baueGraph(gewerk);
  const fehler = [...g.fehler];
  if (g.zyklusKnoten.length > 0) {
    fehler.push(
      `Zyklus im Logik-Graphen (E-6): ${g.zyklusKnoten.join(" → ")} — explizit brechen (Verzögerungs-Baustein folgt in späterer Phase)`,
    );
  }
  const warnungen = g.mehrfachSchreiber.map(
    (m) =>
      `Datenpunkt „${m.schluessel}" wird von mehreren Knoten geschrieben (E-7): ${m.schreiber.join(", ")} — last writer wins, sichtbar im Trace`,
  );
  return { fehler, warnungen };
}

export class LogikEngine {
  readonly #graph: LogikGraph;
  readonly #registry: DatenpunktRegistry;
  readonly #topoIndex: Map<KnotenId, number>;
  readonly #opts: EngineOptionen;
  readonly #queue: WertEreignis[] = [];
  #inKaskade = false;
  #traceNr = 0;
  /** Während einer Kaskade: markierte (dirty) Knoten. */
  #dirty = new Set<KnotenId>();
  /** Kaskaden-lokale Werte direkter Port→Port-Kanten. */
  #portWerte = new Map<string, Wert>();
  #abbestellen: (() => void) | null = null;

  constructor(gewerk: Gewerk, registry: DatenpunktRegistry, opts: EngineOptionen = {}) {
    this.#graph = baueGraph(gewerk);
    this.#registry = registry;
    this.#opts = opts;

    const probleme = [...this.#graph.fehler];
    if (this.#graph.zyklusKnoten.length > 0) {
      probleme.push(`Zyklus (E-6): ${this.#graph.zyklusKnoten.join(" → ")}`);
    }
    if (probleme.length > 0) throw new GraphFehler(probleme);

    for (const m of this.#graph.mehrfachSchreiber) {
      opts.onWarnung?.(
        `Mehrfach-Schreiber (E-7) auf „${m.schluessel}": ${m.schreiber.join(", ")}`,
      );
    }

    this.#topoIndex = new Map(this.#graph.topoOrdnung.map((id, i) => [id, i]));
  }

  /** Engine an die Registry koppeln (E-1). */
  start(): void {
    this.#abbestellen ??= this.#registry.abonniere((e) => this.#aufEreignis(e));
  }

  stop(): void {
    this.#abbestellen?.();
    this.#abbestellen = null;
  }

  #aufEreignis(e: WertEreignis): void {
    if (e.quelle === "logik") return; // interne Schreibvorgänge behandelt die Kaskade selbst
    this.#queue.push(e); // FIFO (E-3)
    if (!this.#inKaskade) this.#verarbeiteQueue();
  }

  #verarbeiteQueue(): void {
    this.#inKaskade = true;
    try {
      let e: WertEreignis | undefined;
      while ((e = this.#queue.shift()) !== undefined) {
        this.#kaskade(e); // läuft vollständig zu Ende, bevor die nächste startet
      }
    } finally {
      this.#inKaskade = false;
    }
  }

  /** Markiert die Leser eines Datenpunkts gemäß Trigger-Semantik (E-4). */
  #markiereLeser(schluessel: string, geaendert: boolean): void {
    for (const leser of this.#graph.dpLeser.get(schluessel) ?? []) {
      if (leser.trigger === "on-receive" || geaendert) {
        this.#dirty.add(leser.knoten);
      }
    }
  }

  #kaskade(ausloeser: WertEreignis): void {
    const now = this.#opts.now ?? Date.now;
    const gestartet = now();
    const schritte: TraceSchritt[] = [];
    const schreibvorgaenge: TraceSchreiben[] = [];

    this.#dirty = new Set();
    this.#portWerte = new Map();
    this.#markiereLeser(ausloeser.schluessel, ausloeser.geaendert);

    // Ein Vorwärtsdurchlauf in topologischer Ordnung genügt: Schreibvorgänge
    // einer Auswertung markieren nur topologisch spätere Knoten (Zyklen sind
    // statisch ausgeschlossen). => „settle before evaluate", jeder Knoten ≤ 1×.
    for (const id of this.#graph.topoOrdnung) {
      if (!this.#dirty.has(id)) continue;
      const knoten = this.#graph.knoten.get(id)!;

      const eingaenge: Record<string, Wert | undefined> = {};
      for (const e of knoten.eingaenge) {
        eingaenge[e.port] =
          e.quelle.art === "dp"
            ? this.#registry.get(e.quelle.schluessel) // frisch ODER letzter bekannter Wert
            : this.#portWerte.get(`${e.quelle.knoten}.${e.quelle.port}`);
      }

      const ausgaenge = knoten.baustein.rechne(eingaenge);
      schritte.push({ knoten: id, eingaenge, ausgaenge });
      if (ausgaenge === null) continue;

      for (const a of knoten.ausgaenge) {
        const wert = ausgaenge[a.port];
        if (wert === undefined) continue;
        if (a.ziel.art === "dp") {
          const erg = this.#registry.schreibe(a.ziel.schluessel, wert, "logik");
          schreibvorgaenge.push({
            schluessel: a.ziel.schluessel,
            wert,
            von: id,
            angenommen: erg.angenommen,
            ...(erg.angenommen ? {} : { grund: erg.grund }),
          });
          if (erg.angenommen) this.#markiereLeser(a.ziel.schluessel, erg.geaendert);
        } else {
          // Direkte Port→Port-Kante: kaskadenlokal, feuert bei jeder Auswertung.
          this.#portWerte.set(`${id}.${a.port}`, wert);
          this.#dirty.add(a.ziel.knoten);
          if ((this.#topoIndex.get(a.ziel.knoten) ?? -1) < (this.#topoIndex.get(id) ?? 0)) {
            // Statisch unmöglich (Zyklus) — defensiver Backstop.
            throw new GraphFehler([`Rückwärtskante zur Laufzeit: ${id} → ${a.ziel.knoten}`]);
          }
        }
      }
    }

    this.#opts.onTrace?.({
      nr: ++this.#traceNr,
      ausloeser: {
        schluessel: ausloeser.schluessel,
        wert: ausloeser.wert,
        quelle: ausloeser.quelle,
      },
      gestartet,
      dauerMs: now() - gestartet,
      schritte,
      schreibvorgaenge,
    });
  }
}

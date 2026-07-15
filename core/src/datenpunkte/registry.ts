/**
 * Datenpunkt-Registry (S-3, SPEC-001): hält die Laufzeitwerte aller
 * Datenpunkte eines Gewerks im Speicher und meldet Wert-Ereignisse.
 * Persistenz (Remanenz/SQLite, ADR-0006) kommt später UNTER diese
 * Schnittstelle — sie ändert sie nicht.
 */
import type { Datenpunkt } from "@fachwerk/schema";
import type { Gewerk } from "../gewerk/loader.ts";

export type Wert = boolean | number | string;

/** Woher ein Schreibzugriff stammt — Grundlage der protected-Durchsetzung. */
export type SchreibQuelle = "treiber" | "logik" | "system" | "agent";

export interface WertEreignis {
  /** Voller Schlüssel: <gruppe>.<key>. */
  schluessel: string;
  wert: Wert;
  alt: Wert | undefined;
  /** false bei wertgleichem Schreiben — Basis für on-change vs. on-receive (E-4). */
  geaendert: boolean;
  quelle: SchreibQuelle;
}

export type SchreibErgebnis =
  | { angenommen: true; geaendert: boolean }
  | { angenommen: false; grund: string };

const TYP_PRUEFUNG: Record<Datenpunkt["typ"], (w: Wert) => boolean> = {
  bool: (w) => typeof w === "boolean",
  zahl: (w) => typeof w === "number" && Number.isFinite(w),
  text: (w) => typeof w === "string",
};

export class DatenpunktRegistry {
  readonly #definitionen = new Map<string, Datenpunkt>();
  readonly #werte = new Map<string, Wert>();
  readonly #abonnenten = new Set<(e: WertEreignis) => void>();

  constructor(gewerk: Gewerk) {
    for (const [gruppe, datei] of gewerk.datenpunkte) {
      for (const [key, def] of Object.entries(datei)) {
        const schluessel = `${gruppe}.${key}`;
        this.#definitionen.set(schluessel, def);
        if (def.initial !== undefined) {
          // Initialwerte sind bereits schema-validiert; kein Ereignis beim Start.
          this.#werte.set(schluessel, def.initial);
        }
      }
    }
  }

  alleSchluessel(): string[] {
    return [...this.#definitionen.keys()];
  }

  definition(schluessel: string): Datenpunkt | undefined {
    return this.#definitionen.get(schluessel);
  }

  get(schluessel: string): Wert | undefined {
    return this.#werte.get(schluessel);
  }

  /**
   * Schreibt einen Wert. Typverstöße und protected-Verletzungen werden
   * abgelehnt und benannt — nie stilles Verbiegen (SPEC-001).
   */
  schreibe(schluessel: string, wert: Wert, quelle: SchreibQuelle): SchreibErgebnis {
    const def = this.#definitionen.get(schluessel);
    if (!def) {
      return { angenommen: false, grund: `unbekannter Datenpunkt „${schluessel}"` };
    }
    if (def.protected && (quelle === "logik" || quelle === "agent")) {
      return {
        angenommen: false,
        grund: `„${schluessel}" ist protected — Schreiben durch ${quelle} nicht erlaubt (Plan § 4.2)`,
      };
    }
    if (!TYP_PRUEFUNG[def.typ](wert)) {
      return {
        angenommen: false,
        grund: `Typverstoß auf „${schluessel}": erwartet ${def.typ}, erhalten ${typeof wert}`,
      };
    }

    const alt = this.#werte.get(schluessel);
    const geaendert = alt !== wert;
    this.#werte.set(schluessel, wert);

    const ereignis: WertEreignis = { schluessel, wert, alt, geaendert, quelle };
    for (const cb of this.#abonnenten) cb(ereignis);

    return { angenommen: true, geaendert };
  }

  /** Meldet JEDES angenommene Schreiben (auch wertgleich — E-4). */
  abonniere(cb: (e: WertEreignis) => void): () => void {
    this.#abonnenten.add(cb);
    return () => this.#abonnenten.delete(cb);
  }
}

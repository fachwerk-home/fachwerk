/**
 * Ringpuffer für Ausführungs-Traces (P5-2). Unabhängig vom stdout-Log: Die
 * API/UI braucht die letzten N Kaskaden auch dann, wenn das Log auf „kompakt"
 * steht. Feste Kapazität, damit ein Dauerbetrieb nie Speicher frisst.
 */
import type { KaskadenTrace } from "../logik/engine.ts";

export class TracePuffer {
  readonly #kapazitaet: number;
  #eintraege: KaskadenTrace[] = [];

  constructor(kapazitaet = 500) {
    this.#kapazitaet = Math.max(1, kapazitaet);
  }

  hinzu(trace: KaskadenTrace): void {
    this.#eintraege.push(trace);
    if (this.#eintraege.length > this.#kapazitaet) {
      this.#eintraege = this.#eintraege.slice(-this.#kapazitaet);
    }
  }

  /** Die letzten `n` Traces, älteste zuerst. */
  letzte(n = 100): KaskadenTrace[] {
    return this.#eintraege.slice(-Math.max(0, n));
  }

  get anzahl(): number {
    return this.#eintraege.length;
  }

  get kapazitaet(): number {
    return this.#kapazitaet;
  }
}

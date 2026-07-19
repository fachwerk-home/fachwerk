/**
 * Schreibbremse (P5-8, ADR-0009 A-6 minimal): gleitendes Fenster ueber die
 * Zeitpunkte der letzten Schreibversuche. Token-weit, nicht pro Datenpunkt —
 * ein durchgedrehter Client soll das Gewerk nicht fluten koennen, egal auf
 * wie viele Datenpunkte er das verteilt.
 *
 * Gezaehlt wird jeder VERSUCH, der die Bremse erreicht, nicht nur die
 * erfolgreichen: sonst waere Raten auf unbekannten Schluesseln gratis.
 */
export interface SchreibbremseOptionen {
  /** Erlaubte Versuche je Fenster. */
  grenze: number;
  /** Fensterlaenge in ms (Default 10 000). */
  fensterMs?: number;
  jetzt?: () => number;
}

export class Schreibbremse {
  readonly #grenze: number;
  readonly #fensterMs: number;
  readonly #jetzt: () => number;
  #zeiten: number[] = [];

  constructor({ grenze, fensterMs, jetzt }: SchreibbremseOptionen) {
    this.#grenze = grenze;
    this.#fensterMs = fensterMs ?? 10_000;
    this.#jetzt = jetzt ?? Date.now;
  }

  /** true = durchgelassen (und verbucht); false = Grenze erreicht. */
  versuche(): boolean {
    const t = this.#jetzt();
    this.#zeiten = this.#zeiten.filter((z) => t - z < this.#fensterMs);
    if (this.#zeiten.length >= this.#grenze) return false;
    this.#zeiten.push(t);
    return true;
  }

  /** Fuer die Fehlermeldung: wie viele pro Fenster erlaubt sind. */
  get grenze(): number {
    return this.#grenze;
  }

  get fensterS(): number {
    return Math.round(this.#fensterMs / 1000);
  }
}

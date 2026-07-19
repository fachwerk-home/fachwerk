/** Letzter Wert je Schlüssel gewinnt; geleert wird gesammelt pro Animationsframe. */
export class BildPuffer<T> {
  readonly #werte = new Map<string, T>();

  schreibe(schluessel: string, wert: T): void {
    this.#werte.set(schluessel, wert);
  }

  entleere(): Map<string, T> {
    const inhalt = new Map(this.#werte);
    this.#werte.clear();
    return inhalt;
  }

  get anzahl(): number {
    return this.#werte.size;
  }
}

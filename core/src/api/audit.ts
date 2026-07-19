/**
 * Audit-Protokoll (P5-8): jeder Schreibversuch ueber die API landet als eine
 * JSON-Zeile in audit.jsonl — auch und gerade die abgelehnten. Wer bei einer
 * Gebaeudesteuerung nur die erfolgreichen Zugriffe protokolliert, sieht den
 * Einbruchsversuch nicht, sondern nur den gelungenen Einbruch.
 *
 * Append-only per Konstruktion: ausschliesslich appendFileSync, nie lesen,
 * nie kuerzen, nie ersetzen. Keine Rotation in v1 (siehe SPEC/Doku) — der
 * Betreiber schneidet die Datei extern, wenn sie ihm zu gross wird.
 */
import { appendFileSync } from "node:fs";

export interface AuditEintrag {
  /** ms seit Epoche. */
  ts: number;
  schluessel: string;
  wert: unknown;
  quelle: "api";
  angenommen: boolean;
  grund?: string;
}

export class AuditProtokoll {
  readonly #pfad: string;
  readonly #onFehler: ((m: string) => void) | undefined;

  constructor(pfad: string, onFehler?: (m: string) => void) {
    this.#pfad = pfad;
    this.#onFehler = onFehler;
  }

  /**
   * Haengt einen Eintrag an. Ein volles oder schreibgeschuetztes Dateisystem
   * darf die Laufzeit nicht toeten (Prozessgrenze) — es wird gemeldet, nicht
   * geworfen.
   */
  schreibe(eintrag: AuditEintrag): void {
    try {
      appendFileSync(this.#pfad, `${JSON.stringify(eintrag)}\n`, "utf8");
    } catch (e) {
      this.#onFehler?.(`Audit nicht schreibbar: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

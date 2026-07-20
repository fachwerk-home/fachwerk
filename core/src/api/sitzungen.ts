/**
 * Sitzungs-Ablage (P5-12) auf node:sqlite — eigene Datei neben dem
 * Laufzeitzustand. Bewusst NICHT in zustand.sqlite: Sitzungen sind
 * Betriebsgeheimnis, der Zustand ist es nicht; wer Backups des einen macht,
 * will das andere selten mitkopieren.
 *
 * Gespeichert wird ausschliesslich der SHA-256 des Tokens (siehe auth.ts).
 */
import { DatabaseSync } from "node:sqlite";
import type { Scope, SitzungsSpeicher } from "./auth.ts";
import { istScope } from "./auth.ts";

export class SqliteSitzungen implements SitzungsSpeicher {
  readonly #db: DatabaseSync;

  constructor(pfad: string) {
    this.#db = new DatabaseSync(pfad);
    this.#db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS sitzungen (
        token_hash TEXT PRIMARY KEY,
        nutzer     TEXT NOT NULL,
        scopes     TEXT NOT NULL,
        ablauf     INTEGER NOT NULL
      );
    `);
  }

  lege(hash: string, nutzer: string, scopes: readonly Scope[], ablauf: number): void {
    this.#db
      .prepare(
        "INSERT INTO sitzungen(token_hash, nutzer, scopes, ablauf) VALUES (?, ?, ?, ?) " +
          "ON CONFLICT(token_hash) DO UPDATE SET nutzer = excluded.nutzer, " +
          "scopes = excluded.scopes, ablauf = excluded.ablauf",
      )
      .run(hash, nutzer, JSON.stringify(scopes), ablauf);
  }

  finde(hash: string): { nutzer: string; scopes: Scope[]; ablauf: number } | null {
    const zeile = this.#db
      .prepare("SELECT nutzer, scopes, ablauf FROM sitzungen WHERE token_hash = ?")
      .get(hash) as { nutzer: string; scopes: string; ablauf: number } | undefined;
    if (!zeile) return null;
    let scopes: Scope[] = [];
    try {
      const roh: unknown = JSON.parse(zeile.scopes);
      // Was in der Datei steht, ist Eingabe wie jede andere: filtern statt glauben.
      if (Array.isArray(roh)) scopes = roh.filter((s): s is Scope => typeof s === "string" && istScope(s));
    } catch {
      scopes = [];
    }
    return { nutzer: zeile.nutzer, scopes, ablauf: zeile.ablauf };
  }

  loesche(hash: string): void {
    this.#db.prepare("DELETE FROM sitzungen WHERE token_hash = ?").run(hash);
  }

  raeumeAuf(jetzt: number): number {
    const erg = this.#db.prepare("DELETE FROM sitzungen WHERE ablauf <= ?").run(jetzt);
    return Number(erg.changes);
  }

  /** Alle Sitzungen eines Nutzers beenden (CLI: Passwort geaendert). */
  loescheNutzer(nutzer: string): number {
    const erg = this.#db.prepare("DELETE FROM sitzungen WHERE nutzer = ?").run(nutzer);
    return Number(erg.changes);
  }

  schliesse(): void {
    this.#db.close();
  }
}

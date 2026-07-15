/**
 * Persistenz (P4-2, ADR-0006): SQLite als eingebetteter Zustandsspeicher —
 * remanente Datenpunkt-Werte (SPEC-001) und Engine-Zustand (Timer +
 * Baustein-Zustände, SPEC-002 T-5/T-6). Nutzt node:sqlite (keine nativen
 * Abhängigkeiten). Git bleibt die Definition, SQLite ist NUR Laufzeitzustand.
 *
 * Timer über Neustarts: die Engine speichert Restlaufzeiten (monotone Uhr,
 * T-4). Der Speicher merkt sich den Wanduhr-Zeitpunkt der Sicherung und zieht
 * beim Laden die Downtime ab — nur HIER spielt die Wanduhr eine Rolle.
 */
import { DatabaseSync } from "node:sqlite";
import type { Wert } from "../datenpunkte/registry.ts";

export interface EngineMomentaufnahme {
  timer: Array<{ besitzer: string; id: string; restMs: number }>;
  zustaende: Array<{ knoten: string; zustand: Record<string, Wert> }>;
}

export interface SpeicherOptionen {
  /** Wanduhr, injizierbar für Tests (Default Date.now). */
  now?: () => number;
}

export class Speicher {
  readonly #db: DatabaseSync;
  readonly #now: () => number;

  constructor(pfad: string, opts: SpeicherOptionen = {}) {
    this.#db = new DatabaseSync(pfad);
    this.#now = opts.now ?? Date.now;
    this.#db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS werte (
        schluessel TEXT PRIMARY KEY,
        wert       TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS engine_zustand (
        id             INTEGER PRIMARY KEY CHECK (id = 1),
        json           TEXT NOT NULL,
        gespeichert_um INTEGER NOT NULL
      );
    `);
  }

  schliesse(): void {
    this.#db.close();
  }

  // ---- Remanente Datenpunkt-Werte -------------------------------------------

  sichereWert(schluessel: string, wert: Wert): void {
    this.#db
      .prepare(
        "INSERT INTO werte(schluessel, wert) VALUES (?, ?) " +
          "ON CONFLICT(schluessel) DO UPDATE SET wert = excluded.wert",
      )
      .run(schluessel, JSON.stringify(wert));
  }

  ladeWerte(): Map<string, Wert> {
    const zeilen = this.#db.prepare("SELECT schluessel, wert FROM werte").all() as Array<{
      schluessel: string;
      wert: string;
    }>;
    return new Map(zeilen.map((z) => [z.schluessel, JSON.parse(z.wert) as Wert]));
  }

  // ---- Engine-Zustand (Timer + Baustein-Zustände) ----------------------------

  sichereEngine(m: EngineMomentaufnahme): void {
    this.#db
      .prepare(
        "INSERT INTO engine_zustand(id, json, gespeichert_um) VALUES (1, ?, ?) " +
          "ON CONFLICT(id) DO UPDATE SET json = excluded.json, " +
          "gespeichert_um = excluded.gespeichert_um",
      )
      .run(JSON.stringify(m), this.#now());
  }

  /** Lädt den Engine-Zustand; Timer-Restlaufzeiten sind um die Downtime korrigiert. */
  ladeEngine(): EngineMomentaufnahme | null {
    const zeile = this.#db
      .prepare("SELECT json, gespeichert_um FROM engine_zustand WHERE id = 1")
      .get() as { json: string; gespeichert_um: number } | undefined;
    if (!zeile) return null;
    const m = JSON.parse(zeile.json) as EngineMomentaufnahme;
    const downtime = Math.max(0, this.#now() - zeile.gespeichert_um);
    return {
      timer: m.timer.map((t) => ({ ...t, restMs: Math.max(0, t.restMs - downtime) })),
      zustaende: m.zustaende,
    };
  }
}

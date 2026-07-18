import { DatabaseSync } from "node:sqlite";
import type { ArchivDefinition } from "@fachwerk/schema";

export interface ArchivDienstOptionen {
  pfad: string;
  archive: Map<string, ArchivDefinition>;
  jetzt?: () => number;
}

export interface RohPunkt {
  ts: number;
  wert: number;
}

export interface AggregiertPunkt {
  ts: number;
  wert: number;
  min: number;
  max: number;
  anzahl: number;
}

export type Aggregation = "mittel" | "min" | "max" | "letzter";

export interface AbfrageOptionen {
  von: number;
  bis: number;
  rasterS?: number;
  aggregation?: Aggregation;
}

export class ArchivDienst {
  readonly #db: DatabaseSync;
  readonly #archive: Map<string, ArchivDefinition>;
  readonly #jetzt: () => number;
  
  public ignoriertZaehler = 0;

  constructor({ pfad, archive, jetzt }: ArchivDienstOptionen) {
    this.#db = new DatabaseSync(pfad);
    this.#archive = archive;
    this.#jetzt = jetzt ?? Date.now;

    this.#db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS punkte (
        archiv_id TEXT,
        ts        INTEGER,
        wert      REAL
      );
      CREATE INDEX IF NOT EXISTS idx_punkte ON punkte(archiv_id, ts);
      PRAGMA user_version = 1;
    `);
  }

  schliesse(): void {
    this.#db.close();
  }

  erfasse(id: string, wert: boolean | number | string, ts?: number): void {
    try {
      if (!this.#archive.has(id)) {
        this.ignoriertZaehler++;
        return;
      }
      
      let numWert: number;
      if (typeof wert === "boolean") {
        numWert = wert ? 1 : 0;
      } else if (typeof wert === "number") {
        numWert = wert;
      } else {
        this.ignoriertZaehler++;
        return;
      }
      
      if (!Number.isFinite(numWert)) {
          this.ignoriertZaehler++;
          return;
      }

      const timestamp = ts ?? this.#jetzt();
      const def = this.#archive.get(id)!;

      if (def.mindestabstand_s !== undefined && def.mindestabstand_s > 0) {
        const letzter = this.#db.prepare("SELECT ts FROM punkte WHERE archiv_id = ? ORDER BY ts DESC LIMIT 1").get(id) as {ts: number} | undefined;
        if (letzter && timestamp - letzter.ts < def.mindestabstand_s * 1000) {
            return;
        }
      }

      this.#db.prepare("INSERT INTO punkte (archiv_id, ts, wert) VALUES (?, ?, ?)").run(id, timestamp, numWert);
    } catch (e) {
      this.ignoriertZaehler++;
    }
  }

  frage(id: string, { von, bis, rasterS, aggregation = "mittel" }: AbfrageOptionen): Array<RohPunkt | AggregiertPunkt> {
    if (von > bis) return [];
    if (!this.#archive.has(id)) return [];

    const stmt = this.#db.prepare("SELECT ts, wert FROM punkte WHERE archiv_id = ? AND ts >= ? AND ts <= ? ORDER BY ts ASC");
    const roh = stmt.all(id, von, bis) as RohPunkt[];

    if (!rasterS || roh.length === 0) {
      return roh;
    }

    const fensterMs = rasterS * 1000;
    const erg: AggregiertPunkt[] = [];
    
    let aktuellesFenster = Math.floor(roh[0].ts / fensterMs) * fensterMs;
    let min = roh[0].wert;
    let max = roh[0].wert;
    let sum = 0;
    let anzahl = 0;
    let letzter = roh[0].wert;
    
    for (const p of roh) {
        const f = Math.floor(p.ts / fensterMs) * fensterMs;
        if (f > aktuellesFenster) {
            let w = letzter;
            if (aggregation === "mittel") w = sum / anzahl;
            else if (aggregation === "min") w = min;
            else if (aggregation === "max") w = max;
            
            erg.push({ ts: aktuellesFenster, wert: w, min, max, anzahl });
            
            aktuellesFenster = f;
            min = p.wert;
            max = p.wert;
            sum = p.wert;
            anzahl = 1;
            letzter = p.wert;
        } else {
            if (p.wert < min) min = p.wert;
            if (p.wert > max) max = p.wert;
            sum += p.wert;
            anzahl++;
            letzter = p.wert;
        }
    }
    
    let w = letzter;
    if (aggregation === "mittel") w = sum / anzahl;
    else if (aggregation === "min") w = min;
    else if (aggregation === "max") w = max;
    erg.push({ ts: aktuellesFenster, wert: w, min, max, anzahl });
    
    return erg;
  }

  raeumeAuf(): number {
    let geloescht = 0;
    const jetzt = this.#jetzt();
    
    const stmt = this.#db.prepare("DELETE FROM punkte WHERE archiv_id = ? AND ts < ?");
    
    for (const [id, def] of this.#archive.entries()) {
      const aufbewahrungMs = def.aufbewahrung_tage * 24 * 60 * 60 * 1000;
      const grenze = jetzt - aufbewahrungMs;
      
      const res = stmt.run(id, grenze);
      geloescht += res.changes;
    }
    
    return geloescht;
  }
}

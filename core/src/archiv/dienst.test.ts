import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { ArchivDienst, type ArchivDienstOptionen, type RohPunkt, type AggregiertPunkt } from "./dienst.ts";
import type { ArchivDefinition } from "@fachwerk/schema";

function setup(opts: Partial<ArchivDienstOptionen> = {}, pfad = ":memory:"): ArchivDienst {
  const archive = new Map<string, ArchivDefinition>();
  archive.set("a1", { name: "A1", quelle: "a.1", aufbewahrung_tage: 10 });
  archive.set("a2", { name: "A2", quelle: "a.2", aufbewahrung_tage: 10, mindestabstand_s: 60 });
  
  return new ArchivDienst({
    pfad,
    archive,
    ...opts
  });
}

test("ArchivDienst: erfassen + Roh-Abfrage (Grenzen inklusive)", () => {
  let time = 1000;
  const dienst = setup({ jetzt: () => time });
  
  dienst.erfasse("a1", 10.5, 100);
  dienst.erfasse("a1", 20.0, 200);
  dienst.erfasse("a1", 30.0, 300);
  
  const roh = dienst.frage("a1", { von: 100, bis: 300 }) as RohPunkt[];
  assert.equal(roh.length, 3);
  assert.deepEqual(roh[0], { ts: 100, wert: 10.5 });
  assert.deepEqual(roh[2], { ts: 300, wert: 30.0 });
  
  const roh2 = dienst.frage("a1", { von: 150, bis: 250 }) as RohPunkt[];
  assert.equal(roh2.length, 1);
  assert.deepEqual(roh2[0], { ts: 200, wert: 20.0 });
  
  dienst.schliesse();
});

test("ArchivDienst: bool wandeln, falsche IDs und Text ignorieren", () => {
  const dienst = setup();
  
  dienst.erfasse("a1", true, 100);
  dienst.erfasse("a1", false, 200);
  dienst.erfasse("unbekannt", 42, 300);
  dienst.erfasse("a1", "text wert", 400); // wird ignoriert
  
  assert.equal(dienst.ignoriertZaehler, 2);
  
  const roh = dienst.frage("a1", { von: 0, bis: 1000 }) as RohPunkt[];
  assert.equal(roh.length, 2);
  assert.equal(roh[0].wert, 1);
  assert.equal(roh[1].wert, 0);
  
  dienst.schliesse();
});

test("ArchivDienst: mindestabstand_s verwirft dichte Werte", () => {
  const dienst = setup();
  
  dienst.erfasse("a2", 1, 100000);
  dienst.erfasse("a2", 2, 110000); // +10s -> ignoriert
  dienst.erfasse("a2", 3, 160000); // +60s -> ok
  
  const roh = dienst.frage("a2", { von: 0, bis: 200000 }) as RohPunkt[];
  assert.equal(roh.length, 2);
  assert.equal(roh[0].wert, 1);
  assert.equal(roh[1].wert, 3);
  
  dienst.schliesse();
});

test("ArchivDienst: Raster-Aggregation", () => {
  const dienst = setup();
  // fenster: 60s = 60000ms
  dienst.erfasse("a1", 10, 10000);
  dienst.erfasse("a1", 20, 20000);
  dienst.erfasse("a1", 60, 50000);
  // Fenster 60000-119999 leer
  dienst.erfasse("a1", 5, 120000);
  dienst.erfasse("a1", 1, 150000);
  
  const mittel = dienst.frage("a1", { von: 0, bis: 200000, rasterS: 60 }) as AggregiertPunkt[];
  assert.equal(mittel.length, 2);
  assert.equal(mittel[0].ts, 0);
  assert.equal(mittel[0].wert, 30);
  assert.equal(mittel[0].min, 10);
  assert.equal(mittel[0].max, 60);
  assert.equal(mittel[0].anzahl, 3);
  
  assert.equal(mittel[1].ts, 120000);
  assert.equal(mittel[1].wert, 3);
  
  const mins = dienst.frage("a1", { von: 0, bis: 200000, rasterS: 60, aggregation: "min" }) as AggregiertPunkt[];
  assert.equal(mins[0].wert, 10);
  assert.equal(mins[1].wert, 1);
  
  const maxs = dienst.frage("a1", { von: 0, bis: 200000, rasterS: 60, aggregation: "max" }) as AggregiertPunkt[];
  assert.equal(maxs[0].wert, 60);
  assert.equal(maxs[1].wert, 5);
  
  const letzter = dienst.frage("a1", { von: 0, bis: 200000, rasterS: 60, aggregation: "letzter" }) as AggregiertPunkt[];
  assert.equal(letzter[0].wert, 60);
  assert.equal(letzter[1].wert, 1);
  
  dienst.schliesse();
});

test("ArchivDienst: raeumeAuf löscht Altes", () => {
  let jetzt = 1000 * 60 * 60 * 24 * 20; // Tag 20
  const dienst = setup({ jetzt: () => jetzt });
  
  dienst.erfasse("a1", 1, 1000 * 60 * 60 * 24 * 5); // Tag 5 (zu alt, aufbewahrung_tage=10)
  dienst.erfasse("a1", 2, 1000 * 60 * 60 * 24 * 15); // Tag 15 (ok)
  
  const geloescht = dienst.raeumeAuf();
  assert.equal(geloescht, 1);
  
  const roh = dienst.frage("a1", { von: 0, bis: jetzt }) as RohPunkt[];
  assert.equal(roh.length, 1);
  assert.equal(roh[0].wert, 2);
  
  dienst.schliesse();
});

test("ArchivDienst: Persistenz über Neustart", () => {
  const dbFile = join(tmpdir(), "fw-test-" + randomBytes(4).toString("hex") + ".sqlite");
  
  let dienst = setup({}, dbFile);
  dienst.erfasse("a1", 42, 100);
  dienst.schliesse();
  
  dienst = setup({}, dbFile);
  const roh = dienst.frage("a1", { von: 0, bis: 200 }) as RohPunkt[];
  assert.equal(roh.length, 1);
  assert.equal(roh[0].wert, 42);
  dienst.schliesse();
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { ladeArchive } from "./laden.ts";
import type { DatenpunktDatei } from "@fachwerk/schema";

test("ladeArchive: fehlendes Verzeichnis ist kein Fehler", () => {
  const { archive, fehler } = ladeArchive("/gibts/nicht/wirklich");
  assert.equal(archive.size, 0);
  assert.equal(fehler.length, 0);
});

test("ladeArchive: liest, validiert und meldet Fehler", () => {
  const dir = join(tmpdir(), "fw-test-" + randomBytes(4).toString("hex"));
  mkdirSync(join(dir, "archiv"), { recursive: true });
  
  // Gut
  writeFileSync(join(dir, "archiv", "gut.yaml"), `
klima_aussen:
  name: Außen
  quelle: aussen.temp
  aufbewahrung_tage: 365
  mindestabstand_s: 60
`);

  // Kaputt (Schema)
  writeFileSync(join(dir, "archiv", "kaputt.yaml"), `
fehlerhaft:
  name: Fehler
  # quelle fehlt
  aufbewahrung_tage: -5
`);

  // Duplikat
  writeFileSync(join(dir, "archiv", "duplikat.yaml"), `
klima_aussen:
  name: Nochmal
  quelle: aussen.temp2
  aufbewahrung_tage: 10
`);

  const { archive, fehler } = ladeArchive(dir);
  
  assert.equal(archive.size, 1);
  assert.equal(archive.get("klima_aussen")?.quelle, "aussen.temp");
  
  assert.equal(fehler.length, 3); // missing quelle, negative tage, and duplikat
  
  const duplikatFehler = fehler.find(f => f.meldung.includes("nicht eindeutig"));
  assert.ok(duplikatFehler);
  assert.equal(duplikatFehler.datei, "archiv/duplikat.yaml");
  assert.equal(duplikatFehler.pfad, "/klima_aussen");

  rmSync(dir, { recursive: true, force: true });
});

test("ladeArchive: prüft Datenpunkte wenn übergeben", () => {
  const dir = join(tmpdir(), "fw-test-" + randomBytes(4).toString("hex"));
  mkdirSync(join(dir, "archiv"), { recursive: true });
  
  writeFileSync(join(dir, "archiv", "test.yaml"), `
p1:
  name: P1
  quelle: gut.zahl
  aufbewahrung_tage: 10
p2:
  name: P2
  quelle: gut.bool
  aufbewahrung_tage: 10
p3:
  name: P3
  quelle: schlecht.text
  aufbewahrung_tage: 10
p4:
  name: P4
  quelle: gibts.nicht
  aufbewahrung_tage: 10
`);

  const datenpunkte = new Map<string, DatenpunktDatei>();
  datenpunkte.set("gut", {
    "zahl": { name: "Z", klasse: "intern", typ: "zahl" },
    "bool": { name: "B", klasse: "intern", typ: "bool" },
  });
  datenpunkte.set("schlecht", {
    "text": { name: "T", klasse: "intern", typ: "text" },
  });

  const { archive, fehler } = ladeArchive(dir, datenpunkte);
  
  assert.equal(archive.size, 2);
  assert.ok(archive.has("p1"));
  assert.ok(archive.has("p2"));
  
  assert.equal(fehler.length, 2);
  assert.ok(fehler.find(f => f.pfad === "/p3/quelle" && f.meldung.includes("Typ 'zahl' oder 'bool'")));
  assert.ok(fehler.find(f => f.pfad === "/p4/quelle" && f.meldung.includes("existiert nicht")));

  rmSync(dir, { recursive: true, force: true });
});

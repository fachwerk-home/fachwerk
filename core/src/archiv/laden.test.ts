import { expect, test } from "vitest";
import { join } from "node:path";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { ladeArchive } from "./laden.ts";
import type { DatenpunktDatei } from "@fachwerk/schema";

test("ladeArchive: fehlendes Verzeichnis ist kein Fehler", () => {
  const { archive, fehler } = ladeArchive("/gibts/nicht/wirklich");
  expect(archive.size).toBe(0);
  expect(fehler.length).toBe(0);
});

test("ladeArchive: liest, validiert und meldet Fehler", () => {
  const dir = join(tmpdir(), "fw-test-" + randomBytes(4).toString("hex"));
  mkdirSync(join(dir, "archiv"), { recursive: true });
  
  // Gut — Dateiname bewusst VOR duplikat.yaml (Dateien werden sortiert
  // gelesen; die erste Definition einer ID gewinnt).
  writeFileSync(join(dir, "archiv", "a_gut.yaml"), `
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
  
  expect(archive.size).toBe(1);
  expect(archive.get("klima_aussen")?.quelle).toBe("aussen.temp");
  
  expect(fehler.length).toBe(3); // missing quelle, negative tage, and duplikat
  
  const duplikatFehler = fehler.find(f => f.meldung.includes("nicht eindeutig"));
  expect(duplikatFehler).toBeTruthy();
  expect(duplikatFehler!.datei).toBe("archiv/duplikat.yaml");
  expect(duplikatFehler!.pfad).toBe("/klima_aussen");

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
  
  expect(archive.size).toBe(2);
  expect(archive.has("p1")).toBeTruthy();
  expect(archive.has("p2")).toBeTruthy();
  
  expect(fehler.length).toBe(2);
  expect(fehler.find(f => f.pfad === "/p3/quelle" && f.meldung.includes("Typ 'zahl' oder 'bool'"))).toBeTruthy();
  expect(fehler.find(f => f.pfad === "/p4/quelle" && f.meldung.includes("existiert nicht"))).toBeTruthy();

  rmSync(dir, { recursive: true, force: true });
});

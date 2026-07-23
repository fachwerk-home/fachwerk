/**
 * Der Katalog ist nur brauchbar, wenn er vollständig und stabil ist: fehlt ein
 * Baustein, gibt die Triage eine falsche Antwort („kann Fachwerk nicht"),
 * obwohl es ihn längst gibt. Deshalb erzwingt der erste Test die Deckung.
 */
import { expect, test } from "vitest";
import { findeBaustein } from "./bausteine.ts";
import { baueKatalog, fehlendeKatalogEintraege, katalogTypen } from "./katalog.ts";

test("jeder Stdlib-Baustein ist im Katalog beschrieben", () => {
  expect(fehlendeKatalogEintraege()).toEqual([]);
});

test("der Katalog beschreibt keine Bausteine, die es nicht gibt", () => {
  const unbekannt = katalogTypen().filter((t) => findeBaustein(t) === undefined);
  expect(unbekannt).toEqual([]);
});

test("Katalog ist deterministisch und sortiert", () => {
  const a = baueKatalog(1);
  const b = baueKatalog(1);
  expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  const typen = a.bausteine.map((x) => x.typ);
  expect(typen).toEqual([...typen].sort());
});

test("jeder Eintrag trägt Zweck und Stichworte — sonst hilft er der Triage nicht", () => {
  for (const b of baueKatalog(1).bausteine) {
    expect(b.zweck.length, b.typ).toBeGreaterThan(10);
    expect(b.stichworte.length, b.typ).toBeGreaterThan(1);
    // Ein Baustein ohne jeden Ausgang waere sinnlos — ausser die Ports sind
    // konfig-variabel (ADR-0012), dann steht die Regel im Klartext daneben.
    if (b.ausgaenge.length === 0) expect(b.konfigVariabel, b.typ).toBeDefined();
    if (b.eingaenge.length === 0) expect(b.konfigVariabel, b.typ).toBeDefined();
  }
});

test("konfig-variable Bausteine erklären ihre Port-Regel", () => {
  const katalog = baueKatalog(1);
  const variabel = katalog.bausteine.filter((b) => b.konfigVariabel !== undefined);
  // ADR-0012: EXTRACT, SPLIT, JOIN, VERGLEICH_LISTE, WENN_LISTE, MATRIX
  expect(variabel.map((b) => b.typ)).toEqual([
    "EXTRACT", "JOIN", "MATRIX", "SPLIT", "VERGLEICH_LISTE", "WENN_LISTE",
  ]);
  for (const b of variabel) expect(b.konfigVariabel!.length).toBeGreaterThan(20);
});

test("Visu-Katalog deckt alle Presets und Widgets des Schemas ab", () => {
  const elemente = baueKatalog(1).visu.elemente;
  const presets = elemente.filter((e) => e.art === "preset").map((e) => e.name).sort();
  const widgets = elemente.filter((e) => e.art === "widget").map((e) => e.name).sort();
  // Muss der Union in schema/src/visu.ts entsprechen.
  expect(presets).toEqual([
    "label", "navigation", "schalter", "statusanzeige", "symbol", "taster", "wertanzeige",
  ]);
  expect(widgets).toEqual(["diagramm", "slider"]);
});

test("der entkoppelte Baustein ist als solcher markiert (E-6)", () => {
  const verz = baueKatalog(1).bausteine.find((b) => b.typ === "VERZOEGERUNG");
  expect(verz?.entkoppelt).toBe(true);
});

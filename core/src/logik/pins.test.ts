/**
 * Baustein-Pins (ADR-0014 V-3) und die harte protected-Regel.
 */
import { expect, test } from "vitest";
import { bausteinHash, istHerkunft, pruefePins, type BausteinPins } from "./pins.ts";
import { DatenpunktRegistry } from "../datenpunkte/registry.ts";
import type { Gewerk } from "../gewerk/loader.ts";
import type { DatenpunktDatei } from "@fachwerk/schema";

// ---- Hash -------------------------------------------------------------------

test("gleicher Inhalt ergibt gleichen Hash, geaenderter einen anderen", () => {
  const a = bausteinHash(new Map([["baustein.js", "export default () => null;"]]));
  const b = bausteinHash(new Map([["baustein.js", "export default () => null;"]]));
  const c = bausteinHash(new Map([["baustein.js", "export default () => 1;"]]));
  expect(a).toBe(b);
  expect(a).not.toBe(c);
});

test("Zeilenenden aendern den Hash nicht (Windows/Linux-Checkout)", () => {
  const lf = bausteinHash(new Map([["m.yaml", "a: 1\nb: 2\n"]]));
  const crlf = bausteinHash(new Map([["m.yaml", "a: 1\r\nb: 2\r\n"]]));
  expect(lf).toBe(crlf);
});

test("die Aufteilung auf Dateien ist nicht verschiebbar", () => {
  // Ohne Laengenpraefix haetten diese beiden denselben Hash.
  const eins = bausteinHash(new Map([["a", "xy"], ["b", "z"]]));
  const zwei = bausteinHash(new Map([["a", "x"], ["b", "yz"]]));
  expect(eins).not.toBe(zwei);
});

test("die Reihenfolge der Dateien ist egal", () => {
  const a = bausteinHash(new Map([["a", "1"], ["b", "2"]]));
  const b = bausteinHash(new Map([["b", "2"], ["a", "1"]]));
  expect(a).toBe(b);
});

// ---- Pruefung ---------------------------------------------------------------

const ist = (sha: string, version = 1): Map<string, { version: number; sha256: string }> =>
  new Map([["lbs1", { version, sha256: sha }]]);

test("passender Pin ist ok und traegt die Herkunft", () => {
  const pins: BausteinPins = { lbs1: { version: 1, sha256: "abc", herkunft: "community" } };
  const lage = pruefePins(ist("abc"), pins);
  expect(lage.blockiert).toBe(false);
  expect(lage.ergebnisse[0]).toMatchObject({ art: "ok", herkunft: "community" });
});

test("abweichender Hash blockiert den Start", () => {
  const pins: BausteinPins = { lbs1: { version: 1, sha256: "abc", herkunft: "eigen" } };
  const lage = pruefePins(ist("XXX"), pins);
  expect(lage.blockiert).toBe(true);
  expect(lage.ergebnisse[0]?.meldung).toContain("Inhalt weicht");
});

test("abweichende Version blockiert ebenfalls", () => {
  const pins: BausteinPins = { lbs1: { version: 2, sha256: "abc", herkunft: "eigen" } };
  const lage = pruefePins(ist("abc", 1), pins);
  expect(lage.blockiert).toBe(true);
  expect(lage.ergebnisse[0]?.meldung).toContain("Version weicht");
});

test("ein Baustein ohne Pin blockiert NICHT, wird aber genannt", () => {
  const lage = pruefePins(ist("abc"), {});
  expect(lage.blockiert).toBe(false);
  expect(lage.ungepinnt).toEqual(["lbs1"]);
  expect(lage.ergebnisse[0]?.art).toBe("fehlt");
});

test("ein Pin ohne Baustein blockiert nicht — Entfernen ist kein Angriff", () => {
  const pins: BausteinPins = { weg: { version: 1, sha256: "abc", herkunft: "eigen" } };
  const lage = pruefePins(new Map(), pins);
  expect(lage.blockiert).toBe(false);
  expect(lage.ergebnisse[0]).toMatchObject({ id: "weg", art: "verwaist" });
});

test("istHerkunft kennt genau die drei Stufen", () => {
  expect(istHerkunft("eigen")).toBe(true);
  expect(istHerkunft("community")).toBe(true);
  expect(istHerkunft("unverifiziert")).toBe(true);
  expect(istHerkunft("vertrauenswuerdig")).toBe(false);
});

// ---- Die harte Regel (ADR-0014 V-3) ----------------------------------------

test("KEIN Baustein schreibt je einen protected-Datenpunkt", () => {
  // V-3 verlangt das ausdruecklich fuer Bausteine mit netz-Faehigkeit. Die
  // Registry ist strenger: sie lehnt JEDEN Schreibzugriff aus der Logik ab,
  // unabhaengig von Faehigkeiten. Dieser Test haelt die Zusage fest, damit
  // niemand sie spaeter fuer "harmlose" Bausteine aufweicht.
  const datenpunkte: DatenpunktDatei = {
    tuer: { name: "Haustuer", klasse: "intern", typ: "bool", protected: true },
    licht: { name: "Licht", klasse: "intern", typ: "bool" },
  };
  const gewerk: Gewerk = {
    manifest: { format: 1, name: "T" },
    datenpunkte: new Map([["flur", datenpunkte]]),
    logik: new Map(),
  };
  const registry = new DatenpunktRegistry(gewerk);

  const ausLogik = registry.schreibe("flur.tuer", true, "logik");
  expect(ausLogik.angenommen).toBe(false);
  if (!ausLogik.angenommen) expect(ausLogik.grund).toContain("protected");
  expect(registry.get("flur.tuer") ?? null).toBeNull();

  // Gegenprobe: ohne protected geht es, der Weg ist also nicht generell zu.
  expect(registry.schreibe("flur.licht", true, "logik").angenommen).toBe(true);
});

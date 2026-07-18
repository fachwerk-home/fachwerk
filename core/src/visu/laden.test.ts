import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { validateDatenpunktDatei, validateVisuDesigns, validateVisuSeite } from "@fachwerk/schema";
import { ladeVisu } from "./laden.ts";

const BEISPIEL = join(import.meta.dirname, "../../../examples/minimal");
let tmp: string | null = null;
afterEach(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); tmp = null; });

function gewerk(dateien: Record<string, string>): string {
  tmp = mkdtempSync(join(tmpdir(), "fachwerk-visu-test-"));
  for (const [rel, inhalt] of Object.entries(dateien)) {
    const pfad = join(tmp, rel);
    mkdirSync(join(pfad, ".."), { recursive: true });
    writeFileSync(pfad, inhalt, "utf8");
  }
  return tmp;
}

describe("Visu-Schemas", () => {
  it("akzeptiert eine minimale Seite und Designs", () => {
    expect(validateVisuDesigns({ standard: { text: "#fff" } })).toBe(true);
    expect(validateVisuSeite({
      typ: "seite", name: "Test", basis: "tablet",
      groessen: { tablet: { w: 100, h: 100 } },
      elemente: { wert: { preset: "wertanzeige", placements: { tablet: { x: 0, y: 0, w: 10, h: 10 } } } },
    })).toBe(true);
  });

  it("validiert das optionale Datenpunkt-Format", () => {
    const basis = { sensor: { name: "Sensor", klasse: "intern", typ: "zahl" } };
    expect(validateDatenpunktDatei({ sensor: { ...basis.sensor, format: { einheit: "°C", dezimalstellen: 1 } } })).toBe(true);
    expect(validateDatenpunktDatei({ sensor: { ...basis.sensor, format: { dezimalstellen: -1 } } })).toBe(false);
  });

  it("verwirft unbekannte Presets, Mischtypen und ungültige Formate", () => {
    const basis = { typ: "seite", name: "Test", basis: "tablet", groessen: { tablet: { w: 100, h: 100 } } };
    expect(validateVisuSeite({ ...basis, elemente: { x: { preset: "fremd" } } })).toBe(false);
    expect(validateVisuSeite({ ...basis, elemente: { x: { preset: "label", widget: "slider" } } })).toBe(false);
    expect(validateVisuSeite({ ...basis, elemente: { x: { preset: "label", format: { dezimalstellen: -1 } } } })).toBe(false);
  });
});

describe("ladeVisu", () => {
  it("lädt die handgeschriebene Beispiel-Visu fehlerfrei", () => {
    const ergebnis = ladeVisu(BEISPIEL);
    expect(ergebnis.fehler).toEqual([]);
    expect(ergebnis.seiten.get("wohnzimmer")?.basis).toBe("tablet");
    expect(ergebnis.designs.aktiv?.hintergrund).toBe("#fc0");
  });

  it("behandelt ein Gewerk ohne visu als gültig", () => {
    expect(ladeVisu(gewerk({}))).toEqual({ seiten: new Map(), designs: {}, fehler: [] });
  });

  it("benennt Datei, Element und Grund für kaputte Querbezüge", () => {
    const dir = gewerk({
      "visu/designs.yaml": "standard: { text: '#fff' }\n",
      "visu/seiten/kaputt.yaml": [
        "typ: seite", "name: Kaputt", "basis: desktop", "groessen:", "  tablet: { w: 100, h: 100 }",
        "elemente:", "  licht:", "    preset: schalter", "    design: fehlt", "    bindungen: { status: wohnen.fehlt }",
        "    placements:", "      handy: { x: 0, y: 0, w: 10, h: 10 }", "",
      ].join("\n"),
    });
    const ergebnis = ladeVisu(dir, { definition: () => undefined });
    expect(ergebnis.fehler).toEqual(expect.arrayContaining([
      expect.objectContaining({ datei: "visu/seiten/kaputt.yaml", grund: expect.stringContaining("Basis-Breakpoint") }),
      expect.objectContaining({ datei: "visu/seiten/kaputt.yaml", element: "licht", grund: expect.stringContaining("Design") }),
      expect.objectContaining({ datei: "visu/seiten/kaputt.yaml", element: "licht", grund: expect.stringContaining("Breakpoint") }),
      expect.objectContaining({ datei: "visu/seiten/kaputt.yaml", element: "licht", grund: expect.stringContaining("Datenpunkt") }),
    ]));
  });

  it("meldet Schemafehler eines Elements adressiert", () => {
    const dir = gewerk({
      "visu/seiten/falsch.yaml": "typ: seite\nname: Falsch\nbasis: tablet\ngroessen:\n  tablet: { w: 100, h: 100 }\nelemente:\n  kaputt:\n    preset: unbekannt\n",
    });
    expect(ladeVisu(dir).fehler[0]).toEqual(expect.objectContaining({ datei: "visu/seiten/falsch.yaml", element: "kaputt" }));
  });
});

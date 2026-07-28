import { describe, expect, it } from "vitest";
import { VISU_SYMBOL_LABELS, VISU_SYMBOL_NAMEN, visuSymbolVorhanden } from "./icons.tsx";

describe("Fachwerk-SVG-Symbole", () => {
  it("stellt einen geschlossenen Gebäudesymbol-Satz mit Labels bereit", () => {
    expect(VISU_SYMBOL_NAMEN.length).toBeGreaterThanOrEqual(40);
    expect(new Set(VISU_SYMBOL_NAMEN).size).toBe(VISU_SYMBOL_NAMEN.length);
    for (const name of VISU_SYMBOL_NAMEN) expect(VISU_SYMBOL_LABELS[name]).toBeTruthy();
  });

  it("erkennt gültige und unbekannte Symbolnamen", () => {
    expect(visuSymbolVorhanden("licht_an")).toBe(true);
    expect(visuSymbolVorhanden("nicht_da")).toBe(false);
    expect(visuSymbolVorhanden(undefined)).toBe(false);
  });
});

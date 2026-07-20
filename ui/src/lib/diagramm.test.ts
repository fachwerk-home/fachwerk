import { describe, expect, it } from "vitest";
import { pfadFuerPunkte, rasterFuerBreite, skalaFuer } from "./diagramm.tsx";

describe("Diagramm-Helfer", () => {
  it("polstert konstante Werte sichtbar auf", () => {
    expect(skalaFuer([{ ts: 1, wert: 12 }])).toEqual({ min: 11, max: 13 });
  });

  it("wählt ein gröberes Raster für schmale Flächen", () => {
    const von = 0;
    const bis = 24 * 60 * 60 * 1000;
    expect(rasterFuerBreite(von, bis, 300)).toBeGreaterThan(rasterFuerBreite(von, bis, 900));
  });

  it("wandelt Punkte in einen SVG-Pfad im Zeichenbereich", () => {
    expect(pfadFuerPunkte(
      [{ ts: 0, wert: 0 }, { ts: 100, wert: 10 }],
      0,
      100,
      200,
      100,
      { min: 0, max: 10 },
    )).toBe("M 0.0 100.0 L 200.0 0.0");
  });
});

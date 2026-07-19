import { describe, expect, it } from "vitest";
import { berechneFenster } from "./virtualisierung.ts";

describe("berechneFenster", () => {
  it("liefert nur den sichtbaren Ausschnitt samt Puffer", () => {
    expect(berechneFenster({
      anzahl: 1_000,
      scrollTop: 14_000,
      viewportHoehe: 280,
      zeilenHoehe: 28,
      puffer: 5,
    })).toEqual({ start: 495, ende: 515, oben: 13_860, unten: 13_580 });
  });

  it("macht auch die letzte von mehr als 864 Zeilen erreichbar", () => {
    const fenster = berechneFenster({
      anzahl: 1_000,
      scrollTop: 28_000,
      viewportHoehe: 280,
      zeilenHoehe: 28,
    });
    expect(fenster.ende).toBe(1_000);
    expect(fenster.unten).toBe(0);
  });

  it("behandelt eine leere Liste", () => {
    expect(berechneFenster({
      anzahl: 0,
      scrollTop: 0,
      viewportHoehe: 300,
      zeilenHoehe: 28,
    })).toEqual({ start: 0, ende: 0, oben: 0, unten: 0 });
  });
});

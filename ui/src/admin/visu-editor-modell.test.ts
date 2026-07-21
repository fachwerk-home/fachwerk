import { describe, expect, it } from "vitest";
import type { VisuSeite } from "../../../schema/src/visu.ts";
import { dupliziereElemente, fuegeElementEin, mussVorAktivierenSpeichern, rastere, verschiebeElemente } from "./visu-editor-modell.ts";

const SEITE: VisuSeite = {
  typ: "seite",
  name: "Test",
  basis: "tablet",
  groessen: {
    tablet: { w: 800, h: 600 },
    handy: { w: 390, h: 844 },
  },
  elemente: {
    licht: {
      preset: "schalter",
      placements: { tablet: { x: 40, y: 40, w: 120, h: 80 } },
    },
  },
};

describe("Visu-Editor-Modell", () => {
  it("rastet Koordinaten sauber ein", () => {
    expect(rastere(23, 10)).toBe(20);
    expect(rastere(26, 10)).toBe(30);
  });

  it("materialisiert beim Verschieben geerbte Breakpoint-Platzierungen", () => {
    const neu = verschiebeElemente(SEITE, ["licht"], "handy", 13, 17, 10);
    expect(neu.elemente.licht?.placements?.handy).toEqual({ x: 50, y: 60, w: 120, h: 80 });
    expect(SEITE.elemente.licht?.placements?.handy).toBeUndefined();
  });

  it("legt Palette-Elemente mit Defaults an", () => {
    const { seite, key } = fuegeElementEin(SEITE, { art: "preset", preset: "wertanzeige" }, "tablet", 31, 44, 10);
    expect(key).toBe("wertanzeige");
    expect(seite.elemente[key]?.bindungen?.display).toBe("wohnen.zaehler");
    expect(seite.elemente[key]?.placements?.tablet?.x).toBe(30);
  });

  it("dupliziert Elemente mit neuem Schlüssel und Versatz", () => {
    const { seite, keys } = dupliziereElemente(SEITE, ["licht"], "tablet", 10);
    expect(keys).toEqual(["licht_kopie"]);
    expect(seite.elemente.licht_kopie?.placements?.tablet?.x).toBe(60);
  });

  it("fordert vor Aktivieren einen Save, wenn der Visu-Editor dirty ist", () => {
    expect(mussVorAktivierenSpeichern(true)).toBe(true);
    expect(mussVorAktivierenSpeichern(false)).toBe(false);
  });
});

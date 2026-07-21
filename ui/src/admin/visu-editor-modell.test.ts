import { describe, expect, it } from "vitest";
import type { VisuSeite } from "../../../schema/src/visu.ts";
import {
  bestaetigeSeitenwechsel,
  dupliziereElemente,
  fehlendeVisuEditorScopes,
  fuegeElementEin,
  rastere,
  sollDragHistorieMerken,
  verschiebeElemente,
} from "./visu-editor-modell.ts";

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

  it("fragt vor einem Seitenwechsel mit ungespeicherten Änderungen", () => {
    let gefragt = 0;
    expect(bestaetigeSeitenwechsel(false, () => {
      gefragt += 1;
      return false;
    })).toBe(true);
    expect(gefragt).toBe(0);
    expect(bestaetigeSeitenwechsel(true, () => {
      gefragt += 1;
      return false;
    })).toBe(false);
    expect(gefragt).toBe(1);
    expect(bestaetigeSeitenwechsel(true, () => true)).toBe(true);
  });

  it("merkt Drag-Historie erst bei echter Bewegung und nur einmal", () => {
    expect(sollDragHistorieMerken(false, 0, 0)).toBe(false);
    expect(sollDragHistorieMerken(false, 10, 0)).toBe(true);
    expect(sollDragHistorieMerken(true, 10, 0)).toBe(false);
  });

  it("erkennt fehlende Schreib- und Aktivier-Scopes vor dem Speichern", () => {
    expect(fehlendeVisuEditorScopes(["read", "operate"])).toEqual(["write:gewerk", "activate:dev"]);
    expect(fehlendeVisuEditorScopes(["read", "operate", "write:gewerk", "activate:dev"])).toEqual([]);
  });
});

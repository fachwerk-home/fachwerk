import { describe, expect, it } from "vitest";
import type { VisuElement, VisuSeite } from "../../../schema/src/visu.ts";
import {
  designFuer,
  formatierterWert,
  placementFuer,
  startSeite,
  waehleBreakpoint,
} from "./modell.ts";

const SEITE: VisuSeite = {
  typ: "seite",
  name: "Test",
  basis: "tablet",
  groessen: {
    handy: { w: 390, h: 844 },
    tablet: { w: 1280, h: 800 },
    desktop: { w: 1920, h: 1080 },
  },
  elemente: {},
};

describe("Breakpoint und Placement", () => {
  it("wählt den größten passenden Breakpoint und sonst die Basis", () => {
    expect(waehleBreakpoint(SEITE, 1400)).toBe("tablet");
    expect(waehleBreakpoint(SEITE, 390)).toBe("handy");
    expect(waehleBreakpoint(SEITE, 375)).toBe("tablet");
  });

  it("erbt Basis-Geometrie und überschreibt Placement-Felder samt Format", () => {
    const element: VisuElement = {
      preset: "wertanzeige",
      placements: {
        tablet: { x: 40, y: 50, w: 120, h: 80, format: { einheit: "°C", dezimalstellen: 1 } },
        handy: { x: 10, sichtbar: false, format: { dezimalstellen: 0 } },
      },
    };
    expect(placementFuer(element, "handy", "tablet")).toEqual({
      x: 10, y: 50, w: 120, h: 80, sichtbar: false,
      format: { einheit: "°C", dezimalstellen: 0 },
    });
    expect(placementFuer(element, "desktop", "tablet")?.x).toBe(40);
  });
});

describe("Design und Format", () => {
  it("mischt das statusabhängige Design über die Basis", () => {
    const element: VisuElement = {
      preset: "statusanzeige",
      design: "standard",
      design_je_wert: [{ wenn: true, design: "aktiv" }],
    };
    expect(designFuer(element, {
      standard: { text: "#eee", rand: { staerke: 1, farbe: "#444" } },
      aktiv: { text: "#000", hintergrund: "#fc0", rand: { farbe: "#fc0" } },
    }, true)).toEqual({
      text: "#000", hintergrund: "#fc0", rand: { staerke: 1, farbe: "#fc0" },
    });
  });

  it("nutzt die Core-Kaskade für Datenpunkt, Element und Placement", () => {
    const werte = new Map([
      ["raum.temp", { wert: 21.37, format: { einheit: "°C", dezimalstellen: 2 } }],
      ["aussen.temp", { wert: 8.4 }],
    ]);
    expect(formatierterWert("raum.temp", werte, { skalierung: 2 }, { dezimalstellen: 1 }))
      .toBe("42.7 °C");
    expect(formatierterWert("raum.temp", werte, { template: "{fixed(#,1)} / {fixed(#{aussen.temp},0)}" }))
      .toBe("21.4 / 8");
  });
});

describe("Seitenstart", () => {
  it("respektiert eine gültige URL-Seite und fällt alphabetisch zurück", () => {
    const seiten = {
      popup: { ...SEITE, typ: "popup" as const },
      zimmer: SEITE,
      anfang: { ...SEITE, name: "Anfang" },
    };
    expect(startSeite(seiten, "zimmer")).toBe("zimmer");
    expect(startSeite(seiten, "popup")).toBe("anfang");
    expect(startSeite(seiten)).toBe("anfang");
  });
});

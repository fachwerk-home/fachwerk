import { describe, expect, it } from "vitest";
import type { VisuElement, VisuSeite } from "../../../schema/src/visu.ts";
import {
  designFuer,
  elementAnzeige,
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
  it("wählt den größten passenden Breakpoint und sonst den kleinsten", () => {
    expect(waehleBreakpoint(SEITE, 1400)).toBe("tablet");
    expect(waehleBreakpoint(SEITE, 390)).toBe("handy");
    expect(waehleBreakpoint(SEITE, 375)).toBe("handy");
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

describe("Elementtext", () => {
  const werte = new Map([["raum.temp", { wert: 21.37, format: { einheit: "°C", dezimalstellen: 1 } }]]);

  it("priorisiert gesetzten Text im Client vor Wert und Schlüssel", () => {
    const anzeige = elementAnzeige("client", "raum_temp", { preset: "label", text: "Wohnzimmer" }, werte);
    expect(anzeige).toMatchObject({ label: "Wohnzimmer", wert: "", hatText: true, hatWert: false });
  });

  it("zeigt im Client bei leerem Text ohne Bindung keinen technischen Schlüssel", () => {
    const anzeige = elementAnzeige("client", "raum_temp", { preset: "label", text: "   " }, werte);
    expect(anzeige).toMatchObject({ label: "", wert: "", hatText: false, hatWert: false });
  });

  it("zeigt im Client ohne Text und ohne Bindung keinen technischen Schlüssel", () => {
    const anzeige = elementAnzeige("client", "raum_temp", { preset: "label" }, werte);
    expect(anzeige).toMatchObject({ label: "", wert: "", hatText: false, hatWert: false });
  });

  it("behält im Client bei Text und Display-Bindung Text als Label und Wert separat", () => {
    const anzeige = elementAnzeige("client", "raum_temp", { preset: "wertanzeige", text: "Innen", bindungen: { display: "raum.temp" } }, werte);
    expect(anzeige).toMatchObject({ label: "Innen", wert: "21.4 °C", hatText: true, hatWert: true });
  });

  it("behält im Client bei leerem Text und Display-Bindung nur den Wert separat", () => {
    const anzeige = elementAnzeige("client", "raum_temp", { preset: "wertanzeige", text: "", bindungen: { display: "raum.temp" } }, werte);
    expect(anzeige).toMatchObject({ label: "", wert: "21.4 °C", hatText: false, hatWert: true });
  });

  it("behält im Client ohne Text und mit Display-Bindung nur den Wert separat", () => {
    const anzeige = elementAnzeige("client", "raum_temp", { preset: "wertanzeige", bindungen: { display: "raum.temp" } }, werte);
    expect(anzeige).toMatchObject({ label: "", wert: "21.4 °C", hatText: false, hatWert: true });
  });

  it("behält im Editor bei leerem Text den bisherigen lesbaren Schlüssel", () => {
    const anzeige = elementAnzeige("editor", "raum_temp", { preset: "label", text: "   " }, werte);
    expect(anzeige).toMatchObject({ label: "Raum temp", wert: "", hatText: false, hatWert: false });
  });

  it("behält im Editor ohne Text und mit Display-Bindung Schlüssel und Wert separat", () => {
    const anzeige = elementAnzeige("editor", "raum_temp", { preset: "wertanzeige", bindungen: { display: "raum.temp" } }, werte);
    expect(anzeige).toMatchObject({ label: "Raum temp", wert: "21.4 °C", hatText: false, hatWert: true });
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

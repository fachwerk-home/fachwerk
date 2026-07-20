import { describe, expect, it } from "vitest";
import type { VisuSeite } from "../../../schema/src/visu.ts";
import { inhaltZumSpeichern, seiteZuYaml } from "./visu-yaml.ts";

const SEITE: VisuSeite = {
  typ: "seite",
  name: "Wohnzimmer",
  basis: "tablet",
  groessen: { tablet: { w: 1280, h: 800 } },
  elemente: {
    licht: {
      preset: "schalter",
      bindungen: { set: "wohnen.taster", status: "wohnen.licht" },
      aktionen: { kurz: { art: "umschalten" } },
      placements: { tablet: { x: 40, y: 50, w: 120, h: 80 } },
    },
  },
};

describe("Visu-YAML", () => {
  it("bewahrt unveränderten Rohtext byte-identisch", () => {
    const raw = "typ: seite\nname: Wohnzimmer\n";
    expect(inhaltZumSpeichern(SEITE, raw, false)).toBe(raw);
  });

  it("serialisiert geänderte Seiten in stabiler Schema-Reihenfolge", () => {
    expect(seiteZuYaml(SEITE)).toContain(
      "typ: seite\nname: Wohnzimmer\nbasis: tablet\ngroessen:\n  tablet:\n",
    );
    expect(seiteZuYaml(SEITE)).toContain(
      "elemente:\n  licht:\n    preset: schalter\n",
    );
  });
});

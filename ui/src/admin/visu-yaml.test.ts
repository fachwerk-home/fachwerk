import { describe, expect, it } from "vitest";
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ladeVisu } from "../../../core/src/index.ts";
import type { VisuSeite } from "../../../schema/src/visu.ts";
import { validateVisuSeite } from "../../../schema/src/visu.ts";
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

  it("serialisiert eine neue leere Seite ohne null-Container und lädt sie schema-gültig", () => {
    const seite: VisuSeite = {
      typ: "seite",
      name: "Neu",
      basis: "tablet",
      groessen: { tablet: { w: 1280, h: 800 } },
      elemente: {},
    };
    const yaml = seiteZuYaml(seite);
    expect(yaml).toContain("elemente: {}\n");
    expect(yaml).not.toContain("elemente:\n");
    expect(validateVisuSeite(seite)).toBe(true);

    const dir = join(tmpdir(), `fachwerk-visu-yaml-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    mkdirSync(join(dir, "visu", "seiten"), { recursive: true });
    writeFileSync(join(dir, "visu", "seiten", "neu.yaml"), yaml, "utf8");
    try {
      const geladen = ladeVisu(dir);
      expect(geladen.fehler).toEqual([]);
      expect(geladen.seiten.get("neu")?.elemente).toEqual({});
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("zitiert strings, die YAML sonst als Zahl, Boolean oder null typisieren würde", () => {
    const yaml = seiteZuYaml({
      ...SEITE,
      elemente: {
        licht: {
          ...SEITE.elemente.licht!,
          parameter: { breite: "800", aktiv: "true", nullText: "null", nullZahl: "0" },
        },
      },
    });
    expect(yaml).toContain('breite: "800"');
    expect(yaml).toContain('aktiv: "true"');
    expect(yaml).toContain('nullText: "null"');
    expect(yaml).toContain('nullZahl: "0"');
  });

  it("lässt eine reale Beispielseite nach kanonischem Roundtrip schema-gültig ladbar", () => {
    const geladen = ladeVisu(join(process.cwd(), "examples", "minimal"));
    const wohnzimmer = geladen.seiten.get("wohnzimmer");
    expect(geladen.fehler).toEqual([]);
    expect(wohnzimmer).toBeDefined();
    const yaml = seiteZuYaml(wohnzimmer!);

    const dir = join(tmpdir(), `fachwerk-visu-yaml-real-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    mkdirSync(join(dir, "visu", "seiten"), { recursive: true });
    copyFileSync(join(process.cwd(), "examples", "minimal", "visu", "designs.yaml"), join(dir, "visu", "designs.yaml"));
    writeFileSync(join(dir, "visu", "seiten", "wohnzimmer.yaml"), yaml, "utf8");
    try {
      const roundtrip = ladeVisu(dir);
      expect(roundtrip.fehler).toEqual([]);
      expect(validateVisuSeite(roundtrip.seiten.get("wohnzimmer"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

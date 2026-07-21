import { describe, expect, it } from "vitest";
import type { LogikSeite } from "../../../schema/src/index.ts";
import { validateLogikSeite } from "../../../schema/src/index.ts";
import { validiereLogik } from "./logik-editor-modell.ts";
import { inhaltZumSpeichern, logikZuYaml } from "./logik-yaml.ts";

const SEITE: LogikSeite = {
  notizen: "Test",
  knoten: {
    b: { baustein: "NOT" },
    a: { baustein: "KOPIE", parameter: { wert: true } },
  },
  kanten: [
    { von: "dp:wohnen.taster", nach: "a.in", trigger: "on-receive" },
    { von: "a.out", nach: "b.in" },
  ],
};

describe("Logik-YAML", () => {
  it("bewahrt unveränderten Rohtext byte-identisch", () => {
    const raw = "knoten:\n  a:\n    baustein: KOPIE\nkanten: []\n";
    expect(inhaltZumSpeichern(SEITE, raw, false)).toBe(raw);
  });

  it("serialisiert in kanonischer Reihenfolge und spart on-change aus", () => {
    const text = logikZuYaml(SEITE);
    expect(text).toContain("notizen: Test\nknoten:\n  a:\n");
    expect(text).toContain("  - von: dp:wohnen.taster\n    nach: a.in\n    trigger: on-receive");
    expect(text).toContain("  - von: a.out\n    nach: b.in\n");
  });

  it("serialisiert leere Logikseiten ohne null-Container und markiert sie vor dem Speichern als schema-ungültig", () => {
    const seite: LogikSeite = { knoten: {}, kanten: [] };
    const text = logikZuYaml(seite);
    expect(text).toContain("knoten: {}\n");
    expect(text).toContain("kanten: []\n");
    expect(validateLogikSeite(seite)).toBe(false);
    expect(validiereLogik(seite).filter((p) => p.art === "fehler").map((p) => p.ort)).toEqual(["knoten", "kanten"]);
  });

  it("zitiert typsensible String-Parameter", () => {
    const text = logikZuYaml({
      knoten: {
        zeit: {
          baustein: "ZEITVERGLEICH",
          parameter: { notizen: "true", von: "08:00", breite: "800", nullText: "null" },
        },
      },
      kanten: [],
    });
    expect(text).toContain('notizen: "true"');
    expect(text).toContain("von: 08:00");
    expect(text).toContain('breite: "800"');
    expect(text).toContain('nullText: "null"');
  });
});

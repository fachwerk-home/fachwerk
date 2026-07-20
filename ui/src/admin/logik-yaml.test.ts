import { describe, expect, it } from "vitest";
import type { LogikSeite } from "../../../schema/src/index.ts";
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
});

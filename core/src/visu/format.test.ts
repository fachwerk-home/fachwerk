import { describe, expect, it } from "vitest";
import { effektivesFormat, formatiereWert } from "./format.ts";

describe("Format-Kaskade", () => {
  it("löst Datenpunkt, Element und Placement feldweise auf", () => {
    const effektiv = effektivesFormat(
      { einheit: "°C", dezimalstellen: 2, skalierung: 2 },
      { dezimalstellen: 1, offset: 1 },
      { dezimalstellen: 0, tausendertrenner: true },
    );
    expect(effektiv).toEqual({
      einheit: "°C",
      dezimalstellen: 0,
      skalierung: 2,
      offset: 1,
      tausendertrenner: true,
    });
  });
});

describe("formatiereWert", () => {
  it("wendet Skala, Offset, Rundung, Tausenderpunkt und Einheit nur auf Anzeige an", () => {
    const roh = 617.283;
    expect(formatiereWert(roh, { skalierung: 2, offset: 0.434, dezimalstellen: 1, tausendertrenner: true, einheit: "W" })).toBe("1.235,0 W");
    expect(roh).toBe(617.283);
  });

  it("formatiert Enum, Bool, Präfix, Suffix, Leerwert und gekürzten Text", () => {
    expect(formatiereWert(2, { enum_map: { "1": "eins" }, fallback: "unbekannt" })).toBe("unbekannt");
    expect(formatiereWert(true, { bool_map: { wahr: "an", falsch: "aus" } })).toBe("an");
    expect(formatiereWert("abc", { praefix: "[", suffix: "]" })).toBe("[abc]");
    expect(formatiereWert(null, { leerwert: "-" })).toBe("-");
    expect(formatiereWert("abcdef", { max_laenge: 5, ellipsis: "…" })).toBe("abcd…");
  });

  it("nutzt ein Template als Fluchtweg", () => {
    expect(formatiereWert(21.37, { template: "{fixed(#,1)} °C" })).toBe("21.4 °C");
  });
});

import { describe, expect, it } from "vitest";
import type { LogikSeite } from "../../../schema/src/index.ts";
import { fuegeKnotenEin, paletteAusGewerk, portsFuer, setzeOderErsetzeKante, validiereLogik } from "./logik-editor-modell.ts";

const SEITE: LogikSeite = {
  knoten: {
    a: { baustein: "KOPIE" },
    b: { baustein: "NOT" },
  },
  kanten: [{ von: "a.out", nach: "b.in" }],
};

describe("Logik-Editor-Modell", () => {
  it("legt Knoten aus der Palette mit freiem Key und Defaults an", () => {
    const palette = paletteAusGewerk();
    const split = palette.find((b) => b.id === "SPLIT")!;
    const { seite, key } = fuegeKnotenEin(SEITE, split);
    expect(key).toBe("split");
    expect(seite.knoten[key]?.parameter?.anzahl).toBe(2);
  });

  it("berechnet konfig-variable Ports aus Parametern", () => {
    const split = paletteAusGewerk().find((b) => b.id === "SPLIT")!;
    expect(portsFuer(split, { anzahl: 3, rest: false }).ausgaenge).toEqual(["teil1", "teil2", "teil3"]);
  });

  it("ersetzt doppelte Kanten statt Duplikate anzulegen", () => {
    const seite = setzeOderErsetzeKante(SEITE, { von: "a.out", nach: "b.in", trigger: "on-receive" });
    expect(seite.kanten).toEqual([{ von: "a.out", nach: "b.in", trigger: "on-receive" }]);
  });

  it("meldet Zyklen und Mehrfach-Schreiber mit Ort", () => {
    const probleme = validiereLogik({
      knoten: { a: { baustein: "KOPIE" }, b: { baustein: "KOPIE" } },
      kanten: [
        { von: "a.out", nach: "b.in" },
        { von: "b.out", nach: "a.in" },
        { von: "a.out", nach: "dp:wohnen.licht" },
        { von: "b.out", nach: "dp:wohnen.licht" },
      ],
    });
    expect(probleme.some((p) => p.text.startsWith("Zyklus:"))).toBe(true);
    expect(probleme.some((p) => p.text.startsWith("Mehrfach-Schreiber:"))).toBe(true);
  });
});

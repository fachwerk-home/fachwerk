import { describe, expect, it } from "vitest";
import type { LogikSeite } from "../../../schema/src/index.ts";
import {
  baueKanteAusRefs,
  fuegeKnotenEin,
  mussVorAktivierenSpeichern,
  paletteAusGewerk,
  parameterWertAusText,
  portsFuer,
  setzeOderErsetzeKante,
  validiereLogik,
} from "./logik-editor-modell.ts";

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
    const seite = setzeOderErsetzeKante({ ...SEITE, kanten: [{ von: "a.out", nach: "b.in", trigger: "on-receive" }] }, { von: "a.out", nach: "b.in" });
    expect(seite.kanten).toEqual([{ von: "a.out", nach: "b.in", trigger: "on-receive" }]);
  });

  it("baut Datenpunkt-Kanten abhängig vom anderen Endpunkt", () => {
    expect(baueKanteAusRefs({ art: "dp", ref: "dp:licht.status" }, { art: "port", ref: "a.in", richtung: "ein" }))
      .toEqual({ von: "dp:licht.status", nach: "a.in" });
    expect(baueKanteAusRefs({ art: "port", ref: "a.out", richtung: "aus" }, { art: "dp", ref: "dp:licht.status" }))
      .toEqual({ von: "a.out", nach: "dp:licht.status" });
    expect(baueKanteAusRefs({ art: "dp", ref: "dp:a" }, { art: "dp", ref: "dp:b" })).toBeNull();
    expect(baueKanteAusRefs({ art: "port", ref: "a.in", richtung: "ein" }, { art: "port", ref: "b.in", richtung: "ein" })).toBeNull();
  });

  it("meldet Zyklen, DP-vermittelte Zyklen und Mehrfach-Schreiber mit Ort", () => {
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

  it("erlaubt VERZOEGERUNG als entkoppelten Zyklusbrecher", () => {
    const probleme = validiereLogik({
      knoten: { not: { baustein: "NOT" }, verz: { baustein: "VERZOEGERUNG", parameter: { ms: 0 } } },
      kanten: [
        { von: "dp:flur.taster", nach: "not.in" },
        { von: "not.out", nach: "verz.in" },
        { von: "verz.out", nach: "dp:flur.taster" },
      ],
    });
    expect(probleme.filter((p) => p.art === "fehler")).toEqual([]);
  });

  it("erkennt DP-vermittelte globale Zyklen", () => {
    const probleme = validiereLogik({
      knoten: { a: { baustein: "KOPIE" }, b: { baustein: "KOPIE" } },
      kanten: [
        { von: "a.out", nach: "dp:zwischen.wert" },
        { von: "dp:zwischen.wert", nach: "b.in" },
        { von: "b.out", nach: "a.in" },
      ],
    });
    expect(probleme.some((p) => p.art === "fehler" && p.text.startsWith("Zyklus:"))).toBe(true);
  });

  it("validiert Port-Richtung und dynamische Port-Existenz", () => {
    const probleme = validiereLogik({
      knoten: { split: { baustein: "SPLIT", parameter: { anzahl: 1, rest: false } }, ziel: { baustein: "KOPIE" } },
      kanten: [
        { von: "split.teil2", nach: "ziel.in" },
        { von: "ziel.in", nach: "dp:kaputt.wert" },
      ],
    });
    expect(probleme.some((p) => p.ort === "Kante 1/von" && p.text.includes("kein Ausgang"))).toBe(true);
    expect(probleme.some((p) => p.ort === "Kante 2/von" && p.text.includes("kein Ausgang"))).toBe(true);
  });

  it("bewahrt String-Parameter beim Editieren statt sie zu bool/number zu coercen", () => {
    expect(parameterWertAusText("true", "")).toBe("true");
    expect(parameterWertAusText("08:00", "00:00")).toBe("08:00");
    expect(parameterWertAusText("42", 0)).toBe(42);
    expect(parameterWertAusText("false", true)).toBe(false);
  });

  it("fordert vor Aktivieren einen Save, wenn der Editor dirty ist", () => {
    expect(mussVorAktivierenSpeichern(true)).toBe(true);
    expect(mussVorAktivierenSpeichern(false)).toBe(false);
  });
});

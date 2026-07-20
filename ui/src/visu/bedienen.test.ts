import { describe, expect, it } from "vitest";
import type { DatenpunktSicht } from "../lib/api.ts";
import { wertAusAktion, wertPasstZumDatenpunkt } from "./bedienen.ts";

const boolDp: DatenpunktSicht = {
  schluessel: "raum.licht",
  name: "Licht",
  klasse: "bus",
  typ: "bool",
  wert: false,
  ts: null,
};

describe("Visu-Bedienlogik", () => {
  it("setzt explizite setze-Aktionen unverändert um", () => {
    expect(wertAusAktion({
      preset: "taster",
      aktionen: { kurz: { setze: true } },
    }, boolDp, false)).toEqual({ art: "setzen", wert: true });
  });

  it("schaltet boolesche Schalter gegen den Statuswert um", () => {
    expect(wertAusAktion({
      preset: "schalter",
      aktionen: { kurz: { art: "umschalten" } },
    }, boolDp, true)).toEqual({ art: "setzen", wert: false });
  });

  it("sperrt protected Datenpunkte vor dem POST", () => {
    expect(wertAusAktion({ preset: "taster" }, { ...boolDp, protected: true }, false))
      .toEqual({ art: "nicht_moeglich", grund: "Geschützter Datenpunkt" });
  });

  it("prüft Werttypen passend zum Datenpunkt", () => {
    expect(wertPasstZumDatenpunkt(true, boolDp)).toBe(true);
    expect(wertPasstZumDatenpunkt(1, boolDp)).toBe(false);
    expect(wertPasstZumDatenpunkt(23, { ...boolDp, typ: "zahl" })).toBe(true);
  });
});

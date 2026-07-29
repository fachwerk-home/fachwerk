import { describe, expect, it } from "vitest";
import type { DatenpunktSicht } from "../lib/api.ts";
import { statusSchluesselFuerAktion, wertAusAktion, wertPasstZumDatenpunkt } from "./bedienen.ts";

const boolDp: DatenpunktSicht = {
  schluessel: "raum.licht",
  name: "Licht",
  klasse: "bus",
  typ: "bool",
  wert: false,
  ts: null,
};

const zahlDp: DatenpunktSicht = {
  ...boolDp,
  schluessel: "raum.dimmer",
  name: "Dimmer",
  typ: "zahl",
  wert: 0,
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

  it("behält Umschalten ohne ein/status unverändert bei", () => {
    const element = {
      preset: "schalter" as const,
      bindungen: { set: "raum.licht" },
      aktionen: { kurz: { art: "umschalten" as const } },
    };

    expect(statusSchluesselFuerAktion(element, "raum.licht")).toBe("raum.licht");
    expect(wertAusAktion(element, boolDp, true)).toEqual({ art: "setzen", wert: false });
    expect(wertAusAktion(element, zahlDp, 0)).toEqual({ art: "setzen", wert: 1 });
  });

  it("schreibt den Ein-Wert, wenn der Status aus ist", () => {
    expect(wertAusAktion({
      preset: "schalter",
      aktionen: { kurz: { art: "umschalten", ein: 20 } },
    }, zahlDp, 0)).toEqual({ art: "setzen", wert: 20 });
  });

  it("schaltet einen gesetzten Zahlen-Ein-Wert mit 0 aus", () => {
    expect(wertAusAktion({
      preset: "schalter",
      aktionen: { kurz: { art: "umschalten", ein: 20 } },
    }, zahlDp, 20)).toEqual({ art: "setzen", wert: 0 });
  });

  it("liest den Status aus der Aktionsquelle, schreibt aber auf das Ziel", () => {
    const element = {
      preset: "schalter" as const,
      bindungen: {
        set: "raum.dimmer_befehl",
        status: "raum.alte_status_bindung",
      },
      aktionen: {
        kurz: {
          art: "umschalten" as const,
          ein: 20,
          status: "raum.dimmer_status",
        },
      },
    };

    expect(statusSchluesselFuerAktion(element, "raum.dimmer_befehl")).toBe("raum.dimmer_status");
    expect(wertAusAktion(element, { ...zahlDp, schluessel: "raum.dimmer_befehl" }, 0))
      .toEqual({ art: "setzen", wert: 20 });
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

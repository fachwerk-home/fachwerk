import { describe, expect, it } from "vitest";
import { BEFEHLE, befehlDef } from "./befehle-katalog.ts";

describe("Ausgangsbox-Befehlskatalog", () => {
  it("kennt den Hauptfall und Kategorien der dekodierten Referenzboxen", () => {
    expect(befehlDef(1)).toMatchObject({ kategorie: "ko-schreiben" });
    expect(befehlDef(13)).toMatchObject({ kategorie: "archiv" });
    expect(befehlDef(21)).toMatchObject({ kategorie: "visu" });
    expect(befehlDef(15)).toMatchObject({ kategorie: "aktion" });
    expect(befehlDef(30)).toMatchObject({ kategorie: "system" });
  });

  it("deckt alle 34 Palette-Befehle der Referenzboxen ab", () => {
    // Box 56 (19) + Box 57 (15) = 34 verschiedene cmd-Nummern.
    const referenz = [
      1, 13, 14, 18, 2, 7, 3, 4, 6, 19, 5, 9, 8, 40, 42, 50, 41, 51, 53, // Box 56
      21, 29, 28, 24, 26, 27, 23, 10, 11, 17, 15, 16, 20, 22, 30, // Box 57
    ];
    for (const cmd of referenz) expect(BEFEHLE[cmd], `cmd ${cmd} fehlt`).toBeDefined();
    expect(new Set(referenz).size).toBe(34);
  });
});

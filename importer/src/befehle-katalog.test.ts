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

  it("deckt alle 36 Palette-Befehle der drei Referenzboxen ab", () => {
    // Box 56 (19) + Box 57 (15) + Box 58 neu: Kamera cmd 12/52 = 36 cmd-Nummern.
    const referenz = [
      1, 13, 14, 18, 2, 7, 3, 4, 6, 19, 5, 9, 8, 40, 42, 50, 41, 51, 53, // Box 56
      21, 29, 28, 24, 26, 27, 23, 10, 11, 17, 15, 16, 20, 22, 30, // Box 57
      12, 52, // Box 58: Kameraarchiv hinzufügen/entfernen
    ];
    for (const cmd of referenz) expect(BEFEHLE[cmd], `cmd ${cmd} fehlt`).toBeDefined();
    expect(new Set(referenz).size).toBe(36);
  });

  it("markiert Multi-Auswahl-Befehle (Option-Varianten)", () => {
    for (const cmd of [5, 10, 11, 22, 30, 50, 51, 52]) {
      expect(BEFEHLE[cmd]?.optionVarianten, `cmd ${cmd}`).toBe(true);
    }
  });
});

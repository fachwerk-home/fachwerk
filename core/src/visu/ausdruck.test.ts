import { describe, expect, it } from "vitest";
import { kompiliereTemplate } from "./ausdruck.ts";

describe("Ausdrucks-Templates", () => {
  it("formatiert das kanonische fixed-Beispiel exakt", () => {
    const kompiliert = kompiliereTemplate("{fixed(#,1)} °C");
    expect(kompiliert.fehler).toEqual([]);
    expect(kompiliert.auswerten(21.37)).toEqual({ text: "21.4 °C", fehler: [] });
  });

  it("wertet Präzedenz, Klammern, Vergleiche, Logik und Ternary aus", () => {
    expect(kompiliereTemplate("{# + 2 * 3}").auswerten(1).text).toBe("7");
    expect(kompiliereTemplate("{(# + 2) * 3}").auswerten(1).text).toBe("9");
    expect(kompiliereTemplate("{# >= 20 && # < 30 ? 'warm' : 'kalt'}").auswerten(21).text).toBe("warm");
    expect(kompiliereTemplate("{!(# == 0) ? -# : 10}").auswerten(2).text).toBe("-2");
  });

  it("löst andere Datenpunkte über die Lookup-Funktion auf", () => {
    const template = kompiliereTemplate("innen {fixed(#,1)} / außen {fixed(#{aussen.temp},0)}");
    const ergebnis = template.auswerten(21.2, (key) => key === "aussen.temp" ? 8.4 : undefined);
    expect(ergebnis).toEqual({ text: "innen 21.2 / außen 8", fehler: [] });
  });

  it("unterstützt exakt die dokumentierten Funktionen", () => {
    const faelle: Array<[string, string]> = [
      ["{round(1.26,1)}", "1.3"],
      ["{floor(1.9)}", "1"],
      ["{ceil(1.1)}", "2"],
      ["{abs(-3)}", "3"],
      ["{min(3,1,2)}", "1"],
      ["{max(3,1,2)}", "3"],
      ["{clamp(12,0,10)}", "10"],
      ["{concat('A',2,'B')}", "A2B"],
      ["{upper('Abc')}", "ABC"],
      ["{lower('AbC')}", "abc"],
      ["{pad('7',3)}", "  7"],
      ["{map(#,1,'eins',2,'zwei','sonst')}", "zwei"],
      ["{map(#,1,'eins',2,'zwei','sonst')}", "sonst"],
    ];
    faelle.forEach(([template, erwartet], index) => {
      expect(kompiliereTemplate(template).auswerten(index === faelle.length - 1 ? 9 : 2).text).toBe(erwartet);
    });
  });

  it("liefert bei Syntax- und Laufzeitfehlern immer Rohwert plus Fehlercode", () => {
    const faelle: Array<[string, string]> = [
      ["{# +}", "syntax"],
      ["{unbekannt(#)}", "unbekannte_funktion"],
      ["{# + 'x'}", "typ"],
      ["{# / 0}", "division_durch_null"],
      ["{#{nicht.da}}", "datenpunkt_fehlt"],
    ];
    for (const [template, code] of faelle) {
      expect(() => kompiliereTemplate(template).auswerten(42)).not.toThrow();
      const ergebnis = kompiliereTemplate(template).auswerten(42);
      expect(ergebnis.text).toBe("42");
      expect(ergebnis.fehler[0]?.code).toBe(code);
    }
  });
});

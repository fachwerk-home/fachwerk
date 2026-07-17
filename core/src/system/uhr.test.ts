import { describe, expect, it } from "vitest";
import type { DatenpunktDatei } from "@fachwerk/schema";
import type { Gewerk } from "../gewerk/loader.ts";
import { DatenpunktRegistry } from "../datenpunkte/registry.ts";
import { UhrDienst, uhrDatenpunkte, uhrWert } from "./uhr.ts";

function gewerk(): Gewerk {
  const system: DatenpunktDatei = {
    zeit: { name: "Systemzeit", klasse: "system", typ: "text" },
    datum: { name: "Systemdatum", klasse: "system", typ: "text" },
    unix: { name: "Unixzeit", klasse: "system", typ: "zahl" },
    wochentag: { name: "Wochentag", klasse: "system", typ: "zahl" },
    anderes: { name: "kein Uhr-Ziel", klasse: "system", typ: "text" },
  };
  return {
    manifest: { format: 1, name: "T" },
    datenpunkte: new Map([["system", system]]),
    logik: new Map(),
  };
}

describe("Uhr-Dienst", () => {
  it("erkennt nur die Uhr-Schlüssel (klasse system + bekannter Key)", () => {
    const ziele = uhrDatenpunkte(gewerk());
    expect([...ziele.entries()].sort()).toEqual([
      ["system.datum", "datum"],
      ["system.unix", "unix"],
      ["system.wochentag", "wochentag"],
      ["system.zeit", "zeit"],
    ]);
  });

  it("uhrWert: Formate wie dokumentiert (Fr 2026-07-17 08:05:09)", () => {
    const d = new Date(2026, 6, 17, 8, 5, 9); // Freitag
    expect(uhrWert("zeit", d)).toBe("08:05:09");
    expect(uhrWert("datum", d)).toBe("2026-07-17");
    expect(uhrWert("wochentag", d)).toBe(5);
    expect(uhrWert("unix", d)).toBe(Math.floor(d.getTime() / 1000));
  });

  it("Sonntag ist 7, Montag 1", () => {
    expect(uhrWert("wochentag", new Date(2026, 6, 19))).toBe(7); // So
    expect(uhrWert("wochentag", new Date(2026, 6, 20))).toBe(1); // Mo
  });

  it("tick() schreibt in die Registry (Quelle system)", () => {
    const g = gewerk();
    const registry = new DatenpunktRegistry(g);
    const dienst = new UhrDienst(registry, uhrDatenpunkte(g), {
      jetzt: () => new Date(2026, 6, 17, 8, 5, 9),
    });
    dienst.tick();
    expect(registry.get("system.zeit")).toBe("08:05:09");
    expect(registry.get("system.datum")).toBe("2026-07-17");
    expect(registry.get("system.wochentag")).toBe(5);
    expect(registry.get("system.anderes")).toBeUndefined(); // kein Uhr-Ziel
  });
});

/**
 * P4-3-Tests: Stdlib-Grundstock + Fachbaustein SPERRLICHT.
 * Bausteine werden hier isoliert getestet (reine Funktionen + Kontext-Fake);
 * das Zusammenspiel in Kaskaden deckt engine.test.ts ab.
 */
import { describe, expect, it } from "vitest";
import { findeBaustein, type BausteinKontext } from "./bausteine.ts";
import type { Wert } from "../datenpunkte/registry.ts";

function ctx(
  parameter: Record<string, unknown> = {},
  zustand: Record<string, Wert> = {},
): BausteinKontext & { zustand: Record<string, Wert> } {
  return {
    parameter,
    zustand,
    ausloeser: { art: "eingang" },
    planeTimer: () => {},
    brichAb: () => {},
  };
}

const b = (typ: string) => findeBaustein(typ)!;

describe("Logik-Grundstock", () => {
  it("OR / XOR", () => {
    expect(b("OR").rechne({ a: false, b: true }, ctx())).toEqual({ out: true });
    expect(b("OR").rechne({ a: false, b: false }, ctx())).toEqual({ out: false });
    expect(b("XOR").rechne({ a: true, b: true }, ctx())).toEqual({ out: false });
    expect(b("XOR").rechne({ a: true, b: false }, ctx())).toEqual({ out: true });
    expect(b("OR").rechne({ a: true }, ctx())).toBeNull(); // unbelegt ⇒ nichts
  });

  it("OR8: ODER über belegte Eingänge, unbelegt = false, keiner = null", () => {
    expect(b("OR8").rechne({ e1: false, e3: false, e7: false }, ctx())).toEqual({ out: false });
    expect(b("OR8").rechne({ e1: false, e5: true }, ctx())).toEqual({ out: true });
    expect(b("OR8").rechne({}, ctx())).toBeNull();
  });

  it("TOGGLE: steigende Flanke wechselt, Halten/Fallen nicht", () => {
    const c = ctx();
    expect(b("TOGGLE").rechne({ in: true }, c)).toEqual({ out: true });
    expect(b("TOGGLE").rechne({ in: true }, c)).toBeNull(); // keine Flanke
    expect(b("TOGGLE").rechne({ in: false }, c)).toBeNull();
    expect(b("TOGGLE").rechne({ in: true }, c)).toEqual({ out: false });
  });

  it("TOGGLE: status-Eingang synchronisiert ohne zu schalten", () => {
    const c = ctx();
    expect(b("TOGGLE").rechne({ status: true }, c)).toBeNull();
    expect(b("TOGGLE").rechne({ in: true, status: true }, c)).toEqual({ out: false });
  });

  it("VERGLEICH: Operator + Parameter-Referenzwert", () => {
    expect(b("VERGLEICH").rechne({ a: 21.5 }, ctx({ op: ">=", wert: 20 }))).toEqual({
      out: true,
    });
    expect(b("VERGLEICH").rechne({ a: 3, b: 5 }, ctx({ op: "<" }))).toEqual({ out: true });
    expect(b("VERGLEICH").rechne({ a: 3 }, ctx({ op: "kaputt", wert: 1 }))).toBeNull();
  });

  it("HYSTERESE: schaltet an Schwellen, hält im Band, sendet nur Änderungen", () => {
    const c = ctx({ ein: 25, aus: 22 });
    expect(b("HYSTERESE").rechne({ in: 20 }, c)).toEqual({ out: false }); // Initialwert
    expect(b("HYSTERESE").rechne({ in: 24 }, c)).toBeNull(); // Band, unverändert
    expect(b("HYSTERESE").rechne({ in: 25 }, c)).toEqual({ out: true });
    expect(b("HYSTERESE").rechne({ in: 23 }, c)).toBeNull(); // Band, hält an
    expect(b("HYSTERESE").rechne({ in: 22 }, c)).toEqual({ out: false });
  });

  it("SPERRE: hält zurück, reicht beim Entsperren nach", () => {
    const c = ctx();
    expect(b("SPERRE").rechne({ in: true, sperre: false }, c)).toEqual({ out: true });
    expect(b("SPERRE").rechne({ in: false, sperre: true }, c)).toBeNull(); // gehalten
    expect(b("SPERRE").rechne({ in: false, sperre: false }, c)).toEqual({ out: false }); // nachgereicht
  });

  it("SPERRE: nachreichen=false unterdrückt das Nachreichen", () => {
    const c = ctx({ nachreichen: false });
    expect(b("SPERRE").rechne({ in: true, sperre: true }, c)).toBeNull();
    expect(b("SPERRE").rechne({ in: true, sperre: false }, c)).toBeNull(); // nur Entsperr-Flanke
  });
});

describe("Fachbaustein SPERRLICHT (Community-★★★)", () => {
  it("Default: beim Sperren aus, beim Entsperren Wunsch wiederherstellen", () => {
    const c = ctx();
    expect(b("SPERRLICHT").rechne({ schalten: true, sperre: false }, c)).toEqual({
      out: true,
    });
    expect(b("SPERRLICHT").rechne({ schalten: true, sperre: true }, c)).toEqual({
      out: false, // Sperr-Flanke ⇒ aus
    });
    // Wunsch während der Sperre wird gemerkt, nicht ausgegeben:
    expect(b("SPERRLICHT").rechne({ schalten: true, sperre: true }, c)).toBeNull();
    expect(b("SPERRLICHT").rechne({ schalten: true, sperre: false }, c)).toEqual({
      out: true, // Entsperr-Flanke ⇒ Wunsch wiederhergestellt
    });
  });

  it("beimSperren=an (z. B. Putzlicht), beimEntsperren=halten", () => {
    const c = ctx({ beimSperren: "an", beimEntsperren: "halten" });
    expect(b("SPERRLICHT").rechne({ schalten: false, sperre: true }, c)).toEqual({
      out: true,
    });
    expect(b("SPERRLICHT").rechne({ schalten: false, sperre: false }, c)).toBeNull();
  });

  it("Schalten wirkt nur unversperrt", () => {
    const c = ctx();
    expect(b("SPERRLICHT").rechne({ schalten: true, sperre: true }, c)).toEqual({
      out: false, // Sperr-Flanke (Default aus)
    });
    expect(b("SPERRLICHT").rechne({ schalten: false, sperre: true }, c)).toBeNull();
    expect(b("SPERRLICHT").rechne({ schalten: true, sperre: true }, c)).toBeNull();
  });
});

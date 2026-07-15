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
  frischeEingaenge: string[] = [],
): BausteinKontext & { zustand: Record<string, Wert> } {
  return {
    parameter,
    zustand,
    ausloeser: { art: "eingang" },
    frischeEingaenge: new Set(frischeEingaenge),
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

describe("Import-Bausteine (aus EDOMI-Bedarfsliste)", () => {
  it("WERTAUSLOESER: nur bei Trigger-Flanke, gibt Wert aus", () => {
    // Trigger nicht frisch ⇒ nichts
    expect(b("WERTAUSLOESER").rechne({ trigger: true, wert: 42 }, ctx())).toBeNull();
    // Trigger frisch ⇒ Wert (aus Eingang)
    expect(b("WERTAUSLOESER").rechne({ trigger: true, wert: 42 }, ctx({}, {}, ["trigger"]))).toEqual(
      { out: 42 },
    );
    // Wert aus Parameter
    expect(b("WERTAUSLOESER").rechne({ trigger: true }, ctx({ wert: 7 }, {}, ["trigger"]))).toEqual({
      out: 7,
    });
  });

  it("MULT: Produkt zweier Zahlen", () => {
    expect(b("MULT").rechne({ a: 6, b: 7 }, ctx())).toEqual({ out: 42 });
    expect(b("MULT").rechne({ a: 3 }, ctx())).toBeNull();
  });

  it("KLEMME: leitet den frisch eingetroffenen Eingang durch", () => {
    expect(b("KLEMME").rechne({ in1: 5, in2: 9 }, ctx({}, {}, ["in1"]))).toEqual({ out: 5 });
    expect(b("KLEMME").rechne({ in1: 5, in2: 9 }, ctx({}, {}, ["in2"]))).toEqual({ out: 9 });
    expect(b("KLEMME").rechne({ in1: 5, in2: 9 }, ctx())).toBeNull(); // keiner frisch
  });

  it("WENN_DANN_SONST: Operator entscheidet Ausgabe", () => {
    const c = ctx({ op: "GE", vergleich: 20, dann: 1, sonst: 0 });
    expect(b("WENN_DANN_SONST").rechne({ eingang: 25 }, c)).toEqual({ out: 1 });
    expect(b("WENN_DANN_SONST").rechne({ eingang: 15 }, c)).toEqual({ out: 0 });
    // Operatoren
    expect(b("WENN_DANN_SONST").rechne({ eingang: 5, op: "EQ", vergleich: 5, dann: 9, sonst: 0 }, ctx())).toEqual({ out: 9 });
    expect(b("WENN_DANN_SONST").rechne({ eingang: 5, op: "LT", vergleich: 5, dann: 9, sonst: 0 }, ctx())).toEqual({ out: 0 });
  });

  it("EXTRACT: konfigurierte Felder → benannte Ausgänge + Status (ADR-0012)", () => {
    const json = JSON.stringify({ main: { temp: 21.5 }, name: "Zuhause" });
    const felder = [
      { name: "temp", pfad: "main.temp" },
      { name: "stadt", pfad: "name" },
    ];
    const r = b("EXTRACT").rechne({ text: json }, ctx({ format: "json", felder }));
    expect(r).toEqual({ temp: 21.5, stadt: "Zuhause", status: "ok" });
  });

  it("EXTRACT: ports() leitet Ausgänge aus der Config ab", () => {
    const felder = [{ name: "a", pfad: "x" }, { name: "b", pfad: "y" }];
    expect(b("EXTRACT").ports!({ felder })).toEqual({
      eingaenge: ["text"],
      ausgaenge: ["a", "b", "status"],
    });
  });

  it("EXTRACT: Fehler eines Feldes landet im Status, kein Ausgang", () => {
    const felder = [{ name: "a", pfad: "a" }, { name: "b", pfad: "fehlt" }];
    const r = b("EXTRACT").rechne({ text: '{"a":1}' }, ctx({ felder }));
    expect(r).toMatchObject({ a: 1, status: expect.stringContaining("b") });
    expect(r).not.toHaveProperty("b");
  });

  it("EXTRACT: dasselbe Interface für XML (format=xml)", () => {
    const r = b("EXTRACT").rechne(
      { text: "<r><t>42</t></r>" },
      ctx({ format: "xml", felder: [{ name: "t", pfad: "r/t" }] }),
    );
    expect(r).toEqual({ t: "42", status: "ok" });
  });

  it("EXTRACT: introspizieren() zeigt Felder eines Beispiels für den Editor", () => {
    const baum = b("EXTRACT").introspizieren!(
      JSON.stringify({ main: { temp: 21.5 }, name: "Zuhause" }),
      { format: "json" },
    );
    // oberste Ebene: main (Objekt) + name (text)
    expect(baum.map((f) => f.name)).toEqual(["main", "name"]);
    const main = baum.find((f) => f.name === "main")!;
    expect(main.art).toBe("objekt");
    expect(main.kinder!.find((k) => k.name === "temp")).toMatchObject({
      pfad: "main.temp",
      art: "zahl",
    });
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

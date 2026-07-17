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

  it("SPLIT: zerlegt am Separator, teil-Ports aus Config, Rest gesammelt", () => {
    const c = ctx({ separator: ";", anzahl: 2 });
    expect(b("SPLIT").rechne({ text: "a;b;c;d" }, c)).toEqual({
      teil1: "a",
      teil2: "b",
      rest: "c;d",
    });
    // ports() leitet aus Config ab
    expect(b("SPLIT").ports!({ separator: ";", anzahl: 3 })).toEqual({
      eingaenge: ["text"],
      ausgaenge: ["teil1", "teil2", "teil3", "rest"],
    });
    // fehlende Teile → leer, rest abschaltbar
    expect(b("SPLIT").rechne({ text: "x" }, ctx({ separator: ";", anzahl: 2, rest: false }))).toEqual(
      { teil1: "x", teil2: "" },
    );
  });

  it("JOIN: verbindet konfigurierbar viele Eingänge, modus ohne_leere", () => {
    expect(b("JOIN").rechne({ teil1: "a", teil2: "b", teil3: "c" }, ctx({ separator: "-", anzahl: 3 }))).toEqual(
      { text: "a-b-c" },
    );
    // leere überspringen
    expect(
      b("JOIN").rechne({ teil1: "a", teil2: "", teil3: "c" }, ctx({ separator: ",", anzahl: 3, modus: "ohne_leere" })),
    ).toEqual({ text: "a,c" });
    expect(b("JOIN").ports!({ anzahl: 2 })).toEqual({
      eingaenge: ["teil1", "teil2"],
      ausgaenge: ["text"],
    });
    // kein Eingang belegt → nichts
    expect(b("JOIN").rechne({}, ctx({ anzahl: 3 }))).toBeNull();
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

describe("FORMEL (Arithmetik + Whitelist, nie eval)", () => {
  it("die echten Formeln aus dem importierten Gewerk", () => {
    // Prozent → Byte (Dimmwert-Skalierung)
    expect(b("FORMEL").rechne({ x: 50 }, ctx({ formel: "$x/100*255" }))).toEqual({
      out: 127.5,
    });
    expect(b("FORMEL").rechne({ x: 50 }, ctx({ formel: "round($x/100*255,0)" }))).toEqual({
      out: 128,
    });
    expect(b("FORMEL").rechne({ x: 100 }, ctx({ formel: "round($x/100*255,0)" }))).toEqual({
      out: 255,
    });
  });

  it("Formel als Eingang, mehrere Variablen, Punkt-vor-Strich", () => {
    expect(
      b("FORMEL").rechne({ formel: "$a+$b*2", a: 1, b: 3 }, ctx()),
    ).toEqual({ out: 7 });
    expect(b("FORMEL").rechne({ x: 9 }, ctx({ formel: "max(sqrt($x), 2)" }))).toEqual({
      out: 3,
    });
  });

  it("nie raten: unbelegte Variable, kaputte Formel, Division durch 0", () => {
    expect(b("FORMEL").rechne({}, ctx({ formel: "$x*2" }))).toBeNull();
    expect(b("FORMEL").rechne({ x: 1 }, ctx({ formel: "$x**" }))).toBeNull();
    expect(b("FORMEL").rechne({ x: 1 }, ctx({ formel: "kaputt(" }))).toBeNull();
    expect(b("FORMEL").rechne({ x: 1 }, ctx({ formel: "$x/0" }))).toBeNull(); // Infinity
  });
});

describe("SPERRE modus=freigabe (Entsperrt-Logik des Referenzsystems)", () => {
  it("durchlassen bei sperre=true, halten bei false, nachreichen beim Öffnen", () => {
    const c = ctx({ modus: "freigabe" });
    expect(b("SPERRE").rechne({ in: 5, sperre: true }, c)).toEqual({ out: 5 });
    expect(b("SPERRE").rechne({ in: 7, sperre: false }, c)).toBeNull(); // gehalten
    expect(b("SPERRE").rechne({ in: 7, sperre: true }, c)).toEqual({ out: 7 }); // nachgereicht
  });
});

describe("Zeit-Gruppe (pur — Zeit ist Eingang, nie Wanduhr)", () => {
  it("ZEITVERGLEICH: Bereich ohne und MIT Mitternachts-Überlauf", () => {
    const tag = ctx({ von: "06:00", bis: "20:00" });
    expect(b("ZEITVERGLEICH").rechne({ zeit: "12:30:00" }, tag)).toEqual({ out: true });
    expect(b("ZEITVERGLEICH").rechne({ zeit: "21:00:00" }, tag)).toEqual({ out: false });

    // Der echte EDOMI-Fall: von 20:00:00 bis 06:00:00 (abends ODER früh)
    const nacht = ctx({ von: "20:00:00", bis: "06:00:00" });
    expect(b("ZEITVERGLEICH").rechne({ zeit: "23:15" }, nacht)).toEqual({ out: true });
    expect(b("ZEITVERGLEICH").rechne({ zeit: "03:00" }, nacht)).toEqual({ out: true });
    expect(b("ZEITVERGLEICH").rechne({ zeit: "12:00" }, nacht)).toEqual({ out: false });

    // Unsinnige Zeit ⇒ keine Ausgabe (nie raten)
    expect(b("ZEITVERGLEICH").rechne({ zeit: "25:99" }, tag)).toBeNull();
  });

  it("ZEITVERGLEICH_AB: A gegen B mit drei Ausgängen", () => {
    expect(b("ZEITVERGLEICH_AB").rechne({ a: "07:30", b: "06:00:00" }, ctx())).toEqual({
      gt: true, lt: false, eq: false,
    });
    expect(b("ZEITVERGLEICH_AB").rechne({ a: "06:00:00", b: "06:00" }, ctx())).toEqual({
      gt: false, lt: false, eq: true,
    });
  });

  it("ZEITFORMAT: Uhrzeit-String + Sekunden-Offset (EDOMI-Vektoren ±900)", () => {
    // +900 s = +15 min (Dämmerungs-Verschiebung aus dem echten Gewerk)
    expect(
      b("ZEITFORMAT").rechne({ zeit: "20:00:00", offset: 900 }, ctx({ format: "%X" })),
    ).toEqual({ out: "20:15:00" });
    expect(
      b("ZEITFORMAT").rechne({ zeit: "06:00:00", offset: -900 }, ctx({ format: "%H:%M:%S" })),
    ).toEqual({ out: "05:45:00" });
    // Tages-Wrap: 23:50 + 20 min → 00:10
    expect(
      b("ZEITFORMAT").rechne({ zeit: "23:50:00", offset: 1200 }, ctx({ format: "%X" })),
    ).toEqual({ out: "00:10:00" });
  });

  it("ZEITFORMAT: Unix-Sekunden mit Datums-Mustern", () => {
    // 2026-07-17 14:30:00 lokale Zeit als Basis bauen (TZ-unabhängiger Test):
    const unix = Math.floor(new Date(2026, 6, 17, 14, 30, 0).getTime() / 1000);
    expect(
      b("ZEITFORMAT").rechne({ zeit: unix }, ctx({ format: "%d.%m.%Y %H:%M" })),
    ).toEqual({ out: "17.07.2026 14:30" });
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

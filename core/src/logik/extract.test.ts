import { describe, expect, it } from "vitest";
import { extrahiere } from "./extract.ts";

describe("JSON-Extraktion", () => {
  const doc = JSON.stringify({
    main: { temp: 21.5, humidity: 60 },
    weather: [{ id: 800, desc: "klar" }, { id: 500 }],
    name: "Zuhause",
  });

  it("Punkt- und Klammerpfade", () => {
    expect(extrahiere("json", doc, "main.temp")).toEqual({ ok: true, wert: 21.5 });
    expect(extrahiere("json", doc, "name")).toEqual({ ok: true, wert: "Zuhause" });
    expect(extrahiere("json", doc, "weather[0].desc")).toEqual({ ok: true, wert: "klar" });
    expect(extrahiere("json", doc, "$.weather.1.id")).toEqual({ ok: true, wert: 500 });
  });

  it("Objekt/Array → JSON-String", () => {
    expect(extrahiere("json", doc, "main")).toEqual({ ok: true, wert: '{"temp":21.5,"humidity":60}' });
  });

  it("nicht gefunden / kaputtes JSON melden Fehler", () => {
    expect(extrahiere("json", doc, "main.gibtsnicht").ok).toBe(false);
    expect(extrahiere("json", "{kaputt", "a").ok).toBe(false);
  });
});

describe("XML-Extraktion (Teilmenge)", () => {
  const doc = `<response><current temp="21.5" unit="C"><city>Zuhause</city></current>
    <list><item>a</item><item>b</item></list></response>`;

  it("Elementtext über Pfad", () => {
    expect(extrahiere("xml", doc, "response/current/city")).toEqual({ ok: true, wert: "Zuhause" });
    expect(extrahiere("xml", doc, "response/list/item")).toEqual({ ok: true, wert: "a" });
  });

  it("Attribut über @", () => {
    expect(extrahiere("xml", doc, "response/current/@temp")).toEqual({ ok: true, wert: "21.5" });
    expect(extrahiere("xml", doc, "response/current/@unit")).toEqual({ ok: true, wert: "C" });
  });

  it("verschachtelte gleichnamige Elemente balancieren", () => {
    const nested = `<a><a><v>tief</v></a><v>oben</v></a>`;
    expect(extrahiere("xml", nested, "a/v")).toEqual({ ok: true, wert: "oben" });
  });

  it("selbstschließende Tags + fehlende Elemente", () => {
    expect(extrahiere("xml", `<r><x/></r>`, "r/x")).toEqual({ ok: true, wert: "" });
    expect(extrahiere("xml", doc, "response/gibtsnicht").ok).toBe(false);
  });
});

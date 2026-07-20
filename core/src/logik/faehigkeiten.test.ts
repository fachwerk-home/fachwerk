import { expect, it } from "vitest";
import {
  loeseFaehigkeitenAuf,
  netzZielErlaubt,
  pruefeBausteinCode,
} from "./faehigkeiten.ts";

it("ohne capabilities-Block gilt Bestandsschutz, aber niemals Netz", () => {
  const f = loeseFaehigkeitenAuf(undefined);
  expect(f).toEqual({ netzHosts: [], zustand: true, timer: true, alt: true });
});

it("mit Block gilt genau das Deklarierte", () => {
  expect(loeseFaehigkeitenAuf({ netz: { hosts: ["api.telegram.org"] } })).toEqual({
    netzHosts: ["api.telegram.org"],
    zustand: true,
    timer: true,
    alt: false,
  });
  expect(loeseFaehigkeitenAuf({ zustand: false, timer: false })).toMatchObject({
    zustand: false,
    timer: false,
    netzHosts: [],
  });
});

it("laesst nur Hosts aus der Allowlist zu — exakt, nicht per Suffix", () => {
  const hosts = ["api.telegram.org"];
  expect(netzZielErlaubt("https://api.telegram.org/bot1/sendMessage", hosts).ok).toBe(true);
  // Der klassische Umgehungsversuch: eigene Domain mit dem erlaubten Host als Praefix.
  expect(netzZielErlaubt("https://api.telegram.org.angreifer.de/x", hosts).ok).toBe(false);
  expect(netzZielErlaubt("https://boese.de/?x=api.telegram.org", hosts).ok).toBe(false);
  expect(netzZielErlaubt("https://anderer.host/x", hosts).ok).toBe(false);
});

it("verweigert Netz ohne Faehigkeit und unverschluesselte Ziele", () => {
  expect(netzZielErlaubt("https://api.telegram.org/x", []).ok).toBe(false);
  const nurHttps = netzZielErlaubt("http://api.telegram.org/x", ["api.telegram.org"]);
  expect(nurHttps.ok).toBe(false);
  if (!nurHttps.ok) expect(nurHttps.grund).toContain("nur https");
  expect(netzZielErlaubt("kein-url", ["api.telegram.org"]).ok).toBe(false);
  // Ausnahme fuer Tests/E2E: lokale Ziele duerfen auch ohne TLS angesprochen werden.
  expect(netzZielErlaubt("http://127.0.0.1:8080/x", ["127.0.0.1"]).ok).toBe(true);
});

it("lehnt Baustein-Code ab, der sich an den ctx-Diensten vorbeimogelt", () => {
  expect(pruefeBausteinCode('import { readFileSync } from "node:fs";')).not.toEqual([]);
  expect(pruefeBausteinCode('const fs = require("fs");')).not.toEqual([]);
  expect(pruefeBausteinCode('await import("node:child_process")')).not.toEqual([]);
  expect(pruefeBausteinCode("process.env.FACHWERK_API_TOKEN")).not.toEqual([]);
  expect(pruefeBausteinCode("globalThis.fetch('https://x')")).not.toEqual([]);
  expect(pruefeBausteinCode("eval('1+1')")).not.toEqual([]);
  expect(pruefeBausteinCode("new Function('return 1')()")).not.toEqual([]);
});

it("laesst normalen Baustein-Code durch", () => {
  const gut = `
    let letzterStatus = "";
    export default function rechne(eingaenge, ctx) {
      if (eingaenge.ausloeser !== true) return null;
      const text = String(ctx.parameter.text).replaceAll("{wert}", String(eingaenge.wert));
      ctx.netz.hole("https://api.telegram.org/bot/sendMessage", { methode: "POST", koerper: text });
      ctx.planeTimer("nachlauf", 1000);
      return { gesendet: true, fehler: letzterStatus };
    }
  `;
  expect(pruefeBausteinCode(gut)).toEqual([]);
});

it("meldet keine Treffer aus Kommentaren und Zeichenketten", () => {
  // Sonst wird jede Doku-Zeile zum Fehler — und niemand nimmt den Check ernst.
  expect(pruefeBausteinCode('// frueher stand hier require("fs")')).toEqual([]);
  expect(pruefeBausteinCode('/* import x from "node:fs" */')).toEqual([]);
  expect(pruefeBausteinCode('const hinweis = "benutze niemals process.env";')).toEqual([]);
});

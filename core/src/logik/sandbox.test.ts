/**
 * P4-5-Tests: Baustein-Sandbox (Worker, Zeitlimit, Zustand, Timer-Befehle)
 * und Engine-Integration eines eigenen Bausteins.
 */
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import type { DatenpunktDatei, LogikSeite } from "@fachwerk/schema";
import type { Gewerk } from "../gewerk/loader.ts";
import { DatenpunktRegistry } from "../datenpunkte/registry.ts";
import { LogikEngine, type KaskadenTrace } from "./engine.ts";
import { BausteinSandbox, sandboxAlsBaustein } from "./sandbox.ts";

let tmp: string | null = null;
const sandboxen: BausteinSandbox[] = [];
afterEach(() => {
  for (const s of sandboxen.splice(0)) s.beende();
  if (tmp) rmSync(tmp, { recursive: true, force: true });
  tmp = null;
});

function bausteinDatei(code: string): string {
  tmp ??= mkdtempSync(join(tmpdir(), "fachwerk-sandbox-"));
  const pfad = join(tmp, `baustein-${sandboxen.length}.js`);
  writeFileSync(pfad, code, "utf8");
  return pfad;
}

function sandbox(code: string, zeitlimitMs = 300): BausteinSandbox {
  const s = new BausteinSandbox(bausteinDatei(code), { zeitlimitMs });
  sandboxen.push(s);
  return s;
}

const NEGIERER = `export default function rechne(e) {
  return typeof e.in === "boolean" ? { out: !e.in } : null;
}`;

describe("BausteinSandbox", () => {
  it("rechnet synchron im Worker", () => {
    const s = sandbox(NEGIERER);
    const r = s.rechne({
      eingaenge: { in: true },
      parameter: {},
      zustand: {},
      ausloeser: { art: "eingang" },
      frischeEingaenge: ["in"],
    });
    expect(r).toEqual({ ausgaenge: { out: false }, zustand: {}, timerBefehle: [], netzBefehle: [] });
  });

  it("reicht Zustand und Timer-Befehle zurück", () => {
    const s = sandbox(`export default function rechne(e, ctx) {
      ctx.zustand.n = (ctx.zustand.n ?? 0) + 1;
      ctx.planeTimer("t", 500);
      return { out: ctx.zustand.n };
    }`);
    const zustand = {};
    const r1 = s.rechne({ eingaenge: {}, parameter: {}, zustand, ausloeser: { art: "eingang" } });
    expect(r1).toMatchObject({
      ausgaenge: { out: 1 },
      zustand: { n: 1 },
      timerBefehle: [{ art: "plane", id: "t", ms: 500 }],
    });
  });

  it("Endlosschleife wird durch das Zeitlimit beendet (ADR-0008)", () => {
    const s = sandbox(`export default function rechne() { for(;;); }`, 200);
    const r = s.rechne({
      eingaenge: {},
      parameter: {},
      zustand: {},
      ausloeser: { art: "eingang" },
    });
    expect(r).toMatchObject({ fehler: expect.stringContaining("Zeitlimit") });
    // Sandbox ist danach tot — Folgeaufrufe scheitern benannt, kein Hänger:
    const r2 = s.rechne({
      eingaenge: {},
      parameter: {},
      zustand: {},
      ausloeser: { art: "eingang" },
    });
    expect(r2).toMatchObject({ fehler: expect.stringContaining("beendet") });
  });

  it("Wurf im Baustein wird als Fehler gemeldet, Worker lebt weiter", () => {
    const s = sandbox(`export default function rechne(e) {
      if (e.kaputt) throw new Error("absichtlich");
      return { out: true };
    }`);
    const kaputt = s.rechne({
      eingaenge: { kaputt: true },
      parameter: {},
      zustand: {},
      ausloeser: { art: "eingang" },
    });
    expect(kaputt).toMatchObject({ fehler: expect.stringContaining("absichtlich") });
    const gesund = s.rechne({
      eingaenge: {},
      parameter: {},
      zustand: {},
      ausloeser: { art: "eingang" },
    });
    expect(gesund).toMatchObject({ ausgaenge: { out: true } });
  });

  it("kaputtes Modul wird beim Laden gemeldet", () => {
    const s = sandbox(`export const quatsch = 1;`); // kein default-Export
    const r = s.rechne({
      eingaenge: {},
      parameter: {},
      zustand: {},
      ausloeser: { art: "eingang" },
    });
    expect(r).toMatchObject({ fehler: expect.stringContaining("default-Export") });
  });
});

describe("Engine-Integration: eigener Baustein in der Kaskade", () => {
  it("Sandbox-Baustein läuft in der Kaskade; Fehler brechen sie nicht", () => {
    const gewerk: Gewerk = {
      manifest: { format: 1, name: "T" },
      datenpunkte: new Map<string, DatenpunktDatei>([
        [
          "io",
          {
            ein: { name: "E", klasse: "intern", typ: "bool" },
            aus: { name: "A", klasse: "intern", typ: "bool" },
          },
        ],
      ]),
      logik: new Map<string, LogikSeite>([
        [
          "s",
          {
            knoten: { neg: { baustein: "negierer" } },
            kanten: [
              { von: "dp:io.ein", nach: "neg.in" },
              { von: "neg.out", nach: "dp:io.aus" },
            ],
          },
        ],
      ]),
    };
    const s = sandbox(NEGIERER);
    const registry = new DatenpunktRegistry(gewerk);
    const traces: KaskadenTrace[] = [];
    const engine = new LogikEngine(gewerk, registry, {
      bausteine: (typ) => (typ === "negierer" ? sandboxAlsBaustein(typ, s) : undefined),
      onTrace: (t) => traces.push(t),
      now: () => 0,
      uhr: () => 0,
    });
    engine.start();

    registry.schreibe("io.ein", true, "treiber");
    expect(registry.get("io.aus")).toBe(false);
    expect(traces[0]!.schritte[0]).toMatchObject({
      knoten: "s/neg",
      ausgaenge: { out: false },
    });
  });
});

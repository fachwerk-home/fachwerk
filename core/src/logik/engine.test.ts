/**
 * Engine-Tests (S-4): direkt aus den ADR-0005-Entscheidungen abgeleitet.
 * Jede describe-Gruppe benennt den Satz, den sie beweist.
 */
import { describe, expect, it } from "vitest";
import type { DatenpunktDatei, LogikSeite } from "@fachwerk/schema";
import type { Gewerk } from "../gewerk/loader.ts";
import { DatenpunktRegistry } from "../datenpunkte/registry.ts";
import {
  LogikEngine,
  GraphFehler,
  analysiereLogik,
  type KaskadenTrace,
} from "./engine.ts";

function gewerk(
  datenpunkte: Record<string, DatenpunktDatei>,
  logik: Record<string, LogikSeite>,
): Gewerk {
  return {
    manifest: { format: 1, name: "Test" },
    datenpunkte: new Map(Object.entries(datenpunkte)),
    logik: new Map(Object.entries(logik)),
  };
}

const boolDp = (name: string) => ({ name, klasse: "intern", typ: "bool" }) as const;

function aufbau(g: Gewerk) {
  const registry = new DatenpunktRegistry(g);
  const traces: KaskadenTrace[] = [];
  const warnungen: string[] = [];
  const engine = new LogikEngine(g, registry, {
    onTrace: (t) => traces.push(t),
    onWarnung: (w) => warnungen.push(w),
    now: () => 0,
  });
  engine.start();
  return { registry, traces, warnungen, engine };
}

describe("E-1/E-2: ereignisgetrieben, Baustein rechnet", () => {
  it("NOT: taster=true ⇒ licht=false, ein Trace-Schritt", () => {
    const g = gewerk(
      { io: { taster: boolDp("T"), licht: boolDp("L") } },
      {
        flur: {
          knoten: { not1: { baustein: "NOT" } },
          kanten: [
            { von: "dp:io.taster", nach: "not1.in" },
            { von: "not1.out", nach: "dp:io.licht" },
          ],
        },
      },
    );
    const { registry, traces } = aufbau(g);

    registry.schreibe("io.taster", true, "treiber");
    expect(registry.get("io.licht")).toBe(false);
    expect(traces).toHaveLength(1);
    expect(traces[0]!.schritte).toEqual([
      { knoten: "flur/not1", eingaenge: { in: true }, ausgaenge: { out: false } },
    ]);
  });
});

describe("E-2: settle before evaluate — Diamant ohne Glitch", () => {
  const diamant = (seiteA: string, seiteB: string, seiteC: string): Gewerk =>
    gewerk(
      {
        io: {
          quelle: boolDp("Q"),
          za: boolDp("ZA"),
          zb: boolDp("ZB"),
          ziel: boolDp("Z"),
        },
      },
      {
        [seiteA]: {
          knoten: { a: { baustein: "NOT" } },
          kanten: [
            { von: "dp:io.quelle", nach: "a.in" },
            { von: "a.out", nach: "dp:io.za" },
          ],
        },
        [seiteB]: {
          knoten: { b: { baustein: "NOT" } },
          kanten: [
            { von: "dp:io.quelle", nach: "b.in" },
            { von: "b.out", nach: "dp:io.zb" },
          ],
        },
        [seiteC]: {
          knoten: { c: { baustein: "AND" } },
          kanten: [
            { von: "dp:io.za", nach: "c.a" },
            { von: "dp:io.zb", nach: "c.b" },
            { von: "c.out", nach: "dp:io.ziel" },
          ],
        },
      } as Record<string, LogikSeite>,
    );

  it("Konvergenzknoten läuft GENAU EINMAL, nach beiden Zweigen, mit frischen Werten", () => {
    const { registry, traces } = aufbau(diamant("s1", "s1b", "s1c"));
    registry.schreibe("io.quelle", false, "treiber");

    const schritte = traces[0]!.schritte;
    const cLaeufe = schritte.filter((s) => s.knoten.endsWith("/c"));
    expect(cLaeufe).toHaveLength(1); // kein Doppel-Feuern
    expect(cLaeufe[0]!.eingaenge).toEqual({ a: true, b: true }); // beide frisch — kein Glitch
    expect(schritte.at(-1)!.knoten).toMatch(/\/c$/); // c zuletzt (settle before evaluate)
    expect(registry.get("io.ziel")).toBe(true);
    // ziel wurde genau EINMAL geschrieben — nie ein falscher Zwischenwert:
    const zielSchreiben = traces[0]!.schreibvorgaenge.filter((s) => s.schluessel === "io.ziel");
    expect(zielSchreiben).toHaveLength(1);
  });

  it("E-2b: gilt unverändert über Seitengrenzen (mehrseitiger Diamant)", () => {
    const { registry, traces } = aufbau(diamant("seite_a", "seite_b", "seite_c"));
    registry.schreibe("io.quelle", false, "treiber");
    expect(traces[0]!.schritte.filter((s) => s.knoten === "seite_c/c")).toHaveLength(1);
    expect(registry.get("io.ziel")).toBe(true);
  });
});

describe("E-2 Präzisierung: nicht betroffene Eingänge behalten letzten bekannten Wert", () => {
  it("AND rechnet mit frischem a und letztem bekannten b — wartet nie", () => {
    const g = gewerk(
      {
        io: {
          a: boolDp("A"),
          b: { ...boolDp("B"), initial: true },
          ziel: boolDp("Z"),
        },
      },
      {
        s: {
          knoten: { und: { baustein: "AND" } },
          kanten: [
            { von: "dp:io.a", nach: "und.a" },
            { von: "dp:io.b", nach: "und.b" },
            { von: "und.out", nach: "dp:io.ziel" },
          ],
        },
      },
    );
    const { registry } = aufbau(g);
    registry.schreibe("io.a", true, "treiber");
    expect(registry.get("io.ziel")).toBe(true); // b kam aus dem letzten bekannten Wert
  });
});

describe("E-3: atomare Kaskaden in FIFO-Ordnung", () => {
  it("zwei Ereignisse ⇒ zwei vollständige, geordnete Traces", () => {
    const g = gewerk(
      { io: { t: boolDp("T"), l: boolDp("L") } },
      {
        s: {
          knoten: { n: { baustein: "NOT" } },
          kanten: [
            { von: "dp:io.t", nach: "n.in" },
            { von: "n.out", nach: "dp:io.l" },
          ],
        },
      },
    );
    const { registry, traces } = aufbau(g);
    registry.schreibe("io.t", true, "treiber");
    registry.schreibe("io.t", false, "treiber");
    expect(traces.map((t) => t.nr)).toEqual([1, 2]);
    expect(traces[0]!.ausloeser).toMatchObject({ art: "dp", wert: true });
    expect(traces[1]!.ausloeser).toMatchObject({ art: "dp", wert: false });
    expect(registry.get("io.l")).toBe(true);
  });
});

describe("E-4: Trigger-Semantik pro Eingang", () => {
  const g = (trigger: "on-change" | "on-receive") =>
    gewerk(
      { io: { t: boolDp("T"), l: boolDp("L") } },
      {
        s: {
          knoten: { n: { baustein: "NOT" } },
          kanten: [
            { von: "dp:io.t", nach: "n.in", trigger },
            { von: "n.out", nach: "dp:io.l" },
          ],
        },
      },
    );

  it("on-change (Default): wertgleiches Telegramm feuert nicht", () => {
    const { registry, traces } = aufbau(g("on-change"));
    registry.schreibe("io.t", true, "treiber");
    registry.schreibe("io.t", true, "treiber"); // gleicher Wert
    expect(traces[1]!.schritte).toHaveLength(0);
  });

  it("on-receive: jedes Telegramm feuert", () => {
    const { registry, traces } = aufbau(g("on-receive"));
    registry.schreibe("io.t", true, "treiber");
    registry.schreibe("io.t", true, "treiber");
    expect(traces[1]!.schritte).toHaveLength(1);
  });
});

describe("E-6: Zyklen werden statisch abgelehnt", () => {
  const zyklisch = gewerk(
    { io: { x: boolDp("X") } },
    {
      s: {
        knoten: { n: { baustein: "NOT" } },
        kanten: [
          { von: "dp:io.x", nach: "n.in" },
          { von: "n.out", nach: "dp:io.x" }, // Rückkopplung auf sich selbst
        ],
      },
    },
  );

  it("Engine-Konstruktion schlägt fehl", () => {
    const registry = new DatenpunktRegistry(zyklisch);
    expect(() => new LogikEngine(zyklisch, registry)).toThrow(GraphFehler);
  });

  it("analysiereLogik meldet den Zyklus (für fachwerk validate)", () => {
    const { fehler } = analysiereLogik(zyklisch);
    expect(fehler.some((f) => f.includes("Zyklus"))).toBe(true);
  });
});

describe("E-7: Mehrfach-Schreiber werden gewarnt, Verhalten bleibt definiert", () => {
  it("zwei Schreiber auf einen Datenpunkt ⇒ Warnung + last writer wins im Trace", () => {
    const g = gewerk(
      { io: { t: boolDp("T"), ziel: boolDp("Z") } },
      {
        s: {
          knoten: { n1: { baustein: "NOT" }, n2: { baustein: "NOT" } },
          kanten: [
            { von: "dp:io.t", nach: "n1.in" },
            { von: "dp:io.t", nach: "n2.in" },
            { von: "n1.out", nach: "dp:io.ziel" },
            { von: "n2.out", nach: "dp:io.ziel" },
          ],
        },
      },
    );
    const { registry, traces, warnungen } = aufbau(g);
    expect(warnungen.some((w) => w.includes("io.ziel"))).toBe(true);

    registry.schreibe("io.t", true, "treiber");
    const schreiben = traces[0]!.schreibvorgaenge.filter((s) => s.schluessel === "io.ziel");
    expect(schreiben).toHaveLength(2); // beide sichtbar im Trace — nichts ist unsichtbar
    expect(registry.get("io.ziel")).toBe(false);
  });
});

describe("protected-Durchsetzung im Schreibpfad der Engine (Plan § 4.2)", () => {
  it("Logik-Schreiben auf protected wird abgelehnt und im Trace benannt", () => {
    const g = gewerk(
      {
        io: {
          t: boolDp("T"),
          schloss: { ...boolDp("S"), protected: true },
        },
      },
      {
        s: {
          knoten: { n: { baustein: "NOT" } },
          kanten: [
            { von: "dp:io.t", nach: "n.in" },
            { von: "n.out", nach: "dp:io.schloss" },
          ],
        },
      },
    );
    const { registry, traces } = aufbau(g);
    registry.schreibe("io.t", true, "treiber");
    expect(registry.get("io.schloss")).toBeUndefined(); // nie geschrieben
    const s = traces[0]!.schreibvorgaenge[0]!;
    expect(s.angenommen).toBe(false);
    expect(s.grund).toContain("protected");
  });
});

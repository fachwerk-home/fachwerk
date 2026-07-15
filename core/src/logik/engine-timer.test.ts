/**
 * P4-1-Tests: Zeitverhalten (E-8 / SPEC-002 T-1..T-6) mit injizierter Uhr —
 * vollständig deterministisch, keine echten Timeouts.
 */
import { describe, expect, it } from "vitest";
import type { DatenpunktDatei, LogikSeite } from "@fachwerk/schema";
import type { Gewerk } from "../gewerk/loader.ts";
import { DatenpunktRegistry } from "../datenpunkte/registry.ts";
import { LogikEngine, type KaskadenTrace } from "./engine.ts";

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

/** Aufbau mit steuerbarer Uhr. */
function aufbau(g: Gewerk) {
  const zeit = { jetzt: 0 };
  const registry = new DatenpunktRegistry(g);
  const traces: KaskadenTrace[] = [];
  let timerSignale = 0;
  const engine = new LogikEngine(g, registry, {
    onTrace: (t) => traces.push(t),
    now: () => zeit.jetzt,
    uhr: () => zeit.jetzt,
    onTimerAenderung: () => timerSignale++,
  });
  engine.start();
  const vor = (ms: number): void => {
    zeit.jetzt += ms;
    engine.verarbeiteFaellige(zeit.jetzt);
  };
  return { registry, traces, engine, zeit, vor, timerSignale: () => timerSignale };
}

const verzoegerungsGewerk = (ms: number) =>
  gewerk(
    { io: { ein: boolDp("E"), aus: boolDp("A") } },
    {
      s: {
        knoten: { vz: { baustein: "VERZOEGERUNG", parameter: { ms } } },
        kanten: [
          { von: "dp:io.ein", nach: "vz.in" },
          { von: "vz.out", nach: "dp:io.aus" },
        ],
      },
    },
  );

const treppenGewerk = (ms: number) =>
  gewerk(
    { io: { impuls: boolDp("I"), licht: boolDp("L") } },
    {
      s: {
        knoten: { tl: { baustein: "TREPPENLICHT", parameter: { ms } } },
        kanten: [
          { von: "dp:io.impuls", nach: "tl.in", trigger: "on-receive" },
          { von: "tl.out", nach: "dp:io.licht" },
        ],
      },
    },
  );

describe("T-1/T-3: Verzögerung — Timer-Ablauf als eigene Kaskade in der FIFO", () => {
  it("reicht den Wert erst nach Ablauf weiter, Trace weist Timer-Kaskade aus", () => {
    const { registry, traces, vor } = aufbau(verzoegerungsGewerk(500));

    registry.schreibe("io.ein", true, "treiber");
    expect(registry.get("io.aus")).toBeUndefined(); // noch nichts
    vor(499);
    expect(registry.get("io.aus")).toBeUndefined();
    vor(1); // t = 500
    expect(registry.get("io.aus")).toBe(true);

    expect(traces).toHaveLength(2);
    expect(traces[1]!.ausloeser).toEqual({
      art: "timer",
      knoten: "s/vz",
      timer: "ablauf",
      nachgeholt: false,
    });
  });

  it("T-2: Retrigger ersetzt den Timer — feuert einmal, mit letztem Wert, zur letzten Frist", () => {
    const { registry, traces, vor } = aufbau(verzoegerungsGewerk(500));

    registry.schreibe("io.ein", true, "treiber");
    vor(300);
    registry.schreibe("io.ein", false, "treiber"); // ersetzt: neue Frist t=800
    vor(250); // t = 550: alte Frist vorbei — nichts darf feuern
    expect(registry.get("io.aus")).toBeUndefined();
    vor(250); // t = 800
    expect(registry.get("io.aus")).toBe(false); // letzter Wert
    expect(traces.filter((t) => t.ausloeser.art === "timer")).toHaveLength(1);
  });
});

describe("Treppenlicht (T-2, T-4-Verhalten)", () => {
  it("Ein-Impuls schaltet ein, nach Ablauf automatisch aus", () => {
    const { registry, vor } = aufbau(treppenGewerk(60_000));
    registry.schreibe("io.impuls", true, "treiber");
    expect(registry.get("io.licht")).toBe(true);
    vor(60_000);
    expect(registry.get("io.licht")).toBe(false);
  });

  it("Retrigger verlängert die Laufzeit", () => {
    const { registry, vor } = aufbau(treppenGewerk(60_000));
    registry.schreibe("io.impuls", true, "treiber");
    vor(50_000);
    registry.schreibe("io.impuls", true, "treiber"); // verlängern (on-receive)
    vor(50_000); // t=100k: erste Frist lange vorbei, zweite (t=110k) nicht
    expect(registry.get("io.licht")).toBe(true);
    vor(10_000);
    expect(registry.get("io.licht")).toBe(false);
  });

  it("Aus-Impuls schaltet sofort aus und bricht den Timer ab", () => {
    const { registry, traces, vor } = aufbau(treppenGewerk(60_000));
    registry.schreibe("io.impuls", true, "treiber");
    registry.schreibe("io.impuls", false, "treiber");
    expect(registry.get("io.licht")).toBe(false);
    vor(120_000); // kein verwaister Timer darf feuern
    expect(traces.filter((t) => t.ausloeser.art === "timer")).toHaveLength(0);
  });
});

describe("T-3: Determinismus bei gleichzeitiger Fälligkeit", () => {
  it("gleiche Frist ⇒ Planungsreihenfolge entscheidet", () => {
    const g = gewerk(
      { io: { e1: boolDp("1"), e2: boolDp("2"), a1: boolDp("A1"), a2: boolDp("A2") } },
      {
        s: {
          knoten: {
            va: { baustein: "VERZOEGERUNG", parameter: { ms: 100 } },
            vb: { baustein: "VERZOEGERUNG", parameter: { ms: 100 } },
          },
          kanten: [
            { von: "dp:io.e1", nach: "va.in" },
            { von: "dp:io.e2", nach: "vb.in" },
            { von: "va.out", nach: "dp:io.a1" },
            { von: "vb.out", nach: "dp:io.a2" },
          ],
        },
      },
    );
    const { registry, traces, vor } = aufbau(g);
    registry.schreibe("io.e1", true, "treiber"); // va zuerst geplant
    registry.schreibe("io.e2", true, "treiber");
    vor(100);
    const timerTraces = traces.filter((t) => t.ausloeser.art === "timer");
    expect(
      timerTraces.map((t) => (t.ausloeser.art === "timer" ? t.ausloeser.knoten : "")),
    ).toEqual(["s/va", "s/vb"]);
  });
});

describe("T-5: Neustart — Momentaufnahme & Wiederherstellung", () => {
  it("laufender Timer wird mit Restlaufzeit fortgesetzt", () => {
    const g = treppenGewerk(60_000);
    const erste = aufbau(g);
    erste.registry.schreibe("io.impuls", true, "treiber");
    erste.vor(40_000);
    const schnappschuss = erste.engine.momentaufnahme();
    expect(schnappschuss.timer).toEqual([
      { besitzer: "s/tl", id: "aus", restMs: 20_000 },
    ]);

    // „Neustart": frische Engine, Wert wie persistiert (P4-2 übernimmt das später).
    const zweite = aufbau(g);
    zweite.registry.schreibe("io.impuls", true, "treiber"); // Licht an wie vor Neustart
    zweite.engine.stelleWiederHer(schnappschuss);
    zweite.vor(19_999);
    expect(zweite.registry.get("io.licht")).toBe(true);
    zweite.vor(1);
    expect(zweite.registry.get("io.licht")).toBe(false); // kein Dauer-An
  });

  it("überfälliger Timer feuert einmal sofort nach und ist als nachgeholt markiert", () => {
    const g = treppenGewerk(60_000);
    const erste = aufbau(g);
    erste.registry.schreibe("io.impuls", true, "treiber");
    const schnappschuss = erste.engine.momentaufnahme(); // restMs 60_000

    const zweite = aufbau(g);
    zweite.registry.schreibe("io.impuls", true, "treiber");
    zweite.zeit.jetzt += 1; // Wiederherstellung „nach der Downtime"
    // Downtime länger als Restlaufzeit simulieren: restMs künstlich abgelaufen
    zweite.engine.stelleWiederHer({
      timer: [{ besitzer: "s/tl", id: "aus", restMs: 0 }],
      zustaende: schnappschuss.zustaende,
    });
    expect(zweite.registry.get("io.licht")).toBe(false); // sofort nachgeholt
    const timerTrace = zweite.traces.find((t) => t.ausloeser.art === "timer")!;
    expect(timerTrace.ausloeser).toMatchObject({ nachgeholt: true });
  });

  it("T-6: Baustein-Zustand überlebt die Momentaufnahme (Verzögerung liefert Wert nach Neustart)", () => {
    const g = verzoegerungsGewerk(500);
    const erste = aufbau(g);
    erste.registry.schreibe("io.ein", true, "treiber");
    const schnappschuss = erste.engine.momentaufnahme();
    expect(schnappschuss.zustaende).toEqual([
      { knoten: "s/vz", zustand: { wert: true } },
    ]);

    const zweite = aufbau(g);
    zweite.engine.stelleWiederHer(schnappschuss);
    zweite.vor(500);
    expect(zweite.registry.get("io.aus")).toBe(true); // Wert kam aus dem Zustand
  });
});

describe("IMPULS (Flanke → true, nach Dauer → false)", () => {
  it("Trigger erzeugt Impuls, der nach der Dauer endet", () => {
    const g = gewerk(
      { io: { t: boolDp("T"), out: boolDp("O") } },
      {
        s: {
          knoten: { imp: { baustein: "IMPULS", parameter: { ms: 2000 } } },
          kanten: [
            { von: "dp:io.t", nach: "imp.trigger", trigger: "on-receive" },
            { von: "imp.out", nach: "dp:io.out" },
          ],
        },
      },
    );
    const { registry, vor } = aufbau(g);
    registry.schreibe("io.t", true, "treiber");
    expect(registry.get("io.out")).toBe(true);
    vor(1999);
    expect(registry.get("io.out")).toBe(true);
    vor(1);
    expect(registry.get("io.out")).toBe(false);
  });
});

describe("Pumpwerk-Schnittstelle", () => {
  it("naechsteFaelligkeit und onTimerAenderung", () => {
    const { registry, engine, vor, timerSignale } = aufbau(verzoegerungsGewerk(500));
    expect(engine.naechsteFaelligkeit()).toBeNull();
    registry.schreibe("io.ein", true, "treiber");
    expect(engine.naechsteFaelligkeit()).toBe(500);
    expect(timerSignale()).toBe(1);
    vor(500);
    expect(engine.naechsteFaelligkeit()).toBeNull();
    expect(timerSignale()).toBeGreaterThanOrEqual(2);
  });
});

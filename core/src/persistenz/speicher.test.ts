import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { Speicher } from "./speicher.ts";

let tmp: string | null = null;
afterEach(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
  tmp = null;
});

function pfad(): string {
  tmp = mkdtempSync(join(tmpdir(), "fachwerk-speicher-"));
  return join(tmp, "zustand.sqlite");
}

describe("Speicher (ADR-0006)", () => {
  it("remanente Werte überleben Schließen und Neuöffnen", () => {
    const datei = pfad();
    const s1 = new Speicher(datei);
    s1.sichereWert("wohnen.zaehler", 42);
    s1.sichereWert("wohnen.licht", true);
    s1.sichereWert("wohnen.zaehler", 43); // Upsert
    s1.schliesse();

    const s2 = new Speicher(datei);
    expect(s2.ladeWerte()).toEqual(
      new Map<string, unknown>([
        ["wohnen.zaehler", 43],
        ["wohnen.licht", true],
      ]),
    );
    s2.schliesse();
  });

  it("Engine-Zustand: Timer-Restlaufzeit wird um die Downtime korrigiert (T-5)", () => {
    const datei = pfad();
    const zeit = { jetzt: 1_000_000 };
    const s1 = new Speicher(datei, { now: () => zeit.jetzt });
    s1.sichereEngine({
      timer: [{ besitzer: "s/tl", id: "aus", restMs: 60_000 }],
      zustaende: [{ knoten: "s/vz", zustand: { wert: true } }],
    });
    s1.schliesse();

    zeit.jetzt += 40_000; // 40 s Downtime
    const s2 = new Speicher(datei, { now: () => zeit.jetzt });
    const m = s2.ladeEngine()!;
    expect(m.timer).toEqual([{ besitzer: "s/tl", id: "aus", restMs: 20_000 }]);
    expect(m.zustaende).toEqual([{ knoten: "s/vz", zustand: { wert: true } }]);
    s2.schliesse();
  });

  it("Downtime länger als Restlaufzeit ⇒ restMs 0 (sofort nachholen)", () => {
    const datei = pfad();
    const zeit = { jetzt: 0 };
    const s1 = new Speicher(datei, { now: () => zeit.jetzt });
    s1.sichereEngine({ timer: [{ besitzer: "a", id: "t", restMs: 5_000 }], zustaende: [] });
    s1.schliesse();

    zeit.jetzt = 3_600_000; // 1 h weg
    const s2 = new Speicher(datei, { now: () => zeit.jetzt });
    expect(s2.ladeEngine()!.timer[0]!.restMs).toBe(0);
    s2.schliesse();
  });

  it("leerer Speicher ⇒ null", () => {
    const s = new Speicher(pfad());
    expect(s.ladeEngine()).toBeNull();
    expect(s.ladeWerte().size).toBe(0);
    s.schliesse();
  });
});

import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { loadGewerk } from "../gewerk/loader.ts";
import { DatenpunktRegistry, type WertEreignis } from "./registry.ts";

const BEISPIEL = join(import.meta.dirname, "../../../examples/minimal");

function registry(): DatenpunktRegistry {
  const { gewerk, fehler } = loadGewerk(BEISPIEL);
  expect(fehler).toEqual([]);
  return new DatenpunktRegistry(gewerk!);
}

describe("DatenpunktRegistry", () => {
  it("übernimmt Initialwerte ohne Ereignis", () => {
    const r = registry();
    expect(r.get("wohnen.zaehler")).toBe(0);
    expect(r.get("wohnen.taster")).toBeUndefined();
  });

  it("schreibt typkorrekt und meldet Ereignis mit geaendert-Flag", () => {
    const r = registry();
    const ereignisse: WertEreignis[] = [];
    r.abonniere((e) => ereignisse.push(e));

    expect(r.schreibe("wohnen.taster", true, "treiber")).toEqual({
      angenommen: true,
      geaendert: true,
    });
    // wertgleiches Schreiben: angenommen, aber geaendert=false (E-4 on-receive)
    expect(r.schreibe("wohnen.taster", true, "treiber")).toEqual({
      angenommen: true,
      geaendert: false,
    });
    expect(ereignisse).toHaveLength(2);
    expect(ereignisse[0]).toMatchObject({ schluessel: "wohnen.taster", geaendert: true });
    expect(ereignisse[1]).toMatchObject({ geaendert: false, alt: true });
  });

  it("lehnt Typverstöße benannt ab — nie stilles Verbiegen", () => {
    const r = registry();
    const erg = r.schreibe("wohnen.taster", 1, "treiber");
    expect(erg.angenommen).toBe(false);
    if (!erg.angenommen) expect(erg.grund).toContain("Typverstoß");
    expect(r.get("wohnen.taster")).toBeUndefined();
  });

  it("lehnt unbekannte Datenpunkte ab", () => {
    const r = registry();
    expect(r.schreibe("gibts.nicht", true, "treiber").angenommen).toBe(false);
  });

  it("protected: Logik/Agent dürfen nicht schreiben, Treiber schon", () => {
    const { gewerk } = loadGewerk(BEISPIEL);
    // Beispiel hat keinen protected-DP — künstlich markieren:
    gewerk!.datenpunkte.get("wohnen")!.taster!.protected = true;
    const r = new DatenpunktRegistry(gewerk!);

    expect(r.schreibe("wohnen.taster", true, "logik").angenommen).toBe(false);
    expect(r.schreibe("wohnen.taster", true, "agent").angenommen).toBe(false);
    expect(r.schreibe("wohnen.taster", true, "treiber").angenommen).toBe(true);
  });

  it("abbestellen beendet Ereignis-Lieferung", () => {
    const r = registry();
    const ereignisse: WertEreignis[] = [];
    const ab = r.abonniere((e) => ereignisse.push(e));
    r.schreibe("wohnen.zaehler", 1, "system");
    ab();
    r.schreibe("wohnen.zaehler", 2, "system");
    expect(ereignisse).toHaveLength(1);
  });
});

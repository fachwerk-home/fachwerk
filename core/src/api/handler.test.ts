import { describe, expect, it } from "vitest";
import type { DatenpunktDatei, LogikSeite } from "@fachwerk/schema";
import type { Gewerk } from "../gewerk/loader.ts";
import { DatenpunktRegistry } from "../datenpunkte/registry.ts";
import { TracePuffer } from "./trace-puffer.ts";
import { beantworte, type ApiKontext } from "./handler.ts";
import type { KaskadenTrace } from "../logik/engine.ts";

function aufbau(): { ktx: ApiKontext; registry: DatenpunktRegistry } {
  const datenpunkte: DatenpunktDatei = {
    licht: {
      name: "Licht Flur",
      klasse: "bus",
      typ: "bool",
      treiber: "knx",
      adresse: "1/0/2",
      dpt: "1.001",
    },
    schloss: { name: "Haustür", klasse: "intern", typ: "bool", protected: true },
  };
  const logik: LogikSeite = {
    knoten: { n1: { baustein: "NOT" } },
    kanten: [{ von: "dp:flur.licht", nach: "n1.in" }],
  };
  const gewerk: Gewerk = {
    manifest: { format: 1, name: "Test-Gewerk" },
    datenpunkte: new Map([["flur", datenpunkte]]),
    logik: new Map([["seite1", logik]]),
  };
  let uhr = 1000;
  const registry = new DatenpunktRegistry(gewerk, { jetzt: () => uhr });
  const traces = new TracePuffer(10);
  uhr = 5000;
  registry.schreibe("flur.licht", true, "treiber");
  return {
    registry,
    ktx: {
      gewerk,
      registry,
      traces,
      gestartet: 1000,
      version: "0.1.0",
      jetzt: () => 61_000,
      knx: () => ({
        verbunden: true,
        modus: "beobachten",
        endpunkt: "192.168.11.11:3671",
        adresse: "1.0.4",
        kanal: 18,
      }),
      mqtt: () => null,
    },
  };
}

const q = (s = ""): URLSearchParams => new URLSearchParams(s);

describe("GET /api/status", () => {
  it("liefert Gewerk, Uptime, Zählungen und Treiberstatus", () => {
    const { ktx } = aufbau();
    const a = beantworte(ktx, "GET", "/api/status", q());
    expect(a.status).toBe(200);
    expect(a.koerper).toMatchObject({
      gewerk: "Test-Gewerk",
      uptimeMs: 60_000,
      datenpunkte: 2,
      logikseiten: 1,
      knx: { verbunden: true, modus: "beobachten", adresse: "1.0.4", kanal: 18 },
      mqtt: null,
    });
  });
});

describe("GET /api/datenpunkte", () => {
  it("liefert Definition + Live-Wert + Zeitstempel", () => {
    const { ktx } = aufbau();
    const a = beantworte(ktx, "GET", "/api/datenpunkte", q());
    const liste = (a.koerper as { datenpunkte: Array<Record<string, unknown>> }).datenpunkte;
    expect(liste).toHaveLength(2);
    expect(liste[0]).toMatchObject({
      schluessel: "flur.licht",
      adresse: "1/0/2",
      dpt: "1.001",
      wert: true,
      ts: 5000,
    });
    // Nie geschrieben ⇒ wert/ts null; protected wird gemeldet.
    expect(liste[1]).toMatchObject({ schluessel: "flur.schloss", wert: null, ts: null, protected: true });
  });

  it("filtert nach Text, Klasse und nur-gesetzte", () => {
    const { ktx } = aufbau();
    const nurLicht = beantworte(ktx, "GET", "/api/datenpunkte", q("filter=1/0/2"));
    expect((nurLicht.koerper as { anzahl: number }).anzahl).toBe(1);
    const intern = beantworte(ktx, "GET", "/api/datenpunkte", q("klasse=intern"));
    expect((intern.koerper as { anzahl: number }).anzahl).toBe(1);
    const gesetzt = beantworte(ktx, "GET", "/api/datenpunkte", q("gesetzt=1"));
    expect((gesetzt.koerper as { anzahl: number }).anzahl).toBe(1);
  });

  it("Detail + 404 bei unbekanntem Schlüssel", () => {
    const { ktx } = aufbau();
    expect(beantworte(ktx, "GET", "/api/datenpunkte/flur.licht", q()).status).toBe(200);
    expect(beantworte(ktx, "GET", "/api/datenpunkte/gibts.nicht", q()).status).toBe(404);
  });
});

describe("GET /api/traces und /api/gewerk", () => {
  it("Traces kommen aus dem Ringpuffer (jüngste zuletzt)", () => {
    const { ktx } = aufbau();
    for (let i = 1; i <= 3; i++) {
      ktx.traces.hinzu({
        nr: i,
        ausloeser: { art: "dp", schluessel: "flur.licht", wert: true, quelle: "treiber" },
        gestartet: i,
        dauerMs: 0,
        schritte: [],
        schreibvorgaenge: [],
      } as KaskadenTrace);
    }
    const a = beantworte(ktx, "GET", "/api/traces", q("n=2"));
    const traces = (a.koerper as { traces: KaskadenTrace[] }).traces;
    expect(traces.map((t) => t.nr)).toEqual([2, 3]);
  });

  it("Gewerk-Struktur für Monitor/Editoren", () => {
    const { ktx } = aufbau();
    const a = beantworte(ktx, "GET", "/api/gewerk", q());
    expect(a.koerper).toMatchObject({
      name: "Test-Gewerk",
      seiten: [
        {
          name: "seite1",
          knoten: [{ id: "n1", baustein: "NOT" }],
          kanten: [{ von: "dp:flur.licht", nach: "n1.in" }],
        },
      ],
    });
  });
});

describe("Sonstiges", () => {
  it("Schreiben ist (noch) nicht erlaubt und unbekannte Pfade sind 404", () => {
    const { ktx } = aufbau();
    expect(beantworte(ktx, "POST", "/api/datenpunkte/flur.licht", q()).status).toBe(405);
    expect(beantworte(ktx, "GET", "/api/quatsch", q()).status).toBe(404);
  });
});

describe("TracePuffer", () => {
  it("hält die Kapazität ein und wirft Ältestes weg", () => {
    const p = new TracePuffer(3);
    for (let i = 1; i <= 5; i++) {
      p.hinzu({ nr: i, gestartet: 0, dauerMs: 0, schritte: [], schreibvorgaenge: [] } as unknown as KaskadenTrace);
    }
    expect(p.anzahl).toBe(3);
    expect(p.letzte(10).map((t) => t.nr)).toEqual([3, 4, 5]);
  });
});

describe("GET /api/visu", () => {
  it("liefert Seiten und Designs; ohne Visu leere Objekte", () => {
    const { ktx } = aufbau();
    const leer = beantworte(ktx, "GET", "/api/visu", q()).koerper as {
      seiten: object;
      designs: object;
    };
    expect(leer.seiten).toEqual({});
    expect(leer.designs).toEqual({});

    ktx.visu = {
      seiten: new Map([
        [
          "wohnzimmer",
          {
            typ: "seite",
            name: "Wohnzimmer",
            basis: "tablet",
            groessen: { tablet: { w: 1280, h: 800 } },
            elemente: {},
          },
        ],
      ]),
      designs: { standard: { text: "#eee" } },
    };
    const a = beantworte(ktx, "GET", "/api/visu", q());
    expect(a.status).toBe(200);
    const k = a.koerper as { seiten: Record<string, { name: string }>; designs: object };
    expect(k.seiten["wohnzimmer"]!.name).toBe("Wohnzimmer");
    expect(k.designs).toEqual({ standard: { text: "#eee" } });
  });
});

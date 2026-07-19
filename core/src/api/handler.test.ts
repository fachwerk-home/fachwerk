import { describe, expect, it } from "vitest";
import type { DatenpunktDatei, LogikSeite } from "@fachwerk/schema";
import type { Gewerk } from "../gewerk/loader.ts";
import { ArchivDienst } from "../archiv/dienst.ts";
import { DatenpunktRegistry } from "../datenpunkte/registry.ts";
import { TracePuffer } from "./trace-puffer.ts";
import { beantworte, type ApiAntwort, type ApiKontext } from "./handler.ts";
import type { AuditEintrag } from "./audit.ts";
import { Schreibbremse } from "./schreibbremse.ts";
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
  it("Schreiben ist ohne Token-Konfiguration aus; unbekannte Pfade sind 404", () => {
    const { ktx } = aufbau();
    expect(beantworte(ktx, "POST", "/api/datenpunkte/flur.licht", q()).status).toBe(403);
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

describe("GET /api/archive (P5-13b)", () => {
  // In-Memory-Dienst: derselbe Code wie im Betrieb, nur ohne Datei.
  function mitArchiv(): ApiKontext {
    const { ktx } = aufbau();
    const dienst = new ArchivDienst({
      pfad: ":memory:",
      archive: new Map([
        [
          "zaehler",
          { name: "Schaltzaehler", quelle: "flur.licht", aufbewahrung_tage: 30 },
        ],
      ]),
    });
    // Vier Punkte im Abstand von 10 s, damit Rasterung etwas zu tun hat.
    for (let i = 0; i < 4; i++) dienst.erfasse("zaehler", i, 100_000 + i * 10_000);
    ktx.archiv = dienst;
    return ktx;
  }

  it("listet Archive samt Punktzahl; ohne Dienst leere Liste", () => {
    const { ktx } = aufbau();
    expect(beantworte(ktx, "GET", "/api/archive", q()).koerper).toEqual({
      anzahl: 0,
      archive: [],
    });

    const a = beantworte(mitArchiv(), "GET", "/api/archive", q());
    expect(a.status).toBe(200);
    const k = a.koerper as { anzahl: number; archive: Array<Record<string, unknown>> };
    expect(k.anzahl).toBe(1);
    expect(k.archive[0]).toEqual({
      id: "zaehler",
      name: "Schaltzaehler",
      quelle: "flur.licht",
      aufbewahrung_tage: 30,
      punkte: 4,
    });
  });

  it("meldet die Archiv-Anzahl im Status", () => {
    const ohne = beantworte(aufbau().ktx, "GET", "/api/status", q()).koerper as {
      archive: { anzahl: number };
    };
    expect(ohne.archive).toEqual({ anzahl: 0 });
    const mit = beantworte(mitArchiv(), "GET", "/api/status", q()).koerper as {
      archive: { anzahl: number };
    };
    expect(mit.archive).toEqual({ anzahl: 1 });
  });

  it("liefert Rohpunkte bei rasterS=0 und respektiert von/bis", () => {
    const a = beantworte(mitArchiv(), "GET", "/api/archive/zaehler", q("von=100000&bis=120000&rasterS=0"));
    expect(a.status).toBe(200);
    const k = a.koerper as { anzahl: number; rasterS: number; punkte: Array<{ ts: number }> };
    expect(k.rasterS).toBe(0);
    expect(k.punkte.map((p) => p.ts)).toEqual([100_000, 110_000, 120_000]);
  });

  it("aggregiert auf dem gewuenschten Raster", () => {
    const a = beantworte(mitArchiv(), "GET", "/api/archive/zaehler", q("von=100000&bis=130000&rasterS=30&aggregation=max"));
    const k = a.koerper as {
      aggregation: string;
      punkte: Array<{ ts: number; wert: number; anzahl: number }>;
    };
    expect(k.aggregation).toBe("max");
    // Fenster liegen absolut auf der Epoche (SPEC-004), nicht relativ zu „von":
    // 90 s-Fenster haelt 100/110 s, 120 s-Fenster haelt 120/130 s.
    expect(k.punkte.map((p) => [p.ts, p.wert, p.anzahl])).toEqual([
      [90_000, 1, 2],
      [120_000, 3, 2],
    ]);
  });

  it("rastert ohne rasterS selbst auf grob 1000 Punkte (Default 24 h)", () => {
    const ktx = mitArchiv();
    ktx.jetzt = () => 130_000;
    const k = beantworte(ktx, "GET", "/api/archive/zaehler", q()).koerper as {
      von: number;
      bis: number;
      rasterS: number;
    };
    expect(k.bis).toBe(130_000);
    expect(k.von).toBe(130_000 - 24 * 60 * 60 * 1000);
    // 86400 s Spanne / 1000 Punkte = 87 s Raster (aufgerundet).
    expect(k.rasterS).toBe(87);
  });

  it("weist unbekannte Archive, kaputte Zahlen und Aggregationen ab", () => {
    const ktx = mitArchiv();
    expect(beantworte(ktx, "GET", "/api/archive/gibtsnicht", q()).status).toBe(404);
    expect(beantworte(ktx, "GET", "/api/archive/zaehler", q("von=gestern")).status).toBe(400);
    expect(beantworte(ktx, "GET", "/api/archive/zaehler", q("rasterS=-1")).status).toBe(400);
    expect(beantworte(ktx, "GET", "/api/archive/zaehler", q("von=200&bis=100")).status).toBe(400);
    expect(beantworte(ktx, "GET", "/api/archive/zaehler", q("aggregation=median")).status).toBe(400);
  });
});

describe("POST /api/datenpunkte/<schluessel> (P5-8 Schreibpfad)", () => {
  // Vollstaendig verdrahteter Schreibpfad; jede Verriegelung einzeln pruefbar.
  function schreibbar(opts: { grenze?: number } = {}): {
    ktx: ApiKontext;
    audit: AuditEintrag[];
  } {
    const { ktx } = aufbau();
    const audit: AuditEintrag[] = [];
    ktx.schreibenAktiv = true;
    ktx.bremse = new Schreibbremse({ grenze: opts.grenze ?? 30, jetzt: () => 1000 });
    ktx.audit = (e) => audit.push(e);
    return { ktx, audit };
  }

  const post = (ktx: ApiKontext, schluessel: string, koerper: unknown): ApiAntwort =>
    beantworte(ktx, "POST", `/api/datenpunkte/${schluessel}`, q(), koerper);

  it("schreibt einen gueltigen Wert und protokolliert ihn", () => {
    const { ktx, audit } = schreibbar();
    const a = post(ktx, "flur.licht", { wert: false });
    expect(a.status).toBe(200);
    expect(a.koerper).toMatchObject({ angenommen: true, schluessel: "flur.licht", wert: false });
    expect(ktx.registry.get("flur.licht")).toBe(false);
    expect(audit).toEqual([
      { ts: 61_000, schluessel: "flur.licht", wert: false, quelle: "api", angenommen: true },
    ]);
  });

  it("Verriegelung 1: ohne Token-Konfiguration ist der Schreibpfad komplett aus", () => {
    const { ktx } = aufbau();
    const audit: AuditEintrag[] = [];
    ktx.audit = (e) => audit.push(e);
    const a = post(ktx, "flur.licht", { wert: false });
    expect(a.status).toBe(403);
    expect((a.koerper as { fehler: string }).fehler).toContain("FACHWERK_API_TOKEN");
    // Wert unveraendert — und der Versuch steht trotzdem im Audit.
    expect(ktx.registry.get("flur.licht")).toBe(true);
    expect(audit).toHaveLength(1);
    expect(audit[0]!.angenommen).toBe(false);
  });

  it("Verriegelung 2: protected-Datenpunkte sind nie schreibbar (SPEC-001)", () => {
    const { ktx, audit } = schreibbar();
    const a = post(ktx, "flur.schloss", { wert: true });
    expect(a.status).toBe(403);
    expect((a.koerper as { fehler: string }).fehler).toContain("protected");
    expect(ktx.registry.get("flur.schloss")).toBeUndefined();
    expect(audit[0]!.angenommen).toBe(false);
  });

  it("Verriegelung 2b: auch die Registry selbst lehnt protected ab (zweite Schicht)", () => {
    const { registry } = aufbau();
    const erg = registry.schreibe("flur.schloss", true, "agent");
    expect(erg.angenommen).toBe(false);
  });

  it("Verriegelung 3: Typverstoss ist 422, kein stilles Verbiegen", () => {
    const { ktx, audit } = schreibbar();
    const a = post(ktx, "flur.licht", { wert: "an" });
    expect(a.status).toBe(422);
    expect(ktx.registry.get("flur.licht")).toBe(true);
    expect(audit[0]!.grund).toContain("erwartet bool");
  });

  it("Verriegelung 4: Rate-Limit greift token-weit und antwortet 429", () => {
    const { ktx, audit } = schreibbar({ grenze: 2 });
    expect(post(ktx, "flur.licht", { wert: false }).status).toBe(200);
    expect(post(ktx, "flur.licht", { wert: true }).status).toBe(200);
    const dritt = post(ktx, "flur.licht", { wert: false });
    expect(dritt.status).toBe(429);
    expect((dritt.koerper as { fehler: string }).fehler).toContain("Rate-Limit");
    // Auch unbekannte Schluessel zaehlen gegen das Limit — Raten ist nicht gratis.
    expect(post(ktx, "gibts.nicht", { wert: 1 }).status).toBe(429);
    expect(audit.filter((e) => !e.angenommen)).toHaveLength(2);
  });

  it("Verriegelung 5: im Beobachtungsmodus wird angenommen, aber ehrlich gewarnt", () => {
    const { ktx } = schreibbar(); // knx() meldet modus "beobachten"
    const a = post(ktx, "flur.licht", { wert: false });
    expect(a.koerper).toMatchObject({
      angenommen: true,
      hinweis: "beobachten: nicht auf den Bus gesendet",
    });
  });

  it("kein Hinweis, wenn der Treiber wirklich sendet", () => {
    const { ktx } = schreibbar();
    ktx.knx = () => ({ verbunden: true, modus: "normal", endpunkt: "x:3671" });
    expect(post(ktx, "flur.licht", { wert: false }).koerper).not.toHaveProperty("hinweis");
  });

  it("weist unbekannte Datenpunkte und kaputte Bodies ab", () => {
    const { ktx } = schreibbar();
    expect(post(ktx, "gibts.nicht", { wert: true }).status).toBe(404);
    expect(post(ktx, "flur.licht", {}).status).toBe(400);
    expect(post(ktx, "flur.licht", undefined).status).toBe(400);
    expect(post(ktx, "flur.licht", { wert: null }).status).toBe(400);
    expect(post(ktx, "flur.licht", { wert: { a: 1 } }).status).toBe(400);
  });

  it("laesst andere Methoden und andere Pfade nicht durch", () => {
    const { ktx } = schreibbar();
    expect(beantworte(ktx, "DELETE", "/api/datenpunkte/flur.licht", q()).status).toBe(405);
    expect(beantworte(ktx, "POST", "/api/status", q(), { wert: 1 }).status).toBe(405);
  });
});

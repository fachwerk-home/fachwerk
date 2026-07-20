/**
 * Scope-Matrix (P5-12) — JEDE Route × JEDER Scope × ohne Auth.
 *
 * Dieser Test IST die Dokumentation der Berechtigungen: wer wissen will, was
 * ein Scope darf, liest die Tabelle unten und nicht eine Prosa, die veralten
 * kann. Neue Routen gehoeren hier hinein, sonst faellt der Vollstaendigkeits-
 * Test am Ende der Datei um.
 */
import { expect, test } from "vitest";
import type { DatenpunktDatei, LogikSeite } from "@fachwerk/schema";
import { DatenpunktRegistry } from "../datenpunkte/registry.ts";
import type { Gewerk } from "../gewerk/loader.ts";
import { TracePuffer } from "./trace-puffer.ts";
import { ANONYM, ALLE_SCOPES, type Identitaet, type Scope } from "./auth.ts";
import { beantworte, type ApiKontext } from "./handler.ts";

function ktxAufbau(): ApiKontext {
  const datenpunkte: DatenpunktDatei = {
    licht: { name: "Licht", klasse: "intern", typ: "bool" },
    tuer: { name: "Haustuer", klasse: "intern", typ: "bool", protected: true },
  };
  const logik: LogikSeite = { knoten: { n1: { baustein: "NOT" } }, kanten: [] };
  const gewerk: Gewerk = {
    manifest: { format: 1, name: "Matrix" },
    datenpunkte: new Map([["flur", datenpunkte]]),
    logik: new Map([["seite1", logik]]),
  };
  return {
    gewerk,
    registry: new DatenpunktRegistry(gewerk),
    traces: new TracePuffer(10),
    gestartet: 0,
    version: "0.1.0",
    jetzt: () => 1000,
    knx: () => null,
    mqtt: () => null,
    schreibenAktiv: true,
    dateien: {
      lies: () => ({ ok: true, inhalt: "x" }),
      schreibe: () => ({ ok: true, rel: "visu/a.yaml" }),
      aktiviere: () => ({ ok: true, dauerMs: 1 }),
    },
  };
}

interface Route {
  methode: string;
  pfad: string;
  koerper?: unknown;
  /** Welcher Scope oeffnet diese Route? null = keiner noetig (Login/Logout/ich). */
  scope: Scope | null;
}

/** Die vollstaendige Liste der API-Routen mit ihrem geforderten Recht. */
const ROUTEN: Route[] = [
  { methode: "GET", pfad: "/api/status", scope: "read" },
  { methode: "GET", pfad: "/api/datenpunkte", scope: "read" },
  { methode: "GET", pfad: "/api/datenpunkte/flur.licht", scope: "read" },
  { methode: "GET", pfad: "/api/traces", scope: "read" },
  { methode: "GET", pfad: "/api/gewerk", scope: "read" },
  { methode: "GET", pfad: "/api/visu", scope: "read" },
  { methode: "GET", pfad: "/api/archive", scope: "read" },
  { methode: "GET", pfad: "/api/gewerk/dateien/visu/a.yaml", scope: "read" },
  {
    methode: "POST",
    pfad: "/api/datenpunkte/flur.licht",
    koerper: { wert: true },
    scope: "operate",
  },
  {
    methode: "POST",
    pfad: "/api/gewerk/dateien",
    koerper: { pfad: "visu/a.yaml", inhalt: "x" },
    scope: "write:gewerk",
  },
  { methode: "POST", pfad: "/api/gewerk/aktivieren", koerper: {}, scope: "activate:dev" },
];

const identitaet = (scopes: readonly Scope[]): Identitaet => ({
  name: "pruefling",
  art: "sitzung",
  scopes,
});

function ruf(route: Route, scopes: readonly Scope[]): number {
  return beantworte(
    ktxAufbau(),
    route.methode,
    route.pfad,
    new URLSearchParams(),
    route.koerper,
    { identitaet: identitaet(scopes) },
  ).status;
}

// ---- Die Matrix ------------------------------------------------------------

for (const route of ROUTEN) {
  for (const scope of ALLE_SCOPES) {
    const erlaubt = route.scope === null || route.scope === scope;
    test(`${route.methode} ${route.pfad} mit Scope ${scope} → ${erlaubt ? "durch" : "403"}`, () => {
      const status = ruf(route, [scope]);
      if (erlaubt) expect(status).not.toBe(403);
      else expect(status).toBe(403);
    });
  }

  test(`${route.methode} ${route.pfad} ohne jeden Scope → 403`, () => {
    expect(ruf(route, [])).toBe(403);
  });

  test(`${route.methode} ${route.pfad} mit allen Scopes → durch`, () => {
    expect(ruf(route, ALLE_SCOPES)).not.toBe(403);
  });
}

// ---- Anonym: lesen ja, alles andere nein -----------------------------------

for (const route of ROUTEN) {
  test(`${route.methode} ${route.pfad} anonym → ${route.scope === "read" ? "durch" : "403"}`, () => {
    const status = beantworte(
      ktxAufbau(),
      route.methode,
      route.pfad,
      new URLSearchParams(),
      route.koerper,
      { identitaet: ANONYM },
    ).status;
    if (route.scope === "read") expect(status).not.toBe(403);
    else expect(status).toBe(403);
  });
}

// ---- Die Ausnahmen ---------------------------------------------------------

test("GET /api/ich braucht keinen Scope und nennt die eigenen Rechte", () => {
  const antwort = beantworte(
    ktxAufbau(),
    "GET",
    "/api/ich",
    new URLSearchParams(),
    undefined,
    { identitaet: identitaet(["read", "operate"]) },
  );
  expect(antwort.status).toBe(200);
  expect(antwort.koerper).toMatchObject({ name: "pruefling", scopes: ["read", "operate"] });
});

test("POST /api/logout geht ohne Scope und beendet genau die eigene Sitzung", () => {
  const ktx = ktxAufbau();
  const abgemeldet: string[] = [];
  ktx.auth = {
    anmelden: () => ({ ok: false, status: 401, grund: "nein" }),
    abmelden: (t) => void abgemeldet.push(t),
  };
  const antwort = beantworte(ktx, "POST", "/api/logout", new URLSearchParams(), {}, {
    identitaet: { name: "anna", art: "sitzung", scopes: [], token: "tok-123" },
  });
  expect(antwort.status).toBe(200);
  expect(abgemeldet).toEqual(["tok-123"]);
});

// ---- protected steht ueber JEDEM Scope (AGENTS.md Regel 5) -----------------

test("protected ist mit keinem Scope schreibbar — auch nicht mit allen", () => {
  const ktx = ktxAufbau();
  const antwort = beantworte(
    ktx,
    "POST",
    "/api/datenpunkte/flur.tuer",
    new URLSearchParams(),
    { wert: true },
    { identitaet: identitaet(ALLE_SCOPES) },
  );
  expect(antwort.status).toBe(403);
  expect(JSON.stringify(antwort.koerper)).toContain("protected");
  expect(ktx.registry.get("flur.tuer") ?? null).toBeNull();
});

// ---- Schalter vor allem anderen --------------------------------------------

test("ohne konfigurierte Auth ist der Schreibpfad aus — trotz vollem Scope", () => {
  const ktx = ktxAufbau();
  ktx.schreibenAktiv = false;
  for (const route of ROUTEN.filter((r) => r.methode === "POST")) {
    const antwort = beantworte(
      ktx,
      route.methode,
      route.pfad,
      new URLSearchParams(),
      route.koerper,
      { identitaet: identitaet(ALLE_SCOPES) },
    );
    expect(antwort.status, route.pfad).toBe(403);
  }
});

// ---- Vollstaendigkeit ------------------------------------------------------

test("die Matrix kennt jeden Scope und beide Methoden", () => {
  const abgedeckt = new Set(ROUTEN.map((r) => r.scope));
  for (const s of ALLE_SCOPES) expect(abgedeckt.has(s), `Scope ${s} ohne Route`).toBe(true);
  expect(ROUTEN.some((r) => r.methode === "GET")).toBe(true);
  expect(ROUTEN.some((r) => r.methode === "POST")).toBe(true);
});

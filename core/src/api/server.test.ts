/**
 * Server-Schicht (P5-12): hier lebt alles, was der reine Handler NICHT sehen
 * kann — 401 ohne Nachweis, Bearer vs. Cookie, Set-Cookie beim Login,
 * Security-Header, CSRF-Origin-Riegel und der Auth-Riegel vor dem WebSocket.
 *
 * Getestet wird gegen einen echten Server auf einem freien Port; alles andere
 * waere eine Simulation der Transportschicht, und genau die ist der Prueflings.
 */
import { afterEach, expect, test } from "vitest";
import type { DatenpunktDatei, LogikSeite } from "@fachwerk/schema";
import { DatenpunktRegistry } from "../datenpunkte/registry.ts";
import type { Gewerk } from "../gewerk/loader.ts";
import { TracePuffer } from "./trace-puffer.ts";
import { ANONYM, type Identitaet } from "./auth.ts";
import type { ApiKontext } from "./handler.ts";
import { ApiServer, SITZUNGS_COOKIE, type ServerAuth } from "./server.ts";

function ktxAufbau(): ApiKontext {
  const datenpunkte: DatenpunktDatei = { licht: { name: "Licht", klasse: "intern", typ: "bool" } };
  const logik: LogikSeite = { knoten: {}, kanten: [] };
  const gewerk: Gewerk = {
    manifest: { format: 1, name: "Server-Test" },
    datenpunkte: new Map([["flur", datenpunkte]]),
    logik: new Map([["seite1", logik]]),
  };
  return {
    gewerk,
    registry: new DatenpunktRegistry(gewerk),
    traces: new TracePuffer(10),
    gestartet: 0,
    version: "0.1.0",
    knx: () => null,
    mqtt: () => null,
    schreibenAktiv: true,
    auth: {
      anmelden: (name, passwort) =>
        name === "anna" && passwort === "richtig"
          ? {
              ok: true,
              token: "tok-anna",
              ablauf: Date.now() + 60_000,
              nutzer: "anna",
              scopes: ["read", "operate"],
            }
          : { ok: false, status: 401, grund: "Anmeldung fehlgeschlagen" },
      abmelden: () => {},
    },
  };
}

/** Auth-Attrappe: „tok-anna" ist gueltig, alles andere nicht. */
function authAttrappe(aktiv = true): ServerAuth {
  return {
    aktiv,
    identifiziere: (roh): Identitaet | null =>
      roh === "tok-anna"
        ? { name: "anna", art: "sitzung", scopes: ["read", "operate"], token: roh }
        : null,
  };
}

const laufende: ApiServer[] = [];
afterEach(() => {
  for (const s of laufende.splice(0)) s.stoppe();
});

async function starte(auth?: ServerAuth): Promise<string> {
  const server = new ApiServer(ktxAufbau(), {
    port: 0,
    ...(auth ? { auth } : {}),
    onMeldung: () => {},
  });
  await server.starte();
  laufende.push(server);
  return `http://127.0.0.1:${server.port}`;
}

// ---- Ohne Nachweis kommt niemand durch -------------------------------------

test("mit scharfer Auth ist ohne Nachweis JEDER /api-Weg zu", async () => {
  const basis = await starte(authAttrappe());
  for (const [methode, pfad] of [
    ["GET", "/api/status"],
    ["GET", "/api/datenpunkte"],
    ["GET", "/api/ich"],
    ["POST", "/api/datenpunkte/flur.licht"],
    ["POST", "/api/gewerk/aktivieren"],
  ] as const) {
    const antwort = await fetch(`${basis}${pfad}`, {
      method: methode,
      ...(methode === "POST"
        ? { headers: { "content-type": "application/json" }, body: '{"wert":true}' }
        : {}),
    });
    expect(antwort.status, `${methode} ${pfad}`).toBe(401);
  }
});

test("falsches Token ist so gut wie gar keins", async () => {
  const basis = await starte(authAttrappe());
  const antwort = await fetch(`${basis}/api/status`, {
    headers: { authorization: "Bearer falsch" },
  });
  expect(antwort.status).toBe(401);
});

test("Bearer und Cookie fuehren zur selben Identitaet", async () => {
  const basis = await starte(authAttrappe());
  const perBearer = await fetch(`${basis}/api/ich`, {
    headers: { authorization: "Bearer tok-anna" },
  });
  const perCookie = await fetch(`${basis}/api/ich`, {
    headers: { cookie: `${SITZUNGS_COOKIE}=tok-anna` },
  });
  expect(perBearer.status).toBe(200);
  expect(await perBearer.json()).toMatchObject({ name: "anna", scopes: ["read", "operate"] });
  expect(await perCookie.json()).toMatchObject({ name: "anna" });
});

// ---- Ohne konfigurierte Auth: lesen ja, schreiben nein ---------------------

test("ohne konfigurierte Auth bleibt die API lesend — Schreiben ist 403, nicht offen", async () => {
  const basis = await starte(authAttrappe(false));
  const lesen = await fetch(`${basis}/api/status`);
  expect(lesen.status).toBe(200);

  const schreiben = await fetch(`${basis}/api/datenpunkte/flur.licht`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: '{"wert":true}',
  });
  expect(schreiben.status).toBe(403);
  expect(await schreiben.json()).toMatchObject({ angenommen: false });

  const ich = await fetch(`${basis}/api/ich`);
  expect(await ich.json()).toMatchObject({ art: ANONYM.art, scopes: ["read"] });
});

// ---- Login setzt ein HttpOnly-Cookie ---------------------------------------

test("Login setzt ein HttpOnly-SameSite-Cookie, Logout raeumt es weg", async () => {
  const basis = await starte(authAttrappe());
  const an = await fetch(`${basis}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "anna", passwort: "richtig" }),
  });
  expect(an.status).toBe(200);
  const keks = an.headers.get("set-cookie") ?? "";
  expect(keks).toContain(`${SITZUNGS_COOKIE}=tok-anna`);
  expect(keks).toContain("HttpOnly");
  expect(keks).toContain("SameSite=Lax");
  // Ohne TLS kein Secure — sonst verwirft der Browser das Cookie im LAN still.
  expect(keks).not.toContain("Secure");

  const ab = await fetch(`${basis}/api/logout`, {
    method: "POST",
    headers: { authorization: "Bearer tok-anna", "content-type": "application/json" },
    body: "{}",
  });
  expect(ab.headers.get("set-cookie") ?? "").toContain("Max-Age=0");
});

test("fehlgeschlagener Login setzt kein Cookie", async () => {
  const basis = await starte(authAttrappe());
  const antwort = await fetch(`${basis}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "anna", passwort: "daneben" }),
  });
  expect(antwort.status).toBe(401);
  expect(antwort.headers.get("set-cookie")).toBeNull();
});

// ---- Haertung ---------------------------------------------------------------

test("Security-Header stehen auf der Antwort, CORS ausdruecklich nicht", async () => {
  const basis = await starte(authAttrappe(false));
  const antwort = await fetch(`${basis}/api/status`);
  expect(antwort.headers.get("x-content-type-options")).toBe("nosniff");
  expect(antwort.headers.get("x-frame-options")).toBe("DENY");
  expect(antwort.headers.get("referrer-policy")).toBe("no-referrer");
  // Gleiche Origin, also kein CORS: was es nicht gibt, kann nicht aufgehen.
  expect(antwort.headers.get("access-control-allow-origin")).toBeNull();
});

test("fremde Origin darf nichts aendern (CSRF)", async () => {
  const basis = await starte(authAttrappe());
  const antwort = await fetch(`${basis}/api/datenpunkte/flur.licht`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer tok-anna",
      origin: "http://boese.example",
    },
    body: '{"wert":true}',
  });
  expect(antwort.status).toBe(403);
  expect(await antwort.json()).toMatchObject({ fehler: "fremde Origin" });
});

// ---- WebSocket --------------------------------------------------------------

/** Rohen Upgrade-Versuch fahren; liefert die erste Antwortzeile oder "". */
async function wsVersuch(basis: string, kopfzeilen: string): Promise<string> {
  const { connect } = await import("node:net");
  const url = new URL(basis);
  return new Promise((auf) => {
    const socket = connect(Number(url.port), url.hostname, () => {
      socket.write(
        "GET /api/ws HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n" +
          "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n" +
          `${kopfzeilen}\r\n`,
      );
    });
    let text = "";
    socket.on("data", (c: Buffer) => {
      text += c.toString();
      socket.destroy();
      auf(text.split("\r\n")[0] ?? "");
    });
    socket.on("close", () => auf(text.split("\r\n")[0] ?? ""));
    socket.on("error", () => auf(""));
  });
}

test("der Live-Kanal ist kein Hintereingang: ohne Nachweis kein Upgrade", async () => {
  const server = new ApiServer(ktxAufbau(), { port: 0, auth: authAttrappe(), onMeldung: () => {} });
  server.setzeUpgrade((_req, socket) => {
    socket.write("HTTP/1.1 101 Switching Protocols\r\n\r\n");
  });
  await server.starte();
  laufende.push(server);
  const basis = `http://127.0.0.1:${server.port}`;

  expect(await wsVersuch(basis, "")).toBe("");
  expect(await wsVersuch(basis, `Cookie: ${SITZUNGS_COOKIE}=falsch\r\n`)).toBe("");
  expect(await wsVersuch(basis, `Cookie: ${SITZUNGS_COOKIE}=tok-anna\r\n`)).toContain("101");
});

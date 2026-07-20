import { createServer, type Server } from "node:http";
import { afterEach, beforeEach, expect, it } from "vitest";
import { holeMitGrenzen } from "./netz.ts";

let server: Server;
let basis: string;
let gesehen: Array<{ url: string; methode: string; koerper: string }>;

beforeEach(async () => {
  gesehen = [];
  server = createServer((req, res) => {
    let koerper = "";
    req.on("data", (c) => (koerper += c));
    req.on("end", () => {
      gesehen.push({ url: req.url ?? "", methode: req.method ?? "", koerper });
      if (req.url === "/gross") {
        res.writeHead(200).end("x".repeat(50_000));
      } else if (req.url === "/langsam") {
        setTimeout(() => res.writeHead(200).end("spaet"), 3000).unref();
      } else if (req.url === "/fehler") {
        res.writeHead(503).end("kaputt");
      } else if (req.url === "/umleitung") {
        res.writeHead(302, { location: "https://anderswo.example/" }).end();
      } else {
        res.writeHead(200).end("hallo");
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  basis = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterEach(() => server.close());

const hosts = ["127.0.0.1"];

it("holt eine erlaubte Adresse und reicht Methode und Koerper durch", async () => {
  const a = await holeMitGrenzen(
    { id: "a1", url: `${basis}/ok`, methode: "POST", koerper: '{"x":1}' },
    { hosts },
  );
  expect(a).toMatchObject({ id: "a1", ok: true, status: 200, text: "hallo" });
  expect(gesehen[0]).toMatchObject({ url: "/ok", methode: "POST", koerper: '{"x":1}' });
});

it("blockt Ziele ausserhalb der Allowlist, ohne den Socket zu oeffnen", async () => {
  const a = await holeMitGrenzen({ id: "a2", url: "https://boese.example/x" }, { hosts });
  expect(a.ok).toBe(false);
  expect(a.fehler).toContain("Allowlist");
  expect(gesehen).toHaveLength(0);
});

it("meldet HTTP-Fehler als Antwort, nicht als Ausnahme", async () => {
  const a = await holeMitGrenzen({ id: "a3", url: `${basis}/fehler` }, { hosts });
  expect(a).toMatchObject({ ok: false, status: 503, text: "kaputt" });
  expect(a.fehler).toBeUndefined();
});

it("bricht bei Zeitueberschreitung ab, statt haengen zu bleiben", async () => {
  const a = await holeMitGrenzen({ id: "a4", url: `${basis}/langsam` }, { hosts, timeoutMs: 300 });
  expect(a.ok).toBe(false);
  expect(a.fehler).toContain("Zeitlimit");
});

it("schneidet zu grosse Antworten ab, statt Speicher zu fressen", async () => {
  const a = await holeMitGrenzen({ id: "a5", url: `${basis}/gross` }, { hosts, maxBytes: 1000 });
  expect(a.text.length).toBeLessThanOrEqual(1000);
});

it("folgt keiner Umleitung — sie koennte aus der Allowlist herausfuehren", async () => {
  const a = await holeMitGrenzen({ id: "a6", url: `${basis}/umleitung` }, { hosts });
  expect(a.ok).toBe(false);
  expect(a.fehler).toBeDefined();
});

it("ein unerreichbarer Dienst endet als Fehler-Antwort", async () => {
  const a = await holeMitGrenzen({ id: "a7", url: "http://127.0.0.1:1/x" }, { hosts });
  expect(a.ok).toBe(false);
  expect(a.fehler).toBeDefined();
});

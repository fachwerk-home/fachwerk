import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { AuditProtokoll } from "./audit.ts";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "fachwerk-audit-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

it("haengt JSON-Zeilen an und ueberschreibt nie (append-only)", () => {
  const pfad = join(dir, "audit.jsonl");
  const audit = new AuditProtokoll(pfad);
  audit.schreibe({ ts: 1, schluessel: "flur.licht", wert: true, quelle: "api", angenommen: true });
  audit.schreibe({
    ts: 2,
    schluessel: "flur.schloss",
    wert: true,
    quelle: "api",
    angenommen: false,
    grund: "protected",
  });
  // Eine zweite Instanz auf derselben Datei haengt weiter an, statt zu kuerzen —
  // genau das passiert nach einem Neustart der Laufzeit.
  new AuditProtokoll(pfad).schreibe({
    ts: 3,
    schluessel: "flur.licht",
    wert: false,
    quelle: "api",
    angenommen: true,
  });

  const zeilen = readFileSync(pfad, "utf8").trimEnd().split("\n");
  expect(zeilen).toHaveLength(3);
  expect(zeilen.map((z) => JSON.parse(z).ts)).toEqual([1, 2, 3]);
  // Der abgelehnte Versuch steht mit Grund drin — sonst sieht man nur die
  // gelungenen Zugriffe und keinen einzigen Angriffsversuch.
  expect(JSON.parse(zeilen[1]!)).toMatchObject({ angenommen: false, grund: "protected" });
});

it("meldet Schreibfehler, statt die Laufzeit zu toeten", () => {
  const meldungen: string[] = [];
  // Verzeichnis statt Datei => appendFileSync scheitert garantiert.
  const audit = new AuditProtokoll(dir, (m) => meldungen.push(m));
  expect(() =>
    audit.schreibe({ ts: 1, schluessel: "x.y", wert: 1, quelle: "api", angenommen: true }),
  ).not.toThrow();
  expect(meldungen).toHaveLength(1);
  expect(meldungen[0]).toContain("Audit nicht schreibbar");
});

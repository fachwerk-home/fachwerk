import { describe, expect, it } from "vitest";
import { SUPPORTED_GEWERK_FORMAT } from "@fachwerk/core";
import { GEWERK_FORMAT_VERSION } from "@fachwerk/schema";
import { DRIVER_ID } from "@fachwerk/driver-knx";
import { CLI_VERSION } from "./index.ts";

/** Smoke: Workspace-Verdrahtung über alle Paketgrenzen (S-1). */
describe("workspace wiring", () => {
  it("resolves cross-package imports", () => {
    expect(SUPPORTED_GEWERK_FORMAT).toBe(GEWERK_FORMAT_VERSION);
    expect(DRIVER_ID).toBe("knx");
    expect(CLI_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe("Quellen-Erkennung fuer den Container-Import", () => {
it("findeQuellen erkennt Dump und Visu-Export unabhaengig vom Dateinamen", async () => {
  const { findeQuellen } = await import("./import.ts");
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "fachwerk-quellen-"));
  writeFileSync(join(dir, "projekt-dump.sql"), "");
  // Der echte Visu-Export heisst beim Betreiber so — mit Leerzeichen/Klammern.
  writeFileSync(join(dir, "ExportVisu2_Mobil (iPhone 14).tar"), "");
  writeFileSync(join(dir, "liesmich.txt"), "");
  const q = findeQuellen(dir);
  expect(q.dump?.endsWith("projekt-dump.sql")).toBe(true);
  expect(q.visu?.endsWith("(iPhone 14).tar")).toBe(true);
  expect(q.meldungen).toEqual([]);
});

it("findeQuellen bevorzugt das .tar-Paket vor der nackten .json", async () => {
  const { findeQuellen } = await import("./import.ts");
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "fachwerk-quellen2-"));
  writeFileSync(join(dir, "a.sql"), "");
  // Alphabetisch kaeme die JSON zuerst — das Paket bringt aber die Schriften
  // mit (ADR-0015), deshalb gewinnt es.
  writeFileSync(join(dir, "aaa-export.json"), "");
  writeFileSync(join(dir, "zzz-export.tar"), "");
  expect(findeQuellen(dir).visu?.endsWith(".tar")).toBe(true);
});

it("findeQuellen meldet, wenn es mehrere Kandidaten gibt", async () => {
  const { findeQuellen } = await import("./import.ts");
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "fachwerk-quellen3-"));
  writeFileSync(join(dir, "alt.sql"), "");
  writeFileSync(join(dir, "neu.sql"), "");
  const q = findeQuellen(dir);
  expect(q.dump?.endsWith("alt.sql")).toBe(true);
  expect(q.meldungen.join(" ")).toContain("mehrere .sql");
});
});

describe("Schreibprobe vor dem Uebernehmen", () => {
  it("meldet nichts, wenn das Verzeichnis beschreibbar ist, und laesst nichts liegen", async () => {
    const { schreibprobe } = await import("./run.ts");
    const { mkdtempSync, readdirSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = mkdtempSync(join(tmpdir(), "fw-probe-"));
    expect(schreibprobe(dir)).toBeNull();
    // Die Probe raeumt hinter sich auf — sonst blieben Dateien im Gewerk zurueck.
    expect(readdirSync(dir)).toEqual([]);
  });

  it("nennt bei fehlendem Verzeichnis den errno-Code statt nur zu scheitern", async () => {
    const { schreibprobe } = await import("./run.ts");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const grund = schreibprobe(join(tmpdir(), "fw-gibt-es-nicht-4711", "tiefer"));
    expect(grund).toContain("nicht beschreibbar");
    expect(grund).toContain("ENOENT");
  });
});

describe("Simulator", () => {
  it("kippt bool und wandert Zahlen eine feste Treppe hoch", async () => {
    const { naechsterWert } = await import("./simulator.ts");
    expect(naechsterWert({ typ: "bool", wert: false })).toBe(true);
    expect(naechsterWert({ typ: "bool", wert: true })).toBe(false);
    // Vorhersagbar statt zufaellig: man will nachvollziehen koennen, welcher
    // Wert welche Anzeige ausgeloest hat.
    expect(naechsterWert({ typ: "zahl", wert: 0 })).toBe(1);
    expect(naechsterWert({ typ: "zahl", wert: 50 })).toBe(100);
    expect(naechsterWert({ typ: "zahl", wert: 255 })).toBe(0);
    expect(naechsterWert({ typ: "text", wert: "AN" })).toBe("AUS");
  });
});

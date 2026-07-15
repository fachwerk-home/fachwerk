import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { loadGewerk } from "./loader.ts";
import { datenpunkteZuYaml, logikZuYaml, manifestZuYaml } from "./canonical.ts";

const BEISPIEL = join(import.meta.dirname, "../../../examples/minimal");

let tmp: string | null = null;
afterEach(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
  tmp = null;
});

/** Wegwerf-Gewerk mit gegebenen Dateien anlegen. */
function gewerkDir(dateien: Record<string, string>): string {
  tmp = mkdtempSync(join(tmpdir(), "fachwerk-test-"));
  for (const [rel, inhalt] of Object.entries(dateien)) {
    const abs = join(tmp, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, inhalt, "utf8");
  }
  return tmp;
}

describe("loadGewerk", () => {
  it("lädt das Beispiel-Gewerk fehlerfrei", () => {
    const { gewerk, fehler } = loadGewerk(BEISPIEL);
    expect(fehler).toEqual([]);
    expect(gewerk).not.toBeNull();
    expect(gewerk!.manifest.name).toContain("Minimal");
    expect(gewerk!.datenpunkte.get("wohnen")?.taster?.adresse).toBe("1/0/1");
    expect(gewerk!.logik.get("flur")?.knoten.not1?.baustein).toBe("NOT");
  });

  it("meldet fehlendes Manifest", () => {
    const { gewerk, fehler } = loadGewerk(gewerkDir({}));
    expect(gewerk).toBeNull();
    expect(fehler[0]?.datei).toBe("gewerk.yaml");
  });

  it("meldet Schema-Verstöße mit Datei und Pfad", () => {
    const dir = gewerkDir({
      "gewerk.yaml": "format: 1\nname: T\n",
      // klasse=bus ohne treiber/adresse → Schema-Fehler
      "datenpunkte/x.yaml": "kaputt:\n  name: K\n  klasse: bus\n  typ: bool\n",
    });
    const { gewerk, fehler } = loadGewerk(dir);
    expect(gewerk).toBeNull();
    expect(fehler.some((f) => f.datei === "datenpunkte/x.yaml")).toBe(true);
  });

  it("meldet Kanten auf unbekannte Datenpunkte/Knoten", () => {
    const dir = gewerkDir({
      "gewerk.yaml": "format: 1\nname: T\n",
      "datenpunkte/a.yaml": "ein:\n  name: E\n  klasse: intern\n  typ: bool\n",
      "logik/s.yaml": [
        "knoten:",
        "  n1:",
        "    baustein: NOT",
        "kanten:",
        "  - von: dp:a.gibtsnicht",
        "    nach: n1.in",
        "  - von: fremd.out",
        "    nach: dp:a.ein",
        "",
      ].join("\n"),
    });
    const { gewerk, fehler } = loadGewerk(dir);
    expect(gewerk).toBeNull();
    expect(fehler.map((f) => f.pfad)).toEqual([
      "/kanten/0/von",
      "/kanten/1/von",
    ]);
  });

  it("meldet nicht unterstützte Format-Version", () => {
    const dir = gewerkDir({ "gewerk.yaml": "format: 99\nname: T\n" });
    const { fehler } = loadGewerk(dir);
    expect(fehler.some((f) => f.pfad === "/format")).toBe(true);
  });
});

describe("kanonische Serialisierung (Round-trip)", () => {
  it("Beispiel-Gewerk ist bereits kanonisch: laden → speichern = identischer Text", () => {
    const { gewerk } = loadGewerk(BEISPIEL);
    expect(gewerk).not.toBeNull();

    const manifest = readFileSync(join(BEISPIEL, "gewerk.yaml"), "utf8");
    expect(manifestZuYaml(gewerk!.manifest)).toBe(manifest);

    const wohnen = readFileSync(join(BEISPIEL, "datenpunkte/wohnen.yaml"), "utf8");
    expect(datenpunkteZuYaml(gewerk!.datenpunkte.get("wohnen")!)).toBe(wohnen);

    const flur = readFileSync(join(BEISPIEL, "logik/flur.yaml"), "utf8");
    expect(logikZuYaml(gewerk!.logik.get("flur")!)).toBe(flur);
  });
});

/**
 * Tests des Visu-Imports (Stufe 3, P5-9) — ausschliesslich mit SYNTHETISCHEM
 * Fixture. Betreiberdaten kommen nie ins Repo (Clean-Room); die reale Abnahme
 * laeuft lokal gegen _ingest und wird per Screenshot bestaetigt.
 */
import { expect, test } from "vitest";
import { validateVisuDesigns, validateVisuSeite } from "@fachwerk/schema";
import { konvertiereVisu, type VisuExport } from "./visu.ts";

/**
 * Minimaler, aber repraesentativer Export: zwei Seiten (eine normale, ein
 * Popup), je ein Element der bekannten controltyp-Familien plus ein
 * unbekannter Typ und eine nicht aufloesbare Bindung.
 */
function fixture(): VisuExport {
  return {
    editVisuPage: [
      { id: 1, visuid: 2, name: "Wohnzimmer", pagetyp: 0 },
      { id: 2, visuid: 2, name: "Details", pagetyp: 1 },
    ],
    editKo: [
      { id: 100, ga: "1/0/2" }, // Bus-KO, aufloesbar
      { id: 200, ga: "0/0/9" }, // Bus-KO ohne Datenpunkt im Ziel
      { id: 300, ga: "300" }, // internes KO (keine GA)
    ],
    editVisuElement: [
      // controltyp 1 mit gaid -> statusanzeige
      { id: 10, controltyp: 1, pageid: 1, gaid: 100, xpos: 10, ypos: 20, xsize: 100, ysize: 40, zindex: 2, text: "" },
      // controltyp 1 nur Text -> label, Text landet in Notizen
      { id: 11, controltyp: 1, pageid: 1, gaid: 0, xpos: 0, ypos: 0, xsize: 200, ysize: 30, text: "Wohnzimmer" },
      // controltyp 1004 -> schalter + umschalten
      { id: 12, controltyp: 1004, pageid: 1, gaid: 100, xpos: 0, ypos: 60, xsize: 80, ysize: 80, text: "\n\nAn\nAus" },
      // controltyp 0 -> label (Grafik)
      { id: 13, controltyp: 0, pageid: 1, gaid: 0, xpos: 0, ypos: 0, xsize: 300, ysize: 300, text: "" },
      // Navigation via gotopageid -> navigation (Ziel ist Popup)
      { id: 14, controltyp: 1, pageid: 1, gaid: 0, gotopageid: 2, xpos: 0, ypos: 150, xsize: 120, ysize: 40, text: "" },
      // unbekannter controltyp -> label + Bericht
      { id: 15, controltyp: 999, pageid: 1, gaid: 0, xpos: 0, ypos: 200, xsize: 50, ysize: 50, text: "" },
      // Bindung auf internes KO -> unaufloesbar (Bericht)
      { id: 16, controltyp: 1, pageid: 1, gaid: 300, xpos: 0, ypos: 260, xsize: 50, ysize: 20, text: "" },
      // Element mit Nullgroesse -> Placement ohne w/h
      { id: 17, controltyp: 1, pageid: 2, gaid: 0, xpos: 5, ypos: 5, xsize: 0, ysize: 0, text: "" },
    ],
    editVisuCmdList: [
      // cmd 2 = setze auf KO 100
      { id: 1, targetid: 14, cmd: 2, cmdid1: 100, cmdvalue1: "1" },
      // cmd 6 = nicht abgebildet
      { id: 2, targetid: 10, cmd: 6, cmdid1: 100, cmdvalue1: "20" },
    ],
  };
}

/** GA -> Datenpunkt-Schluessel; nur 1/0/2 existiert im Ziel. */
const gaKey = (ga: string): string | undefined => (ga === "1/0/2" ? "wohnen.licht" : undefined);

test("Seiten entstehen mit Groesse aus der Element-Bounding-Box", () => {
  const { seiten } = konvertiereVisu(fixture(), gaKey);
  expect([...seiten.keys()].sort()).toEqual(["details", "wohnzimmer"]);
  const wz = seiten.get("wohnzimmer")!;
  expect(wz.typ).toBe("seite");
  expect(wz.basis).toBe("panel");
  // groesste Ausdehnung: Element 13 (300x300).
  expect(wz.groessen.panel).toEqual({ w: 300, h: 300 });
});

test("controltyp 1 mit GA wird statusanzeige mit aufgelöster Bindung", () => {
  const wz = konvertiereVisu(fixture(), gaKey).seiten.get("wohnzimmer")!;
  const el = Object.values(wz.elemente).find((e) => e.bindungen?.status === "wohnen.licht");
  expect(el?.preset).toBe("statusanzeige");
  expect(el?.ebene).toBe(2);
});

test("statischer Text wird nicht erfunden, sondern in Notizen vermerkt", () => {
  const wz = konvertiereVisu(fixture(), gaKey).seiten.get("wohnzimmer")!;
  expect(wz.notizen ?? "").toContain("Wohnzimmer");
  // Kein Preset-Element traegt parameter (Schema verbietet das).
  for (const el of Object.values(wz.elemente)) {
    if (el.preset) expect(el.parameter).toBeUndefined();
  }
});

test("controltyp 1004 wird Schalter mit Umschalt-Aktion", () => {
  const wz = konvertiereVisu(fixture(), gaKey).seiten.get("wohnzimmer")!;
  const el = Object.values(wz.elemente).find((e) => e.preset === "schalter");
  expect(el).toBeDefined();
  expect(el?.aktionen?.kurz).toEqual({ art: "umschalten" });
  expect(el?.bindungen?.set).toBe("wohnen.licht");
});

test("gotopageid wird Navigation; Ziel-Popup ergibt popup-Aktion", () => {
  const wz = konvertiereVisu(fixture(), gaKey).seiten.get("wohnzimmer")!;
  const nav = Object.values(wz.elemente).find((e) => e.preset === "navigation");
  expect(nav?.aktionen?.kurz).toEqual({ popup: "details" });
});

test("Nullgroesse ergibt Placement ohne w/h (Schema: w/h > 0)", () => {
  const det = konvertiereVisu(fixture(), gaKey).seiten.get("details")!;
  const el = Object.values(det.elemente)[0]!;
  expect(el.placements?.panel).toEqual({ x: 5, y: 5 });
});

test("Bericht zählt Unbekanntes und nicht aufgelöste Bindungen", () => {
  const { bericht } = konvertiereVisu(fixture(), gaKey);
  expect(bericht.visus).toBe(1);
  expect(bericht.elemente).toBe(8);
  expect(bericht.controltypVerteilung.get(1)).toBe(5);
  // internes KO (300) + GA ohne Datenpunkt kommen als unaufgelöst.
  expect(bericht.unaufgeloesteBindungen).toBeGreaterThanOrEqual(1);
  const gruende = [...bericht.nichtAbgebildet.keys()].join(" | ");
  expect(gruende).toContain("controltyp 999");
  expect(gruende).toContain("cmd 6");
});

test("die erzeugten Seiten und Designs sind schema-konform", () => {
  const { seiten, designs } = konvertiereVisu(fixture(), gaKey);
  expect(validateVisuDesigns(designs)).toBe(true);
  for (const [slug, seite] of seiten) {
    const ok = validateVisuSeite(seite);
    if (!ok) throw new Error(`${slug}: ${JSON.stringify(validateVisuSeite.errors)}`);
    expect(ok).toBe(true);
  }
});

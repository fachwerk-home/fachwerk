/**
 * Tests des Visu-Imports (Stufe 3, P5-9) — ausschliesslich mit SYNTHETISCHEM
 * Fixture. Betreiberdaten kommen nie ins Repo (Clean-Room); die reale Abnahme
 * laeuft lokal gegen _ingest und wird per Screenshot bestaetigt.
 *
 * Das Mapping folgt der Interop-Spec (research/visu-format-spec.md): gaid=Status,
 * gaid2=Klick-Ziel (KO2), text=Beschriftung/Symbol, var3=Klick-Aktion,
 * var15=KO2-Wert, controltyp 0=Gruppenknoten, Design-Slots s9/s14/s15.
 */
import { expect, test } from "vitest";
import { validateVisuDesigns, validateVisuSeite } from "@fachwerk/schema";
import { farbe, konvertiereVisu, type VisuExport } from "./visu.ts";

function fixture(): VisuExport {
  return {
    editVisuPage: [
      // bgcolorid 1 -> Palette; globalinclude 1 -> Header wird eingebunden.
      { id: 1, visuid: 2, name: "Wohnzimmer", pagetyp: 0, bgcolorid: 1, globalinclude: 1 },
      { id: 2, visuid: 2, name: "Details", pagetyp: 1 },
      // Globale Include-Seite (Kopfbereich).
      { id: 3, visuid: 2, name: "Header", pagetyp: 2, globalinclude: 1 },
    ],
    editKo: [
      { id: 100, ga: "1/0/2" }, // Bus-KO, aufloesbar
      { id: 300, ga: "300" }, // internes KO (keine GA)
    ],
    editVisuElement: [
      // Statusanzeige: gaid (KO1) gesetzt, kein Klick.
      { id: 10, controltyp: 1, pageid: 1, gaid: 100, xpos: 10, ypos: 20, xsize: 100, ysize: 40, zindex: 2, text: "" },
      // Reines Label mit Text.
      { id: 11, controltyp: 1, pageid: 1, xpos: 0, ypos: 0, xsize: 200, ysize: 30, text: "Wohnzimmer" },
      // Taster: KO2 (gaid2) + var3=4 (KO2 setzen) + var15=1 -> setze true. Text = Symbol.
      { id: 12, controltyp: 1, pageid: 1, gaid2: 100, var3: 4, var15: "1", xpos: 0, ypos: 60, xsize: 60, ysize: 60, text: "&#xe92d" },
      // Navigation via gotopageid (Ziel ist Popup).
      { id: 13, controltyp: 1, pageid: 1, gotopageid: 2, xpos: 0, ypos: 150, xsize: 120, ysize: 40, text: "Details" },
      // Schiebeschalter (VSE 1004): var1=5 -> Knopftext idx 2/3; var6=0,var8=1
      // -> An bei wahr. Text: "" "" An Aus deaktiviert.
      { id: 14, controltyp: 1004, pageid: 1, gaid: 100, var1: "5", var6: "0", var8: "1", xpos: 0, ypos: 210, xsize: 200, ysize: 80, text: "\n\nAn\nAus\ndeaktiviert" },
      // Positionsanzeige mit Formel -> Format.
      { id: 15, controltyp: 1, pageid: 1, gaid: 100, xpos: 300, ypos: 60, xsize: 80, ysize: 40, text: "{floor(#*100/255)} %" },
      // Gruppenknoten (controltyp 0) -> uebersprungen.
      { id: 16, controltyp: 0, pageid: 1, xpos: 0, ypos: 0, xsize: 1, ysize: 1, name: "Wohnzimmer Couch" },
      // Unbekannter controltyp -> label + Bericht.
      { id: 17, controltyp: 999, pageid: 1, xpos: 0, ypos: 300, xsize: 50, ysize: 50, text: "" },
      // Bindung auf internes KO -> unaufloesbar (Bericht).
      { id: 18, controltyp: 1, pageid: 1, gaid: 300, xpos: 0, ypos: 360, xsize: 50, ysize: 20, text: "" },
      // Nullgroesse -> Placement ohne w/h.
      { id: 19, controltyp: 1, pageid: 2, xpos: 5, ypos: 5, xsize: 0, ysize: 0, text: "x" },
    ],
    editVisuElementDesign: [
      // Basis-Design fuer Element 10: Hintergrund #1, Textfarbe #2, Schrift 18.
      { id: 1, targetid: 10, styletyp: 0, s9: "1", s14: "18", s15: "2", s31: "1", s27: "3" },
    ],
    editVisuBGcol: [{ id: 1, color: "#123456" }, { id: 3, color: "#abcdef" }],
    editVisuFGcol: [{ id: 2, color: "#ffffff" }],
    editVisuCmdList: [],
  };
}

const gaKey = (ga: string): string | undefined => (ga === "1/0/2" ? "wohnen.licht" : undefined);

function seiteWz(): ReturnType<typeof konvertiereVisu> {
  return konvertiereVisu(fixture(), gaKey);
}

test("Seiten entstehen mit Groesse aus der Element-Bounding-Box", () => {
  const { seiten } = seiteWz();
  expect([...seiten.keys()].sort()).toEqual(["details", "header", "wohnzimmer"]);
  expect(seiten.get("wohnzimmer")!.groessen.panel).toEqual({ w: 380, h: 380 });
});

test("controltyp 0 wird als Gruppenknoten uebersprungen, nicht gerendert", () => {
  const { seiten, bericht } = seiteWz();
  const wz = seiten.get("wohnzimmer")!;
  expect(bericht.gruppenknoten).toBe(1);
  expect(Object.values(wz.elemente).some((e) => (e.text ?? "") === "")).toBe(true);
  // Kein Element traegt den Gruppennamen.
  expect(JSON.stringify(wz.elemente)).not.toContain("Couch");
});

test("statischer Text landet im neuen text-Feld (B-8), Symbole werden entschluesselt", () => {
  const wz = seiteWz().seiten.get("wohnzimmer")!;
  const label = Object.values(wz.elemente).find((e) => e.text === "Wohnzimmer");
  expect(label?.preset).toBe("label");
  // &#xe92d -> echtes Symbol-Zeichen (Private Use Area).
  const taster = Object.values(wz.elemente).find((e) => e.preset === "taster");
  expect(taster?.text).toBe(String.fromCodePoint(0xe92d));
});

test("Taster setzt KO2 (gaid2) mit dem var15-Wert", () => {
  const wz = seiteWz().seiten.get("wohnzimmer")!;
  const taster = Object.values(wz.elemente).find((e) => e.preset === "taster")!;
  expect(taster.bindungen?.set).toBe("wohnen.licht");
  expect(taster.aktionen?.kurz).toEqual({ setze: true });
});

test("gaid ergibt eine Statusanzeige (kein Set)", () => {
  const wz = seiteWz().seiten.get("wohnzimmer")!;
  const status = Object.values(wz.elemente).find(
    (e) => e.preset === "statusanzeige" && e.bindungen?.status === "wohnen.licht" && !e.bindungen?.set,
  );
  expect(status).toBeDefined();
  expect(status?.ebene).toBe(2);
});

test("gotopageid wird Navigation zum Popup", () => {
  const wz = seiteWz().seiten.get("wohnzimmer")!;
  const nav = Object.values(wz.elemente).find((e) => e.preset === "navigation");
  expect(nav?.aktionen?.kurz).toEqual({ popup: "details" });
});

test("Formel-Text wird zu einem Wert-Format (Skalierung), nicht als Text", () => {
  const wz = seiteWz().seiten.get("wohnzimmer")!;
  const anzeige = Object.values(wz.elemente).find((e) => e.format?.skalierung !== undefined)!;
  expect(anzeige.format).toMatchObject({ skalierung: 100 / 255, dezimalstellen: 0, suffix: " %" });
  expect(anzeige.text).toBeUndefined();
});

test("Design-Slots werden zu einem dedizierten Design (Farben, Schrift, Rand)", () => {
  const { seiten, designs } = seiteWz();
  const el = seiten.get("wohnzimmer")!.elemente;
  const mitDesign = Object.values(el).find((e) => e.design)!;
  const d = designs[mitDesign.design!]!;
  expect(d.hintergrund).toBe("#123456");
  expect(d.text).toBe("#ffffff");
  expect(d.schriftgroesse).toBe(18);
  expect(d.rand).toMatchObject({ staerke: 1, farbe: "#abcdef" });
});

test("controltyp 1004 wird interaktiver Schalter mit An/Aus-bool_map (Dirty-Room-Spec)", () => {
  const wz = seiteWz().seiten.get("wohnzimmer")!;
  const sch = Object.values(wz.elemente).find(
    (e) => e.preset === "schalter" && e.format?.bool_map !== undefined,
  );
  expect(sch).toBeDefined();
  // var1=5 -> Knopftext idx2/idx3 = An/Aus; var6=0,var8=1 -> wahr=An.
  expect(sch?.format?.bool_map).toEqual({ wahr: "An", falsch: "Aus" });
  expect(sch?.bindungen).toMatchObject({ status: "wohnen.licht", set: "wohnen.licht" });
  expect(sch?.aktionen?.kurz).toEqual({ art: "umschalten" });
  // "deaktiviert" hat kein Zielfeld -> Notiz.
  expect(wz.notizen ?? "").toContain("deaktiviert");
});

test("Bericht zaehlt Unbekanntes und nicht aufgeloeste Bindungen", () => {
  const { bericht } = seiteWz();
  expect(bericht.visus).toBe(1);
  expect(bericht.unaufgeloesteBindungen).toBeGreaterThanOrEqual(1);
  expect([...bericht.nichtAbgebildet.keys()].join(" | ")).toContain("controltyp 999");
});

test("Fremdelemente und Symbol-Glyphen landen im Bericht (Migrations-Report)", () => {
  const { bericht } = seiteWz();
  // controltyp 999 hat keine Fachwerk-Entsprechung -> Posten fuer den Betreiber.
  const fremd = bericht.fremdElemente.find((f) => f.controltyp === 999);
  expect(fremd).toMatchObject({ verwendungen: 1, seiten: ["Wohnzimmer"] });
  // 1004 hat einen Katalogeintrag und gilt als erledigt.
  expect(bericht.fremdElemente.some((f) => f.controltyp === 1004)).toBe(false);
  // Der Symbol-Glyph des Tasters wird gezaehlt (Schrift fehlt im Export).
  expect(bericht.glyphen).toContainEqual({ codepoint: "E92D", verwendungen: 1 });
});

test("Seitenhintergrund kommt aus der Farbpalette (B1)", () => {
  const { seiten } = seiteWz();
  expect(seiten.get("wohnzimmer")!.hintergrund).toBe("#123456");
  // Ohne bgcolorid bleibt das Feld weg — kein erfundener Standardwert.
  expect(seiten.get("details")!.hintergrund).toBeUndefined();
});

test("globalinclude bindet die Include-Seiten ein; Include-Seiten selbst nicht (B2)", () => {
  const { seiten } = seiteWz();
  expect(seiten.get("wohnzimmer")!.includes).toEqual(["header"]);
  // Der Header hat selbst globalinclude=1, darf sich aber nicht einbinden.
  expect(seiten.get("header")!.includes).toBeUndefined();
  expect(seiten.get("header")!.typ).toBe("include");
  // Details hat globalinclude=0 -> keine Einbindung.
  expect(seiten.get("details")!.includes).toBeUndefined();
});

test("die erzeugten Seiten und Designs sind schema-konform", () => {
  const { seiten, designs } = seiteWz();
  expect(validateVisuDesigns(designs)).toBe(true);
  for (const [s, seite] of seiten) {
    const ok = validateVisuSeite(seite);
    if (!ok) throw new Error(`${s}: ${JSON.stringify(validateVisuSeite.errors)}`);
    expect(ok).toBe(true);
  }
});

test("alle Seiten teilen EINE Breite; die Hoehe umfasst eingebundene Seiten (B3)", () => {
  // Kalibriert am DEV-DOM: EDOMI entwirft auf einer Breite (viewport 1170) und
  // skaliert die ganze Seite. Die Hoehe umfasst die eingebundenen Seiten —
  // im Referenz-Panel spannt der Header jede Seite gleich hoch auf, deshalb
  // springt nichts. Ein hoher Header muss die einbindende Seite mitwachsen
  // lassen, sonst wird er abgeschnitten.
  const roh = fixture();
  // Header (Seite 3) hoch machen: ein Element bis y=2000.
  (roh.editVisuElement as Array<Record<string, unknown>>).push(
    { id: 90, controltyp: 1, pageid: 3, xpos: 0, ypos: 250, xsize: 1170, ysize: 1750, text: "" },
  );
  const { seiten } = konvertiereVisu(roh, gaKey);
  const breiten = [...seiten.values()].map((s) => s.groessen["panel"]!.w);
  expect(new Set(breiten).size).toBe(1);
  // Wohnzimmer bindet den (nun hohen) Header ein -> uebernimmt dessen Hoehe.
  expect(seiten.get("wohnzimmer")!.groessen["panel"]!.h).toBe(2000);
  expect(seiten.get("header")!.groessen["panel"]!.h).toBe(2000);
  // Details bindet nichts ein -> eigene Hoehe, nicht die des Headers.
  expect(seiten.get("details")!.groessen["panel"]!.h).toBeLessThan(2000);
});

test("Verlaeufe kommen in heutiger Syntax MIT umgerechnetem Winkel an", () => {
  const roh = fixture();
  (roh.editVisuBGcol as Array<Record<string, unknown>>)[0]!["color"] =
    "-webkit-linear-gradient(-90deg, #000 0%, #fff 100%)";
  const { seiten } = konvertiereVisu(roh, gaKey);
  // Nicht -90deg: die praefigierte Syntax misst den Winkel anders. Ein blosses
  // Streichen des Praefix drehte jeden Verlauf um 90 Grad.
  expect(seiten.get("wohnzimmer")!.hintergrund).toBe(
    "linear-gradient(180deg, #000 0%, #fff 100%)",
  );
});

test("Textausrichtung: nur Abweichungen von links landen im Design (Befund kreuz-und-quer)", () => {
  const roh = fixture();
  // Element 10 (Statusanzeige) bekommt s18=3 (rechts); ein zweites Design-Element
  // ohne s18 bleibt ohne textausrichtung (Default links im Renderer).
  const design = roh.editVisuElementDesign as Array<Record<string, unknown>>;
  design[0]!["s18"] = "3";
  design.push({ id: 2, targetid: 11, styletyp: 0, s14: "40" }); // Label ohne s18
  const { seiten, designs } = konvertiereVisu(roh, gaKey);
  const el = seiten.get("wohnzimmer")!.elemente;
  const rechts = Object.values(el).find((x) => x.bindungen?.status === "wohnen.licht" && x.design);
  expect(designs[rechts!.design!]!.textausrichtung).toBe("rechts");
  const label = Object.values(el).find((x) => x.text === "Wohnzimmer" && x.design);
  expect(designs[label!.design!]!.textausrichtung).toBeUndefined();
});

// ---- Verlaufsrichtung: alte vs. heutige Syntax ------------------------------
// Belegt am DOM des Altsystems: die Trennlinien im Kopfbereich laufen dort von
// oben nach unten. Wuerde man nur das Praefix streichen, liefen sie quer — der
// 12px schmale Strich saehe dann wie ein breites Band aus statt wie eine Linie.

test("farbe dreht -90deg auf 180deg (oben nach unten)", () => {
  expect(farbe("-webkit-linear-gradient(-90deg, rgb(2,39,66) 40%, rgb(23,94,144) 50%)")).toBe(
    "linear-gradient(180deg, rgb(2,39,66) 40%, rgb(23,94,144) 50%)",
  );
});

test("farbe dreht 90deg auf 0deg (unten nach oben)", () => {
  expect(farbe("-webkit-linear-gradient(90deg, #fff 0%, #000 100%)")).toBe(
    "linear-gradient(0deg, #fff 0%, #000 100%)",
  );
});

test("farbe kehrt Schluesselwoerter um: alt nennt den Start, neu das Ziel", () => {
  expect(farbe("-webkit-linear-gradient(left, #a, #b)")).toBe("linear-gradient(to right, #a, #b)");
  expect(farbe("-webkit-linear-gradient(top, #a, #b)")).toBe("linear-gradient(to bottom, #a, #b)");
});

test("farbe laesst einfache Farben und radiale Verlaeufe unangetastet", () => {
  expect(farbe("rgb(4, 48, 80)")).toBe("rgb(4, 48, 80)");
  expect(farbe("-webkit-radial-gradient(circle, #a, #b)")).toBe("radial-gradient(circle, #a, #b)");
});

// ---- Dynamisch dimensionierte Elemente -------------------------------------
// Das Altsystem addiert Elementgroesse und Design-Zuschlag: calc(<xsize>px +
// <s5>px). Wer nur xsize liest, macht aus einem dynamisch dimensionierten
// Element eines ohne Ausdehnung — beim Betreiber ein 1x1 Pixel grosser Knopf.

test("Groesse kommt aus xsize PLUS Design-Slot s5/s6", () => {
  const roh = fixture();
  const elemente = roh.editVisuElement as Array<Record<string, unknown>>;
  const el = elemente.find((e) => e["id"] === 10)!;
  el["xsize"] = 0;
  el["ysize"] = 0;
  (roh.editVisuElementDesign as Array<Record<string, unknown>>).push({
    targetid: 10,
    styletyp: 0,
    s5: "211",
    s6: "111",
  });
  const { seiten } = konvertiereVisu(roh, gaKey);
  const platz = Object.values(seiten.get("wohnzimmer")!.elemente)
    .map((e) => e.placements?.["panel"])
    .find((p) => p?.w === 211);
  expect(platz).toBeDefined();
  expect(platz!.h).toBe(111);
});

// ---- Interne KOs (Merker) --------------------------------------------------
// Interne KOs haben keine Busadresse. Der Hauptimport legt sie als interne
// Datenpunkte mit demselben Namen an — ueber den Namen sind sie bindbar. Ohne
// das verliert die Visu jede Bindung auf einen Merker.

test("internes KO wird ueber den Namen aufgeloest", () => {
  const roh = fixture();
  (roh.editKo as Array<Record<string, unknown>>).push({
    id: 370,
    ga: "370",
    name: "SR_Kue_Spots_Status",
  });
  const elemente = roh.editVisuElement as Array<Record<string, unknown>>;
  elemente.push({ id: 20, controltyp: 1, pageid: 1, gaid: 370, xpos: 0, ypos: 400, xsize: 10, ysize: 10, text: "" });
  const nameKey = (n: string): string | undefined =>
    n === "SR_Kue_Spots_Status" ? "status.sr_kue_spots_status" : undefined;
  const { seiten, bericht } = konvertiereVisu(roh, gaKey, { nameKey });
  const gebunden = Object.values(seiten.get("wohnzimmer")!.elemente).find(
    (e) => e.bindungen?.status === "status.sr_kue_spots_status",
  );
  expect(gebunden).toBeDefined();
  // Nur das Fixture-KO 300 (ohne Namenstreffer) bleibt unaufgeloest — das neue
  // KO 370 zaehlt NICHT mehr mit.
  expect(bericht.nichtAbgebildet.get("Bindung auf internes KO (keine GA) nicht aufloesbar")).toBe(1);
});

test("ohne Namensaufloesung bleibt das interne KO unaufgeloest (Verhalten wie bisher)", () => {
  const roh = fixture();
  (roh.editKo as Array<Record<string, unknown>>).push({ id: 371, ga: "371", name: "Merker" });
  (roh.editVisuElement as Array<Record<string, unknown>>).push({
    id: 21, controltyp: 1, pageid: 1, gaid: 371, xpos: 0, ypos: 420, xsize: 10, ysize: 10, text: "",
  });
  const { bericht } = konvertiereVisu(roh, gaKey);
  expect(bericht.unaufgeloesteBindungen).toBeGreaterThanOrEqual(1);
});

// ---- Bedingte Designs (styletyp 1) ----------------------------------------
// Das Altsystem tauscht die Optik, sobald der Wert des Steuer-KOs (gaid3) in
// den Bereich s1..s2 faellt. Fachwerk vergleicht STRIKT — der Vergleichswert
// muss deshalb den Typ des Ziel-Datenpunkts tragen.

test("styletyp 1 wird zu design_je_wert mit typrichtigem Vergleichswert", () => {
  const roh = fixture();
  (roh.editKo as Array<Record<string, unknown>>).push({ id: 370, ga: "370", name: "Merker" });
  (roh.editVisuElement as Array<Record<string, unknown>>).push({
    id: 22, controltyp: 1, pageid: 1, gaid3: 370, xpos: 0, ypos: 500, xsize: 40, ysize: 40, text: "X",
  });
  (roh.editVisuElementDesign as Array<Record<string, unknown>>).push(
    { id: 50, targetid: 22, styletyp: 1, s1: "11", s2: "11", s9: "1" },
    { id: 51, targetid: 22, styletyp: 1, s1: "12", s2: "12", s15: "2" },
  );
  const { seiten } = konvertiereVisu(roh, gaKey, {
    nameKey: (n) => (n === "Merker" ? "status.merker" : undefined),
    typVon: () => "zahl",
  });
  const el = Object.values(seiten.get("wohnzimmer")!.elemente).find((e) => e.design_je_wert)!;
  expect(el.bindungen?.status).toBe("status.merker");
  expect(el.design_je_wert!.map((r) => r.wenn)).toEqual([11, 12]);
});

test("bool-Datenpunkt bekommt true/false statt 1/0 — sonst trifft der Vergleich nie", () => {
  const roh = fixture();
  (roh.editKo as Array<Record<string, unknown>>).push({ id: 371, ga: "371", name: "Schalter" });
  (roh.editVisuElement as Array<Record<string, unknown>>).push({
    id: 23, controltyp: 1, pageid: 1, gaid3: 371, xpos: 0, ypos: 540, xsize: 40, ysize: 40, text: "Y",
  });
  (roh.editVisuElementDesign as Array<Record<string, unknown>>).push(
    { id: 52, targetid: 23, styletyp: 1, s1: "1", s2: "1", s9: "1" },
  );
  const { seiten } = konvertiereVisu(roh, gaKey, {
    nameKey: (n) => (n === "Schalter" ? "status.schalter" : undefined),
    typVon: () => "bool",
  });
  const el = Object.values(seiten.get("wohnzimmer")!.elemente).find((e) => e.design_je_wert)!;
  expect(el.design_je_wert![0]!.wenn).toBe(true);
});

test("echter Wertebereich (s1 != s2) wird nicht geraten, sondern gemeldet", () => {
  const roh = fixture();
  (roh.editVisuElement as Array<Record<string, unknown>>).push({
    id: 24, controltyp: 1, pageid: 1, xpos: 0, ypos: 580, xsize: 40, ysize: 40, text: "Z",
  });
  (roh.editVisuElementDesign as Array<Record<string, unknown>>).push(
    { id: 53, targetid: 24, styletyp: 1, s1: "10", s2: "20", s9: "1" },
  );
  const { seiten, bericht } = konvertiereVisu(roh, gaKey);
  expect(Object.values(seiten.get("wohnzimmer")!.elemente).some((e) => e.design_je_wert)).toBe(false);
  expect([...bericht.nichtAbgebildet.keys()].join(" | ")).toContain("Wertebereich");
});

test("Regler (controltyp 12/15) bleibt gemeldet, auch wenn sein KO aufloesbar ist", () => {
  const roh = fixture();
  (roh.editVisuElement as Array<Record<string, unknown>>).push({
    id: 25, controltyp: 15, pageid: 1, gaid: 100, xpos: 0, ypos: 620, xsize: 40, ysize: 40, text: "",
  });
  const { bericht } = konvertiereVisu(roh, gaKey);
  expect([...bericht.nichtAbgebildet.keys()].join(" | ")).toContain("Farb-/Dimmerregler");
});

test("s11 wird zur Beschriftung — aber nur beim bedingten Design", () => {
  const roh = fixture();
  (roh.editKo as Array<Record<string, unknown>>).push({ id: 372, ga: "372", name: "Zustand" });
  (roh.editVisuElement as Array<Record<string, unknown>>).push({
    id: 26, controltyp: 1, pageid: 1, gaid3: 372, xpos: 0, ypos: 660, xsize: 40, ysize: 40, text: "OFF",
  });
  (roh.editVisuElementDesign as Array<Record<string, unknown>>).push(
    // Statisches Design mit s11: muss ignoriert werden (das Altsystem leert es).
    { id: 54, targetid: 26, styletyp: 0, s9: "1", s11: "IGNORIEREN" },
    { id: 55, targetid: 26, styletyp: 1, s1: "1", s2: "1", s11: "ON" },
  );
  const { seiten, designs } = konvertiereVisu(roh, gaKey, {
    nameKey: (n) => (n === "Zustand" ? "status.zustand" : undefined),
    typVon: () => "zahl",
  });
  const el = Object.values(seiten.get("wohnzimmer")!.elemente).find((e) => e.text === "OFF")!;
  expect(designs[el.design!]!.beschriftung).toBeUndefined();
  expect(designs[el.design_je_wert![0]!.design]!.beschriftung).toBe("ON");
});

// ---- Klick-Befehle (editVisuCmdList) ---------------------------------------
// cmd 2 schreibt einen festen Wert, cmd 4 schaltet um, cmd 6 schaltet um und
// liest den Zustand an einem ANDEREN KO ab — auf dem Bus die Regel, weil
// Stellen und Melden getrennte Adressen haben.

test("cmd 4 wird ein Umschalter am Ziel-KO selbst", () => {
  const roh = fixture();
  (roh.editVisuElement as Array<Record<string, unknown>>).push({
    id: 30, controltyp: 1, pageid: 1, var3: 2, xpos: 0, ypos: 700, xsize: 40, ysize: 40, text: "T",
  });
  (roh.editVisuCmdList as Array<Record<string, unknown>>).push({
    id: 1, targetid: 30, cmd: 4, cmdid1: 100, cmdvalue1: "1",
  });
  const el = Object.values(konvertiereVisu(roh, gaKey).seiten.get("wohnzimmer")!.elemente)
    .find((e) => e.text === "T")!;
  expect(el.bindungen?.set).toBe("wohnen.licht");
  // status zeigt AUSDRUECKLICH auf das Ziel. Ohne das nimmt der Renderer seine
  // Rueckfallkette und liest die Anzeige-Bindung — dann schaltet der Knopf
  // beim zweiten Druecken nicht zurueck (am laufenden Panel beobachtet).
  expect(el.aktionen!.kurz).toEqual({ art: "umschalten", status: "wohnen.licht" });
});

test("cmd 6 nimmt den Ein-Wert und ein getrenntes Status-KO", () => {
  const roh = fixture();
  (roh.editKo as Array<Record<string, unknown>>).push({ id: 200, ga: "1/0/9" });
  (roh.editVisuElement as Array<Record<string, unknown>>).push({
    id: 31, controltyp: 1, pageid: 1, var3: 2, xpos: 0, ypos: 740, xsize: 40, ysize: 40, text: "D",
  });
  (roh.editVisuCmdList as Array<Record<string, unknown>>).push({
    id: 2, targetid: 31, cmd: 6, cmdid1: 100, cmdid2: 200, cmdvalue1: "20",
  });
  const gaKey2 = (ga: string): string | undefined =>
    ga === "1/0/2" ? "wohnen.licht" : ga === "1/0/9" ? "wohnen.licht_status" : undefined;
  const seiten = konvertiereVisu(roh, gaKey2).seiten;
  const el = Object.values(seiten.get("wohnzimmer")!.elemente).find((e) => e.text === "D")!;
  expect(el.aktionen!.kurz).toEqual({
    art: "umschalten",
    ein: 20,
    status: "wohnen.licht_status",
  });
  // UND die Seite muss schema-konform bleiben. Ohne diese Zeile faellt nur auf,
  // dass die Bedeutung stimmt — nicht, dass die Laufzeit sie annimmt. Genau so
  // ist ein falscher Schema-Verweis fuer status durchgerutscht und hat beim
  // Laden zwei ganze Seiten verschluckt.
  for (const [name, seite] of seiten) {
    if (!validateVisuSeite(seite)) {
      throw new Error(`${name}: ${JSON.stringify(validateVisuSeite.errors)}`);
    }
  }
});

test("unbekannter Befehl wird gemeldet statt geraten", () => {
  const roh = fixture();
  (roh.editVisuElement as Array<Record<string, unknown>>).push({
    id: 32, controltyp: 1, pageid: 1, var3: 2, xpos: 0, ypos: 780, xsize: 40, ysize: 40, text: "X",
  });
  (roh.editVisuCmdList as Array<Record<string, unknown>>).push({
    id: 3, targetid: 32, cmd: 17, cmdid1: 100,
  });
  const { bericht } = konvertiereVisu(roh, gaKey);
  expect([...bericht.nichtAbgebildet.keys()].join(" | ")).toContain("cmd 17");
});

// ---- Vollstaendige Design-Slots ---------------------------------------------
// Von 25 im Bestand belegten Slots wertete der Import 13 aus. Der Rest ist das,
// was designgesteuerte Elemente ausmacht: Schnitt, Schatten, Rahmenmuster,
// Innenabstand, Ecken. Ohne sie sieht ein Schiebeschalter aus wie ein Knopf.

test("Schnitt, Abstand, Schatten, Rahmenmuster und Bild kommen ins Design", () => {
  const roh = fixture();
  (roh.editVisuImg as unknown) = [{ id: 7, suffix: "png" }];
  (roh.editVisuElementDesign as Array<Record<string, unknown>>)[0] = {
    id: 1, targetid: 10, styletyp: 0,
    s9: "1", s15: "2",
    s16: "2", s17: "2", s12: "6", s10: "7",
    s3: "4", s4: "-2",
    s19: "1", s20: "2", s21: "3", s22: "2",
    s31: "2", s27: "3", s32: "3",
    s33: "0", s34: "2", s35: "5", s36: "1", s37: "2", s38: "2",
    s23: "10", s24: "10", s25: "4", s26: "4",
  };
  const { seiten, designs } = konvertiereVisu(roh, gaKey);
  const el = Object.values(seiten.get("wohnzimmer")!.elemente).find((e) => e.design)!;
  const d = designs[el.design!]!;
  expect(d.schriftstil).toBe("kursiv");
  expect(d.schriftstaerke).toBe("fett");
  expect(d.polsterung).toBe(6);
  expect(d.bild).toBe("img-7.png");
  expect(d.versatz).toEqual({ x: 4, y: -2 });
  expect(d.textschatten).toEqual({ x: 1, y: 2, unschaerfe: 3, farbe: "#ffffff" });
  expect(d.schatten).toEqual({ x: 0, y: 2, unschaerfe: 5, ueberstand: 1, farbe: "#ffffff", innen: true });
  expect(d.rand?.muster).toBe("striche");
  // Ecken ungleich -> je Ecke; gleiche Ecken bleiben die einfache Form.
  expect(d.rand?.radien).toEqual({ ol: 10, or: 10, ur: 4, ul: 4 });
  expect(d.rand?.radius).toBeUndefined();
  expect(validateVisuDesigns(designs)).toBe(true);
});

test("bedingte Designs OHNE gaid3 haengen am KO1 — der Normalfall der Standard-Schalter", () => {
  const roh = fixture();
  // Element mit gaid (KO1), OHNE gaid3, mit zwei Zustandsdesigns.
  (roh.editVisuElement as Array<Record<string, unknown>>).push({
    id: 40, controltyp: 1, pageid: 1, gaid: 100, xpos: 0, ypos: 900, xsize: 40, ysize: 40, text: String.fromCodePoint(0xe92d),
  });
  (roh.editVisuElementDesign as Array<Record<string, unknown>>).push(
    { id: 60, targetid: 40, styletyp: 1, s1: "1", s2: "1", s15: "2" },
  );
  const { seiten } = konvertiereVisu(roh, gaKey, { typVon: () => "bool" });
  const el = Object.values(seiten.get("wohnzimmer")!.elemente).find((el2) => el2.design_je_wert)!;
  expect(el.bindungen?.status).toBe("wohnen.licht");
  expect(el.design_je_wert![0]!.wenn).toBe(true);
});

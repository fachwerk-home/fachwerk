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

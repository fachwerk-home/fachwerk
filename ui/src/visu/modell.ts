import type {
  VisuDesign,
  VisuDesigns,
  VisuElement,
  VisuPlacement,
  VisuSeite,
  WertFormat,
} from "../../../schema/src/visu.ts";
import {
  effektivesFormat,
  formatiereWert,
} from "../../../core/src/visu/format.ts";

export interface WertEintrag {
  wert: unknown;
  format?: WertFormat;
}

const SCHRIFT_ENDUNGEN = ["ttf", "woff2"] as const;
const PRIVATBEREICH_START = 0xE000;
const PRIVATBEREICH_ENDE = 0xF8FF;
const MAX_SEITEN_SKALIERUNG = 1.5;
const PRESETS_OHNE_STANDARD_KACHEL = new Set(["label", "taster", "schalter", "navigation", "symbol"]);

/** Größter Breakpoint, der hineinpasst; auf schmaleren Geräten der kleinste. */
export function waehleBreakpoint(seite: VisuSeite, breite: number): string {
  const passend = Object.entries(seite.groessen)
    .filter(([, groesse]) => groesse.w <= breite)
    .sort(([aKey, a], [bKey, b]) => a.w - b.w || aKey.localeCompare(bKey));
  if (passend.length > 0) return passend.at(-1)?.[0] ?? seite.basis;
  return Object.entries(seite.groessen)
    .sort(([aKey, a], [bKey, b]) => a.w - b.w || aKey.localeCompare(bKey))[0]?.[0]
    ?? seite.basis;
}

/**
 * Das importierte Panel ist auf eine feste Seitenbreite entworfen. Der Client
 * skaliert deshalb nur aus der Breite heraus; die Hoehe folgt und scrollt.
 * Hochskalieren ist erlaubt, aber gedeckelt, damit ein Tablet-Panel auf einem
 * sehr breiten Monitor nicht absurd gross wird.
 */
export function seitenSkalierung(
  seitenBreite: number | undefined,
  viewportBreite: number,
): number {
  if (!seitenBreite || !Number.isFinite(seitenBreite) || seitenBreite <= 0) return 1;
  if (!Number.isFinite(viewportBreite) || viewportBreite <= 0) return 1;
  return Math.min(viewportBreite / seitenBreite, MAX_SEITEN_SKALIERUNG);
}

/** Eine partielle Geräte-Platzierung überschreibt die geerbte Basis feldweise. */
export function placementFuer(
  element: VisuElement,
  breakpoint: string,
  basis: string,
): VisuPlacement | undefined {
  const basisPlacement = element.placements?.[basis];
  const placement = element.placements?.[breakpoint];
  if (!basisPlacement && !placement) return undefined;
  if (breakpoint === basis) return basisPlacement;
  return {
    ...basisPlacement,
    ...placement,
    ...((basisPlacement?.format || placement?.format)
      ? { format: { ...basisPlacement?.format, ...placement?.format } }
      : {}),
  };
}

function mischeDesign(basis?: VisuDesign, override?: VisuDesign): VisuDesign {
  return {
    ...basis,
    ...override,
    ...((basis?.rand || override?.rand) ? { rand: { ...basis?.rand, ...override?.rand } } : {}),
  };
}

function cssString(wert: string): string {
  return wert.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
}

function schriftName(schriftart: string): string | null {
  const name = schriftart.trim();
  return name.length > 0 ? name : null;
}

export function schriftfamilieFuer(schriftart: string | undefined): string | undefined {
  const name = schriftart ? schriftName(schriftart) : null;
  return name ? `"${cssString(`Fachwerk Visu ${name}`)}"` : undefined;
}

export function schriftartenAusDesigns(designs: VisuDesigns): string[] {
  const schriften = new Set<string>();
  for (const design of Object.values(designs)) {
    const name = design.schriftart ? schriftName(design.schriftart) : null;
    if (name) schriften.add(name);
  }
  return [...schriften].sort((a, b) => a.localeCompare(b));
}

export function fontFaceCssFuerSchriften(schriftarten: readonly string[]): string {
  const schriften = [...new Set(
    schriftarten
      .map((schriftart) => schriftName(schriftart))
      .filter((schriftart): schriftart is string => Boolean(schriftart)),
  )]
    .sort((a, b) => a.localeCompare(b));
  return schriften.map((schriftart) => {
    const familie = schriftfamilieFuer(schriftart)!;
    const quellen = SCHRIFT_ENDUNGEN.map((endung) => {
      const datei = `${schriftart}.${endung}`;
      const format = endung === "ttf" ? "truetype" : "woff2";
      return `url("/api/visu/datei/${encodeURIComponent(datei)}") format("${format}")`;
    }).join(", ");
    return `@font-face { font-family: ${familie}; src: ${quellen}; font-display: swap; }`;
  }).join("\n");
}

export function fontFaceCssFuerDesigns(designs: VisuDesigns): string {
  return fontFaceCssFuerSchriften(schriftartenAusDesigns(designs));
}

export function einzelnesPrivatesSymbol(text: string | undefined): boolean {
  if (!text) return false;
  const zeichen = [...text];
  if (zeichen.length !== 1) return false;
  const codepoint = zeichen[0]?.codePointAt(0);
  return codepoint !== undefined
    && codepoint >= PRIVATBEREICH_START
    && codepoint <= PRIVATBEREICH_ENDE;
}

export function navigationZeigtPfeil(label: string, design: VisuDesign): boolean {
  return label.trim().length > 0
    && !einzelnesPrivatesSymbol(label)
    && !einzelnesPrivatesSymbol(design.icon)
    && !schriftName(design.schriftart ?? "");
}

export function fachwerkKachelFuer(element: VisuElement, design: VisuDesign): boolean {
  const rand = design.rand;
  const hatEigeneFlaeche = design.hintergrund !== undefined
    || design.bild !== undefined
    || design.polsterung !== undefined
    || design.schatten !== undefined
    || rand?.staerke !== undefined
    || rand?.farbe !== undefined
    || rand?.farben !== undefined
    || rand?.radius !== undefined
    || rand?.radien !== undefined
    || rand?.muster !== undefined;
  if (hatEigeneFlaeche) return false;
  return !PRESETS_OHNE_STANDARD_KACHEL.has(element.preset ?? "");
}

export function textausrichtungCss(
  ausrichtung: VisuDesign["textausrichtung"] | undefined,
): "left" | "center" | "right" | "justify" {
  switch (ausrichtung) {
    case "zentriert": return "center";
    case "rechts": return "right";
    case "blocksatz": return "justify";
    case "links":
    default: return "left";
  }
}

/** Statusregeln wählen ein Override-Design; nicht gesetzte Felder fallen zurück. */
export function designFuer(
  element: VisuElement,
  designs: VisuDesigns,
  status: unknown,
): VisuDesign {
  const basis = element.design ? designs[element.design] : undefined;
  const dynamisch = element.design_je_wert?.find((regel) => regel.wenn === status)?.design;
  return mischeDesign(basis, dynamisch ? designs[dynamisch] : undefined);
}

/**
 * Die Platzierung enthält schon den Zuschlag ihres Grunddesigns. Ein
 * Zustandsdesign ersetzt diesen daher, statt ihn noch einmal aufzuschlagen.
 */
export function groesseFuerPlacement(
  element: VisuElement,
  designs: VisuDesigns,
  status: unknown,
  placement: VisuPlacement,
): { w: number; h: number } {
  const basis = element.design ? designs[element.design] : undefined;
  const regel = element.design_je_wert?.find((eintrag) => eintrag.wenn === status);
  const aktiv = regel?.design ? designs[regel.design] : basis;
  return {
    w: (placement.w ?? 0) - (basis?.groessenzuschlag?.b ?? 0) + (aktiv?.groessenzuschlag?.b ?? 0),
    h: (placement.h ?? 0) - (basis?.groessenzuschlag?.h ?? 0) + (aktiv?.groessenzuschlag?.h ?? 0),
  };
}

export interface SchiebeschalterZustand {
  an: boolean;
  flaeche: VisuDesign;
  knopf?: VisuDesign;
  knopfLinks: boolean;
  knopfAnteil: number;
  dauerMs: number;
  knopfGroesse?: { b: number; h: number };
  knopfVersatz?: { x: number; y: number };
}

/** Alles ausser einem klaren Aus-Wert ist der eingeschaltete Zustand. */
function schiebeschalterIstAn(wert: unknown): boolean {
  if (wert === false || wert === 0 || wert === "" || wert === null || wert === undefined) return false;
  if (typeof wert === "number") return Number.isFinite(wert);
  return typeof wert === "string" || typeof wert === "boolean";
}

export interface ReglerKonfiguration {
  min: number;
  max: number;
  schritt: number;
  schrittWinkel: number;
  winkelVon: number;
  winkelBis: number;
  knopfAnteil: number;
  groesse: number;
}

function parameterZahl(parameter: Record<string, unknown> | undefined, key: string, standard: number): number {
  const wert = parameter?.[key];
  return typeof wert === "number" && Number.isFinite(wert) ? wert : standard;
}

/**
 * Schiebeschalter haben bewusst keine eingebaute Optik: Die beiden
 * Flaechendesigns und optionalen Knopfdesigns bestimmen sie vollstaendig.
 */
export function schiebeschalterZustand(
  element: VisuElement,
  designs: VisuDesigns,
  status: unknown,
): SchiebeschalterZustand {
  const zustaende = element.parameter?.["zustaende"];
  if (Array.isArray(zustaende)) {
    const gueltige = zustaende.filter((zustand): zustand is Record<string, unknown> => (
      typeof zustand === "object" && zustand !== null
      && typeof zustand["rahmen"] === "string" && typeof zustand["knopf"] === "string"
    ));
    const zustand = gueltige.find((eintrag) => eintrag["wenn"] === status) ?? gueltige[0];
    if (zustand) {
      const knopf = designs[zustand["knopf"] as string];
      return {
        an: schiebeschalterIstAn(status),
        flaeche: designs[zustand["rahmen"] as string] ?? {},
        ...(knopf ? { knopf } : {}),
        knopfLinks: false,
        knopfAnteil: 0,
        dauerMs: Math.max(0, parameterZahl(element.parameter, "dauer_ms", 0)),
        ...(knopf ? {
          // Die Altanlage zählt den Basispixel nicht im Zuschlag mit.
          knopfGroesse: { b: knopf.groessenzuschlag?.b ?? 0, h: knopf.groessenzuschlag?.h ?? 0 },
          knopfVersatz: { x: knopf.versatz?.x ?? 0, y: knopf.versatz?.y ?? 0 },
        } : {}),
      };
    }
  }
  const an = schiebeschalterIstAn(status);
  const ausDesign = typeof element.parameter?.["aus"] === "string" ? designs[element.parameter["aus"]] : undefined;
  const einDesign = typeof element.parameter?.["ein"] === "string" ? designs[element.parameter["ein"]] : undefined;
  const knopfAus = typeof element.parameter?.["knopf_aus"] === "string" ? designs[element.parameter["knopf_aus"]] : undefined;
  const knopfEin = typeof element.parameter?.["knopf_ein"] === "string" ? designs[element.parameter["knopf_ein"]] : undefined;
  const einLiegtLinks = element.parameter?.["ein_liegt"] === "links";
  const knopfAnteil = Math.min(100, Math.max(0, parameterZahl(element.parameter, "knopf_anteil", 45)));

  return {
    an,
    flaeche: an ? einDesign ?? {} : ausDesign ?? {},
    ...(knopfAus && knopfEin ? { knopf: an ? knopfEin : knopfAus } : {}),
    knopfLinks: an ? einLiegtLinks : !einLiegtLinks,
    knopfAnteil,
    dauerMs: Math.max(0, parameterZahl(element.parameter, "dauer_ms", 0)),
  };
}

export interface BildPixel { r: number; g: number; b: number; a: number }

function hexTeil(wert: number): string {
  return Math.min(255, Math.max(0, Math.round(wert))).toString(16).padStart(2, "0");
}

function hsvFuerRgb({ r, g, b }: BildPixel): string {
  const rot = r / 255;
  const gruen = g / 255;
  const blau = b / 255;
  const max = Math.max(rot, gruen, blau);
  const min = Math.min(rot, gruen, blau);
  const delta = max - min;
  const hue = delta === 0 ? 0 : 60 * (max === rot ? ((gruen - blau) / delta % 6) : max === gruen ? (blau - rot) / delta + 2 : (rot - gruen) / delta + 4);
  return `${hexTeil(((hue + 360) % 360) / 360 * 255)}${hexTeil(max === 0 ? 0 : delta / max * 255)}${hexTeil(max * 255)}`;
}

export function farbwertFuerPixel(pixel: BildPixel, modus: unknown, alphaSchwelle: number): string | number | undefined {
  if (pixel.a < alphaSchwelle) return undefined;
  if (modus === "dimmen") return Math.round(0.2126 * pixel.r + 0.7152 * pixel.g + 0.0722 * pixel.b);
  if (modus === "hsv") return hsvFuerRgb(pixel);
  return `${hexTeil(pixel.r)}${hexTeil(pixel.g)}${hexTeil(pixel.b)}`;
}

export function reglerKonfiguration(element: VisuElement): ReglerKonfiguration {
  const min = parameterZahl(element.parameter, "min", 0);
  const rohMax = parameterZahl(element.parameter, "max", 255);
  const max = rohMax > min ? rohMax : min + 1;
  return {
    min,
    max,
    schritt: Math.max(Number.EPSILON, parameterZahl(element.parameter, "schritt", 1)),
    schrittWinkel: Math.max(Number.EPSILON, parameterZahl(element.parameter, "schritt_winkel", 5)),
    winkelVon: parameterZahl(element.parameter, "winkel_von", 210),
    winkelBis: parameterZahl(element.parameter, "winkel_bis", 510),
    knopfAnteil: Math.min(100, Math.max(0, parameterZahl(element.parameter, "knopf_anteil", 70))),
    groesse: Math.max(0, parameterZahl(element.parameter, "groesse", 90)),
  };
}

export function begrenzeReglerWert(wert: number, konfiguration: ReglerKonfiguration): number {
  return Math.min(konfiguration.max, Math.max(konfiguration.min, wert));
}

export function winkelFuerReglerWert(wert: number, konfiguration: ReglerKonfiguration): number {
  const begrenzt = begrenzeReglerWert(wert, konfiguration);
  return konfiguration.winkelVon
    + ((begrenzt - konfiguration.min) / (konfiguration.max - konfiguration.min))
      * (konfiguration.winkelBis - konfiguration.winkelVon);
}

export function reglerWertFuerWinkel(winkel: number, konfiguration: ReglerKonfiguration): number {
  const von = konfiguration.winkelVon;
  const bis = konfiguration.winkelBis;
  let fortschritt = winkel;
  while (fortschritt < von) fortschritt += 360;
  while (fortschritt > von + 360) fortschritt -= 360;
  const anteil = Math.min(1, Math.max(0, (fortschritt - von) / (bis - von)));
  const rohwert = konfiguration.min + anteil * (konfiguration.max - konfiguration.min);
  return begrenzeReglerWert(Math.round(rohwert / konfiguration.schritt) * konfiguration.schritt, konfiguration);
}

function winkelDifferenz(von: number, bis: number): number {
  let differenz = bis - von;
  while (differenz <= -180) differenz += 360;
  while (differenz > 180) differenz -= 360;
  return differenz;
}

function rundeReglerWert(wert: number, konfiguration: ReglerKonfiguration): number {
  return begrenzeReglerWert(Math.round(wert / konfiguration.schritt) * konfiguration.schritt, konfiguration);
}

/** Berechnet den Zielwert einer Geste, ohne die Zeigerlage relativ zu deuten. */
export function reglerWertFuerGeste(
  art: unknown,
  startwert: number,
  drehung: number,
  winkel: number,
  konfiguration: ReglerKonfiguration,
): number {
  if (art === "poti_relativ") {
    const faktor = (konfiguration.max - konfiguration.min) / (konfiguration.winkelBis - konfiguration.winkelVon);
    return rundeReglerWert(startwert + drehung * faktor, konfiguration);
  }
  if (art === "inkrement") {
    const schritte = Math.trunc(drehung / konfiguration.schrittWinkel);
    return rundeReglerWert(startwert + schritte * konfiguration.schritt, konfiguration);
  }
  return reglerWertFuerWinkel(winkel, konfiguration);
}

/** Addiert eine Zeigerbewegung zur Geste und behandelt den Nulldurchgang. */
export function schreibeReglerDrehungFort(bisherigeDrehung: number, vorherigerWinkel: number, winkel: number): number {
  return bisherigeDrehung + winkelDifferenz(vorherigerWinkel, winkel);
}

/** Alle Reglerarten schreiben ihren fortgeschriebenen Absolutwert. */
export function reglerSchreibwert(art: unknown, startwert: number, zielwert: number): number {
  void art;
  void startwert;
  return zielwert;
}

export function formatierterWert(
  schluessel: string | undefined,
  werte: ReadonlyMap<string, WertEintrag>,
  elementFormat?: WertFormat,
  placementFormat?: WertFormat,
): string {
  if (!schluessel) return "";
  const eintrag = werte.get(schluessel);
  const format = effektivesFormat(eintrag?.format, elementFormat, placementFormat);
  return formatiereWert(eintrag?.wert, format, (key) => werte.get(key)?.wert);
}

export interface ElementAnzeige {
  label: string;
  wert: string;
  rohwert: unknown;
  hatText: boolean;
  hatWert: boolean;
  wertAngefordert: boolean;
}

export type VisuAnzeigeKontext = "client" | "editor";

export interface RenderElement {
  renderKey: string;
  seiteKey: string;
  elementKey: string;
  seite: VisuSeite;
  element: VisuElement;
}

function elementText(element: VisuElement): string | undefined {
  return element.text && element.text.trim().length > 0 ? element.text : undefined;
}

/** Die Knopfbeschriftung gewinnt; text_im_knopf verschiebt nur den Elementtext. */
export function schiebeschalterKnopfBeschriftung(element: VisuElement, knopf: VisuDesign): string | undefined {
  return knopf.beschriftung ?? (element.parameter?.["text_im_knopf"] === true ? elementText(element) : undefined);
}

export function beschriftungFuerElement(element: VisuElement, design?: VisuDesign): string | undefined {
  return design?.beschriftung ?? elementText(element);
}

export function elementAnzeige(
  kontext: VisuAnzeigeKontext,
  key: string,
  element: VisuElement,
  werte: ReadonlyMap<string, WertEintrag>,
  placement?: VisuPlacement,
  design?: VisuDesign,
): ElementAnzeige {
  const wertKey = element.bindungen?.["display"] ?? element.bindungen?.["status"];
  const wert = formatierterWert(wertKey, werte, element.format, placement?.format);
  const rohwert = wertKey ? werte.get(wertKey)?.wert : undefined;
  const text = beschriftungFuerElement(element, design);
  const label = text ?? (kontext === "editor" ? lesbarerName(key) : "");
  return {
    label,
    wert: typeof rohwert === "boolean" && (wert === "true" || wert === "false")
      ? (rohwert ? "An" : "Aus")
      : wert,
    rohwert,
    hatText: text !== undefined,
    hatWert: wertKey !== undefined,
    wertAngefordert: element.format !== undefined || placement?.format !== undefined,
  };
}

export function startSeite(
  seiten: Record<string, VisuSeite>,
  gewuenscht?: string | null,
): string | null {
  if (gewuenscht && seiten[gewuenscht]?.typ === "seite") return gewuenscht;
  return Object.keys(seiten)
    .filter((key) => seiten[key]?.typ === "seite")
    .sort()[0] ?? null;
}

export function renderElementeFuerSeite(
  seiten: Record<string, VisuSeite>,
  seiteKey: string,
): RenderElement[] {
  const seite = seiten[seiteKey];
  if (!seite) return [];
  const includeElemente = (seite.includes ?? []).flatMap((includeKey) => {
    const include = seiten[includeKey];
    if (include?.typ !== "include") return [];
    return Object.entries(include.elemente).map(([elementKey, element]) => ({
      renderKey: `${includeKey}:${elementKey}`,
      seiteKey: includeKey,
      elementKey,
      seite: include,
      element,
    }));
  });
  return [
    ...includeElemente,
    ...Object.entries(seite.elemente).map(([elementKey, element]) => ({
      renderKey: `${seiteKey}:${elementKey}`,
      seiteKey,
      elementKey,
      seite,
      element,
    })),
  ];
}

export function lesbarerName(key: string): string {
  return key.replaceAll("_", " ").replace(/^./, (zeichen) => zeichen.toUpperCase());
}

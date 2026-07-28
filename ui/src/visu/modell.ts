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
    || rand?.staerke !== undefined
    || rand?.farbe !== undefined
    || rand?.radius !== undefined;
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

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

export function startSeite(
  seiten: Record<string, VisuSeite>,
  gewuenscht?: string | null,
): string | null {
  if (gewuenscht && seiten[gewuenscht]?.typ === "seite") return gewuenscht;
  return Object.keys(seiten)
    .filter((key) => seiten[key]?.typ === "seite")
    .sort()[0] ?? null;
}

export function lesbarerName(key: string): string {
  return key.replaceAll("_", " ").replace(/^./, (zeichen) => zeichen.toUpperCase());
}

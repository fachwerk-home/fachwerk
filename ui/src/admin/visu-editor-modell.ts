import type { VisuElement, VisuPlacement, VisuPreset, VisuSeite, VisuWidget } from "../../../schema/src/visu.ts";
import { placementFuer } from "../visu/modell.ts";

export type PaletteTyp =
  | { art: "preset"; preset: VisuPreset }
  | { art: "widget"; widget: VisuWidget };

export function rastere(wert: number, raster: number): number {
  if (raster <= 1) return Math.round(wert);
  return Math.round(wert / raster) * raster;
}

export function freierKey(seite: VisuSeite, basis: string): string {
  const roh = basis.toLowerCase().replaceAll(/[^a-z0-9_]/g, "_").replaceAll(/_+/g, "_").replace(/^_+/, "") || "element";
  const start = /^[a-z]/.test(roh) ? roh : `e_${roh}`;
  if (!seite.elemente[start]) return start;
  for (let i = 2; i < 1000; i += 1) {
    const key = `${start}_${i}`;
    if (!seite.elemente[key]) return key;
  }
  return `${start}_${Date.now()}`;
}

export function standardElement(typ: PaletteTyp, breakpoint: string, x: number, y: number): VisuElement {
  const placement: VisuPlacement = { x, y, w: 160, h: 80 };
  if (typ.art === "preset") {
    const element: VisuElement = { preset: typ.preset, design: "standard", placements: { [breakpoint]: placement } };
    if (typ.preset === "schalter") {
      element.bindungen = { set: "wohnen.taster", status: "wohnen.licht" };
      element.aktionen = { kurz: { art: "umschalten" } };
      placement.w = 150;
      placement.h = 110;
    } else if (typ.preset === "taster") {
      element.bindungen = { set: "wohnen.taster" };
      element.aktionen = { kurz: { setze: true } };
    } else if (typ.preset === "wertanzeige" || typ.preset === "label") {
      element.bindungen = { display: "wohnen.zaehler" };
    } else if (typ.preset === "statusanzeige" || typ.preset === "symbol") {
      element.bindungen = { status: "wohnen.licht" };
    } else if (typ.preset === "navigation") {
      element.aktionen = { kurz: { seite: "zentrale" } };
    }
    return element;
  }
  if (typ.widget === "slider") {
    return {
      widget: "slider",
      parameter: { min: 0, max: 100 },
      bindungen: { display: "wohnen.zaehler", set: "wohnen.zaehler" },
      design: "standard",
      placements: { [breakpoint]: { x, y, w: 360, h: 96 } },
    };
  }
  return {
    widget: "diagramm",
    parameter: { archiv: "schaltzaehler", stunden: 24 },
    design: "standard",
    placements: { [breakpoint]: { x, y, w: 520, h: 260 } },
  };
}

export function materialisierePlacement(
  seite: VisuSeite,
  elementKey: string,
  breakpoint: string,
): VisuPlacement | null {
  const element = seite.elemente[elementKey];
  if (!element) return null;
  element.placements ??= {};
  if (!element.placements[breakpoint]) {
    const geerbt = placementFuer(element, breakpoint, seite.basis) ?? { x: 0, y: 0, w: 120, h: 70 };
    element.placements[breakpoint] = { ...geerbt };
  }
  return element.placements[breakpoint] ?? null;
}

export function verschiebeElemente(
  seite: VisuSeite,
  keys: readonly string[],
  breakpoint: string,
  dx: number,
  dy: number,
  raster: number,
): VisuSeite {
  const neu = structuredClone(seite);
  for (const key of keys) {
    const placement = materialisierePlacement(neu, key, breakpoint);
    if (!placement) continue;
    placement.x = rastere((placement.x ?? 0) + dx, raster);
    placement.y = rastere((placement.y ?? 0) + dy, raster);
  }
  return neu;
}

export function skaliereElement(
  seite: VisuSeite,
  key: string,
  breakpoint: string,
  dw: number,
  dh: number,
  raster: number,
): VisuSeite {
  const neu = structuredClone(seite);
  const placement = materialisierePlacement(neu, key, breakpoint);
  if (placement) {
    placement.w = Math.max(raster, rastere((placement.w ?? 80) + dw, raster));
    placement.h = Math.max(raster, rastere((placement.h ?? 40) + dh, raster));
  }
  return neu;
}

export function fuegeElementEin(
  seite: VisuSeite,
  typ: PaletteTyp,
  breakpoint: string,
  x: number,
  y: number,
  raster: number,
): { seite: VisuSeite; key: string } {
  const neu = structuredClone(seite);
  const key = freierKey(neu, typ.art === "preset" ? typ.preset : typ.widget);
  neu.elemente[key] = standardElement(typ, breakpoint, rastere(x, raster), rastere(y, raster));
  return { seite: neu, key };
}

export function dupliziereElemente(
  seite: VisuSeite,
  keys: readonly string[],
  breakpoint: string,
  raster: number,
): { seite: VisuSeite; keys: string[] } {
  const neu = structuredClone(seite);
  const neueKeys: string[] = [];
  for (const key of keys) {
    const element = neu.elemente[key];
    if (!element) continue;
    const neuKey = freierKey(neu, `${key}_kopie`);
    const kopie = structuredClone(element);
    neu.elemente[neuKey] = kopie;
    const placement = materialisierePlacement(neu, neuKey, breakpoint);
    if (placement) {
      placement.x = rastere((placement.x ?? 0) + raster * 2, raster);
      placement.y = rastere((placement.y ?? 0) + raster * 2, raster);
    }
    neueKeys.push(neuKey);
  }
  return { seite: neu, keys: neueKeys };
}

export function loescheElemente(seite: VisuSeite, keys: readonly string[]): VisuSeite {
  const neu = structuredClone(seite);
  for (const key of keys) delete neu.elemente[key];
  return neu;
}

import type { VisuElement, VisuPlacement, VisuSeite } from "../../../schema/src/visu.ts";

const SEITEN_REIHENFOLGE = ["typ", "name", "basis", "groessen", "gruppen", "elemente", "notizen"] as const;
const ELEMENT_REIHENFOLGE = [
  "preset",
  "widget",
  "parameter",
  "bindungen",
  "gruppe",
  "ebene",
  "design",
  "design_je_wert",
  "aktionen",
  "format",
  "placements",
] as const;
const PLACEMENT_REIHENFOLGE = ["x", "y", "w", "h", "sichtbar", "format"] as const;

function skalar(wert: unknown): string {
  if (typeof wert === "number" || typeof wert === "boolean") return String(wert);
  if (wert === null) return "null";
  if (typeof wert !== "string") return JSON.stringify(wert);
  if (istYamlTypString(wert)) return JSON.stringify(wert);
  if (/^[a-zA-Z0-9_.:/-]+$/.test(wert)) return wert;
  return JSON.stringify(wert);
}

function istYamlTypString(wert: string): boolean {
  return /^(?:true|false|null)$/i.test(wert) || /^[-+]?(?:\d+|\d+\.\d+|\.\d+)(?:e[-+]?\d+)?$/i.test(wert);
}

function istLeererContainer(wert: unknown): boolean {
  return Array.isArray(wert)
    ? wert.length === 0
    : Boolean(wert && typeof wert === "object" && Object.keys(wert).length === 0);
}

function ordne(obj: Record<string, unknown>, reihenfolge: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of reihenfolge) {
    if (obj[key] !== undefined) out[key] = obj[key];
  }
  for (const key of Object.keys(obj).sort()) {
    if (!reihenfolge.includes(key) && obj[key] !== undefined) out[key] = obj[key];
  }
  return out;
}

function zeilen(obj: unknown, einzug = 0): string[] {
  const pad = " ".repeat(einzug);
  if (Array.isArray(obj)) {
    if (obj.length === 0) return [`${pad}[]`];
    const out: string[] = [];
    for (const eintrag of obj) {
      if (istLeererContainer(eintrag)) {
        out.push(`${pad}- ${Array.isArray(eintrag) ? "[]" : "{}"}`);
        continue;
      }
      if (typeof eintrag === "object" && eintrag !== null) {
        const [erste, ...rest] = zeilen(eintrag, einzug + 2);
        out.push(`${pad}- ${(erste ?? "").trimStart()}`);
        out.push(...rest);
      } else {
        out.push(`${pad}- ${skalar(eintrag)}`);
      }
    }
    return out;
  }
  if (typeof obj !== "object" || obj === null) return [`${pad}${skalar(obj)}`];
  if (istLeererContainer(obj)) return [`${pad}{}`];

  const out: string[] = [];
  for (const [key, wert] of Object.entries(obj as Record<string, unknown>)) {
    if (wert === undefined) continue;
    if (istLeererContainer(wert)) {
      out.push(`${pad}${key}: ${Array.isArray(wert) ? "[]" : "{}"}`);
    } else if (typeof wert === "object" && wert !== null) {
      out.push(`${pad}${key}:`);
      out.push(...zeilen(wert, einzug + 2));
    } else {
      out.push(`${pad}${key}: ${skalar(wert)}`);
    }
  }
  return out;
}

function ordnePlacement(placement: VisuPlacement): Record<string, unknown> {
  return ordne(placement as Record<string, unknown>, PLACEMENT_REIHENFOLGE);
}

function ordneElement(element: VisuElement): Record<string, unknown> {
  const roh = { ...element } as Record<string, unknown>;
  if (element.bindungen && Object.keys(element.bindungen).length === 0) delete roh["bindungen"];
  if (element.aktionen && Object.keys(element.aktionen).length === 0) delete roh["aktionen"];
  if (element.placements) {
    const placements: Record<string, unknown> = {};
    for (const key of Object.keys(element.placements).sort()) {
      placements[key] = ordnePlacement(element.placements[key] ?? {});
    }
    roh["placements"] = placements;
  }
  return ordne(roh, ELEMENT_REIHENFOLGE);
}

export function seiteZuYaml(seite: VisuSeite): string {
  const elemente: Record<string, unknown> = {};
  for (const key of Object.keys(seite.elemente).sort()) {
    elemente[key] = ordneElement(seite.elemente[key] ?? {});
  }
  const groessen: Record<string, unknown> = {};
  for (const key of Object.keys(seite.groessen).sort()) groessen[key] = seite.groessen[key];
  const out = ordne({ ...seite, groessen, elemente }, SEITEN_REIHENFOLGE);
  return `${zeilen(out).join("\n")}\n`;
}

export function inhaltZumSpeichern(seite: VisuSeite, raw: string | null, dirty: boolean): string {
  return !dirty && raw !== null ? raw : seiteZuYaml(seite);
}

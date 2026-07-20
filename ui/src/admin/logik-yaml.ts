import type { LogikKante, LogikKnoten, LogikSeite } from "../../../schema/src/index.ts";

const SEITEN_REIHENFOLGE = ["notizen", "knoten", "kanten"] as const;
const KNOTEN_REIHENFOLGE = ["baustein", "parameter"] as const;
const KANTEN_REIHENFOLGE = ["von", "nach", "trigger"] as const;

function skalar(wert: unknown): string {
  if (typeof wert === "number" || typeof wert === "boolean") return String(wert);
  if (wert === null) return "null";
  if (typeof wert !== "string") return JSON.stringify(wert);
  if (/^[a-zA-Z0-9_.:/-]+$/.test(wert)) return wert;
  return JSON.stringify(wert);
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
    const out: string[] = [];
    for (const eintrag of obj) {
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

  const out: string[] = [];
  for (const [key, wert] of Object.entries(obj as Record<string, unknown>)) {
    if (wert === undefined) continue;
    if (typeof wert === "object" && wert !== null) {
      out.push(`${pad}${key}:`);
      out.push(...zeilen(wert, einzug + 2));
    } else {
      out.push(`${pad}${key}: ${skalar(wert)}`);
    }
  }
  return out;
}

function ordneKnoten(knoten: LogikKnoten): Record<string, unknown> {
  const roh = { ...knoten } as Record<string, unknown>;
  if (knoten.parameter && Object.keys(knoten.parameter).length === 0) delete roh["parameter"];
  return ordne(roh, KNOTEN_REIHENFOLGE);
}

function ordneKante(kante: LogikKante): Record<string, unknown> {
  const roh = { ...kante } as Record<string, unknown>;
  if (roh["trigger"] === "on-change") delete roh["trigger"];
  return ordne(roh, KANTEN_REIHENFOLGE);
}

export function logikZuYaml(seite: LogikSeite): string {
  const knoten: Record<string, unknown> = {};
  for (const key of Object.keys(seite.knoten).sort()) {
    const eintrag = seite.knoten[key];
    if (eintrag) knoten[key] = ordneKnoten(eintrag);
  }
  const out = ordne(
    {
      notizen: seite.notizen,
      knoten,
      kanten: seite.kanten.map(ordneKante),
    },
    SEITEN_REIHENFOLGE,
  );
  return `${zeilen(out).join("\n")}\n`;
}

export function inhaltZumSpeichern(seite: LogikSeite, raw: string | null, dirty: boolean): string {
  return !dirty && raw !== null ? raw : logikZuYaml(seite);
}

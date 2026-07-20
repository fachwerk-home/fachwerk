import type { LogikKante, LogikSeite } from "../../../schema/src/index.ts";
import type { GewerkBaustein } from "../lib/api.ts";

export interface BausteinPaletteEintrag {
  id: string;
  name: string;
  eingaenge: string[];
  ausgaenge: string[];
  beschreibung?: string | null;
  parameter?: Record<string, unknown>;
  stub?: boolean;
  konfigVariabel?: boolean;
}

export interface LogikProblem {
  art: "fehler" | "warnung";
  ort: string;
  text: string;
}

const STDLIB: BausteinPaletteEintrag[] = [
  { id: "KOPIE", name: "Kopie", eingaenge: ["in"], ausgaenge: ["out"], beschreibung: "Wert unverändert weiterreichen." },
  { id: "NOT", name: "Nicht", eingaenge: ["in"], ausgaenge: ["out"] },
  { id: "AND", name: "Und", eingaenge: ["a", "b"], ausgaenge: ["out"] },
  { id: "OR", name: "Oder", eingaenge: ["a", "b"], ausgaenge: ["out"] },
  { id: "OR8", name: "Oder 8", eingaenge: ["e1", "e2", "e3", "e4", "e5", "e6", "e7", "e8"], ausgaenge: ["out"] },
  { id: "XOR", name: "Exklusiv-Oder", eingaenge: ["a", "b"], ausgaenge: ["out"] },
  { id: "TOGGLE", name: "Toggle", eingaenge: ["in", "status"], ausgaenge: ["out"] },
  { id: "VERGLEICH", name: "Vergleich", eingaenge: ["a", "b"], ausgaenge: ["out"], parameter: { op: ">=", wert: 0 } },
  { id: "HYSTERESE", name: "Hysterese", eingaenge: ["in"], ausgaenge: ["out"], parameter: { ein: 1, aus: 0 } },
  { id: "SPERRE", name: "Sperre", eingaenge: ["in", "sperre"], ausgaenge: ["out"], parameter: { nachreichen: true } },
  { id: "VERZOEGERUNG", name: "Verzögerung", eingaenge: ["in"], ausgaenge: ["out"], parameter: { ms: 1000 } },
  { id: "TREPPENLICHT", name: "Treppenlicht", eingaenge: ["in"], ausgaenge: ["out"], parameter: { ms: 60000 } },
  { id: "WERTAUSLOESER", name: "Wertauslöser", eingaenge: ["trigger", "wert"], ausgaenge: ["out"], parameter: { wert: true } },
  { id: "IMPULS", name: "Impuls", eingaenge: ["trigger", "dauer"], ausgaenge: ["out"], parameter: { ms: 1000 } },
  { id: "MULT", name: "Multiplikation", eingaenge: ["a", "b"], ausgaenge: ["out"] },
  { id: "KLEMME", name: "Klemme", eingaenge: ["in1", "in2"], ausgaenge: ["out"] },
  { id: "WENN_DANN_SONST", name: "Wenn-Dann-Sonst", eingaenge: ["eingang", "vergleich", "op", "dann", "sonst"], ausgaenge: ["out"], parameter: { op: "EQ", vergleich: 0 } },
  { id: "EXTRACT", name: "Extract", eingaenge: ["text"], ausgaenge: ["feld1", "feld2", "status"], parameter: { format: "json", felder: [{ name: "feld1", pfad: "a" }, { name: "feld2", pfad: "b" }] }, konfigVariabel: true },
  { id: "SPLIT", name: "Split", eingaenge: ["text"], ausgaenge: ["teil1", "teil2", "rest"], parameter: { separator: ",", anzahl: 2, rest: true }, konfigVariabel: true },
  { id: "JOIN", name: "Join", eingaenge: ["teil1", "teil2"], ausgaenge: ["text"], parameter: { separator: "", anzahl: 2 }, konfigVariabel: true },
  { id: "FORMEL", name: "Formel", eingaenge: ["x", "a", "b", "c", "d", "e", "formel"], ausgaenge: ["out"], parameter: { formel: "$x" } },
  { id: "BITS_ZU_BYTE", name: "Bits zu Byte", eingaenge: ["bit0", "bit1", "bit2", "bit3", "bit4", "bit5", "bit6", "bit7"], ausgaenge: ["out"] },
  { id: "VERGLEICH_LISTE", name: "Vergleich-Liste", eingaenge: ["in"], ausgaenge: ["eq1", "eq2", "ne"], parameter: { anzahl: 2, w1: true, w2: false }, konfigVariabel: true },
  { id: "WENN_LISTE", name: "Wenn-Liste", eingaenge: ["in", "vergl1", "wert1", "vergl2", "wert2"], ausgaenge: ["out"], parameter: { anzahl: 2 }, konfigVariabel: true },
  { id: "MATRIX", name: "Matrix", eingaenge: ["e1", "e2", "wahl_eingang", "wahl_ausgang"], ausgaenge: ["a1", "a2"], parameter: { anzahl: 2, wahl_eingang: 1, wahl_ausgang: 1 }, konfigVariabel: true },
  { id: "ZEITVERGLEICH", name: "Zeitbereich", eingaenge: ["zeit", "von", "bis"], ausgaenge: ["out"], parameter: { von: "08:00", bis: "18:00" } },
  { id: "ZEITVERGLEICH_AB", name: "Zeitvergleich A/B", eingaenge: ["a", "b"], ausgaenge: ["gt", "lt", "eq"] },
  { id: "ZEITFORMAT", name: "Zeitformat", eingaenge: ["zeit", "offset", "format"], ausgaenge: ["out"], parameter: { offset: 0, format: "%X" } },
];

export function paletteAusGewerk(bausteine: readonly GewerkBaustein[] = []): BausteinPaletteEintrag[] {
  const eigene = bausteine.map((b) => ({
    id: b.id,
    name: b.name,
    eingaenge: b.eingaenge,
    ausgaenge: b.ausgaenge,
    beschreibung: b.beschreibung,
    parameter: b.parameter ?? {},
    stub: /^lbs\d+$/.test(b.id),
  }));
  const bekannte = new Set(eigene.map((b) => b.id));
  return [...STDLIB.filter((b) => !bekannte.has(b.id)), ...eigene].sort((a, b) => a.id.localeCompare(b.id, "de"));
}

export function freierKnotenKey(seite: LogikSeite, basis: string): string {
  const roh = basis.toLowerCase().replaceAll(/[^a-z0-9_]/g, "_").replaceAll(/_+/g, "_").replace(/^_+/, "") || "knoten";
  const start = /^[a-z]/.test(roh) ? roh : `k_${roh}`;
  if (!seite.knoten[start]) return start;
  for (let i = 2; i < 1000; i += 1) {
    const key = `${start}_${i}`;
    if (!seite.knoten[key]) return key;
  }
  return `${start}_${Date.now()}`;
}

function portAnzahl(parameter: Record<string, unknown>): number {
  const n = Number(parameter["anzahl"] ?? 2);
  return Number.isFinite(n) ? Math.max(1, Math.min(100, Math.trunc(n))) : 2;
}

export function portsFuer(eintrag: BausteinPaletteEintrag | undefined, parameter: Record<string, unknown> = {}): { eingaenge: string[]; ausgaenge: string[] } {
  if (!eintrag) return { eingaenge: [], ausgaenge: [] };
  if (eintrag.id === "EXTRACT") {
    const felder = Array.isArray(parameter["felder"]) ? parameter["felder"] : [];
    const namen = felder
      .filter((f): f is { name: string } => !!f && typeof f === "object" && typeof (f as { name?: unknown }).name === "string")
      .map((f) => f.name)
      .filter(Boolean);
    return { eingaenge: ["text"], ausgaenge: [...namen, "status"] };
  }
  if (eintrag.id === "SPLIT") {
    const ausgaenge = Array.from({ length: portAnzahl(parameter) }, (_, i) => `teil${i + 1}`);
    if (parameter["rest"] !== false) ausgaenge.push("rest");
    return { eingaenge: ["text"], ausgaenge };
  }
  if (eintrag.id === "JOIN") {
    return { eingaenge: Array.from({ length: portAnzahl(parameter) }, (_, i) => `teil${i + 1}`), ausgaenge: ["text"] };
  }
  if (eintrag.id === "VERGLEICH_LISTE") {
    return { eingaenge: ["in"], ausgaenge: [...Array.from({ length: portAnzahl(parameter) }, (_, i) => `eq${i + 1}`), "ne"] };
  }
  if (eintrag.id === "WENN_LISTE") {
    const eingaenge = ["in"];
    for (let i = 1; i <= portAnzahl(parameter); i += 1) eingaenge.push(`vergl${i}`, `wert${i}`);
    return { eingaenge, ausgaenge: ["out"] };
  }
  if (eintrag.id === "MATRIX") {
    const n = portAnzahl(parameter);
    return {
      eingaenge: [...Array.from({ length: n }, (_, i) => `e${i + 1}`), "wahl_eingang", "wahl_ausgang"],
      ausgaenge: Array.from({ length: n }, (_, i) => `a${i + 1}`),
    };
  }
  return { eingaenge: eintrag.eingaenge, ausgaenge: eintrag.ausgaenge };
}

export function fuegeKnotenEin(seite: LogikSeite, eintrag: BausteinPaletteEintrag): { seite: LogikSeite; key: string } {
  const neu = structuredClone(seite);
  const key = freierKnotenKey(neu, eintrag.id.toLowerCase());
  neu.knoten[key] = {
    baustein: eintrag.id,
    ...(eintrag.parameter && Object.keys(eintrag.parameter).length > 0 ? { parameter: structuredClone(eintrag.parameter) } : {}),
  };
  return { seite: neu, key };
}

export function loescheKnoten(seite: LogikSeite, key: string): LogikSeite {
  const neu = structuredClone(seite);
  delete neu.knoten[key];
  neu.kanten = neu.kanten.filter((kante) => !kante.von.startsWith(`${key}.`) && !kante.nach.startsWith(`${key}.`));
  return neu;
}

export function setzeOderErsetzeKante(seite: LogikSeite, kante: LogikKante): LogikSeite {
  const neu = structuredClone(seite);
  const i = neu.kanten.findIndex((alt) => alt.von === kante.von && alt.nach === kante.nach);
  if (i >= 0) neu.kanten[i] = kante;
  else neu.kanten.push(kante);
  return neu;
}

export function entferneKante(seite: LogikSeite, index: number): LogikSeite {
  const neu = structuredClone(seite);
  neu.kanten.splice(index, 1);
  return neu;
}

function knotenVonRef(ref: string): string | null {
  if (ref.startsWith("dp:")) return null;
  return ref.split(".", 1)[0] ?? null;
}

export function validiereLogik(seite: LogikSeite): LogikProblem[] {
  const probleme: LogikProblem[] = [];
  const kanten = seite.kanten;
  const schreibt = new Map<string, string[]>();
  kanten.forEach((kante, index) => {
    if (kante.nach.startsWith("dp:")) {
      const liste = schreibt.get(kante.nach) ?? [];
      liste.push(`Kante ${index + 1}`);
      schreibt.set(kante.nach, liste);
    }
    for (const [feld, ref] of [["von", kante.von], ["nach", kante.nach]] as const) {
      const knoten = knotenVonRef(ref);
      if (knoten && !seite.knoten[knoten]) {
        probleme.push({ art: "fehler", ort: `Kante ${index + 1}/${feld}`, text: `Unbekannter Knoten ${knoten}` });
      }
    }
  });
  for (const [dp, stellen] of schreibt) {
    if (stellen.length > 1) probleme.push({ art: "warnung", ort: dp, text: `Mehrfach-Schreiber: ${stellen.join(", ")}` });
  }

  const graph = new Map<string, string[]>();
  for (const key of Object.keys(seite.knoten)) graph.set(key, []);
  for (const kante of kanten) {
    const von = knotenVonRef(kante.von);
    const nach = knotenVonRef(kante.nach);
    if (von && nach && graph.has(von)) graph.get(von)!.push(nach);
  }
  const zustand = new Map<string, "besucht" | "aktiv">();
  const pfad: string[] = [];
  const dfs = (key: string): boolean => {
    zustand.set(key, "aktiv");
    pfad.push(key);
    for (const ziel of graph.get(key) ?? []) {
      if (zustand.get(ziel) === "aktiv") {
        const start = pfad.indexOf(ziel);
        probleme.push({ art: "fehler", ort: ziel, text: `Zyklus: ${[...pfad.slice(start), ziel].join(" -> ")}` });
        return true;
      }
      if (!zustand.get(ziel) && dfs(ziel)) return true;
    }
    pfad.pop();
    zustand.set(key, "besucht");
    return false;
  };
  for (const key of graph.keys()) {
    if (!zustand.get(key)) dfs(key);
  }
  return probleme;
}

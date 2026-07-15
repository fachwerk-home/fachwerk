/**
 * Stdlib-Bausteine: reine, synchrone Rechenfunktionen (ADR-0008 „compute").
 * Seiteneffekte laufen ausschließlich über den Kontext (Timer, Zustand) —
 * die Engine sammelt sie ein; Bausteine berühren nie selbst die Außenwelt.
 * Die volle Sandbox für Fremd-Bausteine (Worker/WASM) kommt in P4-5.
 */
import type { Wert } from "../datenpunkte/registry.ts";

export type Eingaenge = Record<string, Wert | undefined>;
export type Ausgaenge = Record<string, Wert>;

/** Warum ein Baustein gerade läuft. */
export type Ausloeser =
  | { art: "eingang" }
  | { art: "timer"; id: string; nachgeholt: boolean };

export interface BausteinKontext {
  parameter: Readonly<Record<string, unknown>>;
  /** Knoten-lokaler Zustand; wird persistiert (SPEC-002 T-6). */
  zustand: Record<string, Wert>;
  ausloeser: Ausloeser;
  /** Plant/ersetzt den Timer (knoten, id) — SPEC-002 T-1/T-2. */
  planeTimer(id: string, ms: number): void;
  brichAb(id: string): void;
}

export interface Baustein {
  typ: string;
  /** null = keine Ausgabe (z. B. Eingänge unbelegt oder nur Timer geplant). */
  rechne(eingaenge: Eingaenge, ctx: BausteinKontext): Ausgaenge | null;
}

const NOT: Baustein = {
  typ: "NOT",
  rechne(e) {
    if (typeof e["in"] !== "boolean") return null;
    return { out: !e["in"] };
  },
};

const AND: Baustein = {
  typ: "AND",
  rechne(e) {
    if (typeof e["a"] !== "boolean" || typeof e["b"] !== "boolean") return null;
    return { out: e["a"] && e["b"] };
  },
};

/** Verzögerung: reicht den Eingangswert nach `ms` weiter; Retrigger ersetzt. */
const VERZOEGERUNG: Baustein = {
  typ: "VERZOEGERUNG",
  rechne(e, ctx) {
    if (ctx.ausloeser.art === "timer") {
      const wert = ctx.zustand["wert"];
      return wert === undefined ? null : { out: wert };
    }
    if (e["in"] === undefined) return null;
    ctx.zustand["wert"] = e["in"];
    ctx.planeTimer("ablauf", Number(ctx.parameter["ms"] ?? 1000));
    return null;
  },
};

/**
 * Treppenlicht: Ein-Impuls schaltet ein und plant das Aus; Retrigger
 * verlängert; Aus-Impuls schaltet sofort aus und bricht den Timer ab.
 * DER Testfall für die Neustart-Regel (SPEC-002 T-5).
 */
const TREPPENLICHT: Baustein = {
  typ: "TREPPENLICHT",
  rechne(e, ctx) {
    if (ctx.ausloeser.art === "timer") return { out: false };
    if (e["in"] === true) {
      ctx.planeTimer("aus", Number(ctx.parameter["ms"] ?? 60_000));
      return { out: true };
    }
    if (e["in"] === false) {
      ctx.brichAb("aus");
      return { out: false };
    }
    return null;
  },
};

const STDLIB = new Map<string, Baustein>(
  [NOT, AND, VERZOEGERUNG, TREPPENLICHT].map((b) => [b.typ, b]),
);

export function findeBaustein(typ: string): Baustein | undefined {
  return STDLIB.get(typ);
}

/**
 * Stdlib-Bausteine (S-4, minimal): reine, synchrone Rechenfunktionen
 * (ADR-0008 „compute"). Die volle Baustein-Sandbox (Worker/WASM,
 * Capabilities) kommt in einer späteren Phase — der Engine-Kern hier
 * ist davon unabhängig.
 */
import type { Wert } from "../datenpunkte/registry.ts";

export type Eingaenge = Record<string, Wert | undefined>;
export type Ausgaenge = Record<string, Wert>;

export interface Baustein {
  typ: string;
  /** null = keine Ausgabe (z. B. Eingänge noch unbelegt). */
  rechne(eingaenge: Eingaenge): Ausgaenge | null;
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

const STDLIB = new Map<string, Baustein>([NOT, AND].map((b) => [b.typ, b]));

export function findeBaustein(typ: string): Baustein | undefined {
  return STDLIB.get(typ);
}

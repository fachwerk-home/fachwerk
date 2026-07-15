/**
 * @fachwerk/core — Gewerk-Loader (S-2), Datenpunkt-Registry (S-3, SPEC-001)
 * und Ausführungs-Engine (S-4, ADR-0005: ereignisgetrieben,
 * settle-before-evaluate, atomare Kaskaden, Traces).
 */
import { GEWERK_FORMAT_VERSION } from "@fachwerk/schema";

export const SUPPORTED_GEWERK_FORMAT = GEWERK_FORMAT_VERSION;

export { loadGewerk } from "./gewerk/loader.ts";
export type { Gewerk, LadeErgebnis, LadeFehler } from "./gewerk/loader.ts";
export {
  manifestZuYaml,
  datenpunkteZuYaml,
  logikZuYaml,
} from "./gewerk/canonical.ts";
export { DatenpunktRegistry } from "./datenpunkte/registry.ts";
export type {
  Wert,
  WertEreignis,
  SchreibErgebnis,
  SchreibQuelle,
} from "./datenpunkte/registry.ts";
export { LogikEngine, GraphFehler, analysiereLogik } from "./logik/engine.ts";
export type { KaskadenTrace, TraceSchritt, TraceSchreiben } from "./logik/engine.ts";

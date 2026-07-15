/**
 * @fachwerk/schema — JSON-Schemas des Gewerk-Formats (ADR-0004) und die
 * dazugehörigen TypeScript-Typen. Das Schema ist die Quelle der Wahrheit
 * (Agent-first): Editoren, Engine und Agenten validieren gegen dieselben Dateien.
 */
import { Ajv2020 } from "ajv/dist/2020.js";
import type { ErrorObject, ValidateFunction } from "ajv";

export type { ErrorObject, ValidateFunction };
import gewerkSchema from "../schemas/gewerk.schema.json" with { type: "json" };
import datenpunkteSchema from "../schemas/datenpunkte.schema.json" with { type: "json" };
import logikSchema from "../schemas/logik.schema.json" with { type: "json" };

export const GEWERK_FORMAT_VERSION = 1;

export { gewerkSchema, datenpunkteSchema, logikSchema };

// ---- TypeScript-Typen (spiegeln die Schemas; Generierung folgt später) ----

export interface GewerkManifest {
  format: number;
  name: string;
  notizen?: string;
}

export type DatenpunktKlasse = "intern" | "bus" | "system";
export type DatenpunktTyp = "bool" | "zahl" | "text";

export interface Datenpunkt {
  name: string;
  klasse: DatenpunktKlasse;
  typ: DatenpunktTyp;
  treiber?: string;
  adresse?: string;
  dpt?: "1.001" | "5.001" | "9.001";
  initial?: boolean | number | string;
  remanent?: boolean;
  protected?: boolean;
  notizen?: string;
}

/** Eine Datenpunkt-Datei: Schlüssel → Definition. */
export type DatenpunktDatei = Record<string, Datenpunkt>;

export interface LogikKnoten {
  baustein: string;
  parameter?: Record<string, unknown>;
}

export type TriggerSemantik = "on-change" | "on-receive";

export interface LogikKante {
  von: string;
  nach: string;
  trigger?: TriggerSemantik;
}

export interface LogikSeite {
  notizen?: string;
  knoten: Record<string, LogikKnoten>;
  kanten: LogikKante[];
}

// ---- Kompilierte Validatoren (Ajv, Draft 2020-12) ----

const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true });

export const validateGewerkManifest: ValidateFunction<GewerkManifest> =
  ajv.compile<GewerkManifest>(gewerkSchema);
export const validateDatenpunktDatei: ValidateFunction<DatenpunktDatei> =
  ajv.compile<DatenpunktDatei>(datenpunkteSchema);
export const validateLogikSeite: ValidateFunction<LogikSeite> =
  ajv.compile<LogikSeite>(logikSchema);

/** Kanonische Schlüssel-Reihenfolge je Artefakt (ADR-0004: kleine Diffs). */
export const KEY_ORDER = {
  gewerk: ["format", "name", "notizen"],
  datenpunkt: [
    "name",
    "klasse",
    "typ",
    "treiber",
    "adresse",
    "dpt",
    "initial",
    "remanent",
    "protected",
    "notizen",
  ],
  logikSeite: ["notizen", "knoten", "kanten"],
  logikKnoten: ["baustein", "parameter"],
  logikKante: ["von", "nach", "trigger"],
} as const;

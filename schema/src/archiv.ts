import { Ajv2020 } from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv";
import archivSchema from "../schemas/archiv.schema.json" with { type: "json" };

export interface ArchivDefinition {
  name: string;
  quelle: string;
  aufbewahrung_tage: number;
  mindestabstand_s?: number;
  notizen?: string;
}

export type ArchivDatei = Record<string, ArchivDefinition>;

const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true });

export const validateArchivDatei: ValidateFunction<ArchivDatei> =
  ajv.compile<ArchivDatei>(archivSchema);

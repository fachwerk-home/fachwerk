/**
 * @fachwerk/importer — Import-Assistent für Altsystem-Exporte (Plan Phase 6,
 * vorgezogen als Stufe 1). Liest NUR Nutzdaten des Anlagenbetreibers
 * (SQL-Dump der Projektdatenbank, Visu-Export-JSON) — niemals Programmcode.
 */
export { parseDump } from "./sql-dump.ts";
export type { Tabelle, Zeile, Zelle } from "./sql-dump.ts";
export { konvertiere, slug } from "./konvertiere.ts";
export type { ImportErgebnis, ImportBericht } from "./konvertiere.ts";

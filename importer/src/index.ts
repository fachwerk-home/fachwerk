/**
 * @fachwerk/importer — Import-Assistent für Altsystem-Exporte (Plan Phase 6,
 * vorgezogen als Stufe 1). Liest NUR Nutzdaten des Anlagenbetreibers
 * (SQL-Dump der Projektdatenbank, Visu-Export-JSON) — niemals Programmcode.
 */
export { parseDump } from "./sql-dump.ts";
export type { Tabelle, Zeile, Zelle } from "./sql-dump.ts";
export { konvertiere, slug } from "./konvertiere.ts";
export type { ImportErgebnis, ImportBericht } from "./konvertiere.ts";
export {
  extrahiereStruktur,
  bewerte,
  konvertiereSeite,
  befehlsStatistik,
  ABBILDUNG,
  AUSGANGSBOX,
  SENDBYCHANGE,
} from "./logik.ts";
export { BEFEHLE, befehlDef, BEKANNTE_LUECKEN } from "./befehle-katalog.ts";
export type { BefehlDef, BefehlKategorie } from "./befehle-katalog.ts";
export type {
  RohSeite,
  RohElement,
  RohKante,
  Quelle,
  LogikReport,
  SeitenReport,
  SeitenKonvertierung,
} from "./logik.ts";

/**
 * @fachwerk/core — Gewerk-Loader (S-2), Datenpunkt-Registry (S-3, SPEC-001)
 * und Ausführungs-Engine (S-4, ADR-0005: ereignisgetrieben,
 * settle-before-evaluate, atomare Kaskaden, Traces).
 */
import { GEWERK_FORMAT_VERSION } from "@fachwerk/schema";

export const SUPPORTED_GEWERK_FORMAT = GEWERK_FORMAT_VERSION;

export { loadGewerk } from "./gewerk/loader.ts";
export type { Gewerk, LadeErgebnis, LadeFehler, EigenerBaustein } from "./gewerk/loader.ts";
export { BausteinSandbox, sandboxAlsBaustein } from "./logik/sandbox.ts";
export {
  manifestZuYaml,
  datenpunkteZuYaml,
  logikZuYaml,
  archiveZuYaml,
} from "./gewerk/canonical.ts";
export { DatenpunktRegistry } from "./datenpunkte/registry.ts";
export type {
  Wert,
  WertEreignis,
  SchreibErgebnis,
  SchreibQuelle,
} from "./datenpunkte/registry.ts";
export { Speicher } from "./persistenz/speicher.ts";
export type { EngineMomentaufnahme } from "./persistenz/speicher.ts";
export { LogikEngine, GraphFehler, analysiereLogik } from "./logik/engine.ts";
export type {
  KaskadenTrace,
  TraceSchritt,
  TraceSchreiben,
  TraceAusloeser,
} from "./logik/engine.ts";
export type { Baustein, BausteinKontext, Ausloeser } from "./logik/bausteine.ts";
export { extrahiere, introspizieren } from "./logik/extract.ts";
export type { ExtractFormat, Feld } from "./logik/extract.ts";
export { UhrDienst, uhrDatenpunkte, uhrWert } from "./system/uhr.ts";
export type { UhrArt, UhrOptionen } from "./system/uhr.ts";
export { TracePuffer } from "./api/trace-puffer.ts";
export { beantworte } from "./api/handler.ts";
export type {
  ApiKontext,
  ApiAntwort,
  DatenpunktSicht,
  TreiberStatus,
} from "./api/handler.ts";
export { ApiServer } from "./api/server.ts";
export type { ServerOptionen } from "./api/server.ts";
export { WsServer } from "./api/websocket.ts";
export type { WsVerbindung } from "./api/websocket.ts";
export { ladeVisu } from "./visu/laden.ts";
export type { VisuLadeErgebnis, VisuLadeFehler, DatenpunktDefinitionen } from "./visu/laden.ts";
export { effektivesFormat, formatiereWert } from "./visu/format.ts";
export { kompiliereTemplate } from "./visu/ausdruck.ts";
export type { AusdruckFehler, AusdruckErgebnis, KompiliertesTemplate, WertLookup } from "./visu/ausdruck.ts";
export { ladeArchive } from "./archiv/laden.ts";
export type { ArchivLadeErgebnis, ArchivLadeFehler } from "./archiv/laden.ts";
export { ArchivDienst } from "./archiv/dienst.ts";
export type { ArchivDienstOptionen, RohPunkt, AggregiertPunkt, AbfrageOptionen, Aggregation } from "./archiv/dienst.ts";
export { Schreibbremse } from "./api/schreibbremse.ts";
export type { SchreibbremseOptionen } from "./api/schreibbremse.ts";
export { AuditProtokoll } from "./api/audit.ts";
export type { AuditEintrag } from "./api/audit.ts";
export { pruefeGewerkPfad } from "./gewerk/dateien.ts";
export type { PfadPruefung } from "./gewerk/dateien.ts";
export type { GewerkDateien } from "./api/handler.ts";
export { loeseFaehigkeitenAuf, netzZielErlaubt, pruefeBausteinCode } from "./logik/faehigkeiten.ts";
export type { Faehigkeiten, AufgeloesteFaehigkeiten, NetzFaehigkeit } from "./logik/faehigkeiten.ts";
export { holeMitGrenzen } from "./logik/netz.ts";
export type { NetzAuftrag, NetzAntwort, NetzGrenzen, NetzAusfuehrer } from "./logik/netz.ts";

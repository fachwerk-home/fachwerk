/**
 * `fachwerk katalog [--json]` — gibt aus, was Fachwerk kann.
 *
 * Zweck: Beim Umstieg von einer Altanlage bleiben fremde Bausteine übrig.
 * Fachwerk kann nicht selbst beurteilen, ob es deren Funktion schon hat — ein
 * LLM kann es, wenn es diesen Katalog neben den fremden Baustein legt
 * (Ablauf: docs/MIGRATION-TRIAGE.md). Deshalb gibt es die Ausgabe in zwei
 * Formen: lesbar fuer Menschen, `--json` zum Anhaengen an einen Prompt.
 */
import { baueKatalog, SUPPORTED_GEWERK_FORMAT, type Katalog } from "@fachwerk/core";

function alsText(k: Katalog): string {
  const zeilen: string[] = [];
  zeilen.push(`Fachwerk-Fähigkeiten (Katalog v${k.katalogVersion}, Gewerk-Format v${k.gewerkFormat})`);
  zeilen.push("");
  zeilen.push(`## Bausteine (${k.bausteine.length})`);
  for (const b of k.bausteine) {
    const ports = `${b.eingaenge.join(", ") || "—"} → ${b.ausgaenge.join(", ") || "—"}`;
    zeilen.push(`  ${b.typ.padEnd(18)} ${b.zweck}`);
    zeilen.push(`  ${" ".repeat(18)} Ports: ${ports}`);
    if (b.konfigVariabel) zeilen.push(`  ${" ".repeat(18)} Konfig-variabel: ${b.konfigVariabel}`);
    if (b.parameter?.length) {
      const p = b.parameter
        .map((x) => `${x.name}${x.standard !== undefined ? ` (Standard ${x.standard})` : ""}`)
        .join(", ");
      zeilen.push(`  ${" ".repeat(18)} Parameter: ${p}`);
    }
    if (b.entkoppelt) zeilen.push(`  ${" ".repeat(18)} zeitentkoppelt (Ausgang nur über Timer)`);
    zeilen.push("");
  }
  zeilen.push(`## Visu-Elemente (${k.visu.elemente.length})`);
  for (const e of k.visu.elemente) {
    const rollen = e.rollen.length > 0 ? ` · Rollen: ${e.rollen.join(", ")}` : "";
    const akt = e.aktionen?.length ? ` · Aktionen: ${e.aktionen.join(", ")}` : "";
    zeilen.push(`  ${e.name.padEnd(16)} [${e.art}] ${e.zweck}${rollen}${akt}`);
  }
  zeilen.push("");
  zeilen.push(`## Formatfelder (Anzeige)`);
  zeilen.push(`  ${k.visu.formatFelder.join(", ")}`);
  zeilen.push("");
  zeilen.push(`## Datenpunkte`);
  zeilen.push(`  Typen: ${k.datenpunkte.typen.join(", ")} · Klassen: ${k.datenpunkte.klassen.join(", ")}`);
  zeilen.push("");
  zeilen.push("## Hinweise");
  for (const h of k.hinweise) zeilen.push(`  · ${h}`);
  return zeilen.join("\n");
}

export function katalog(args: string[]): number {
  const k = baueKatalog(SUPPORTED_GEWERK_FORMAT);
  if (args.includes("--json")) {
    console.log(JSON.stringify(k, null, 2));
  } else {
    console.log(alsText(k));
    console.error("");
    console.error("Tipp: `fachwerk katalog --json` liefert dieselbe Auskunft maschinenlesbar —");
    console.error("für die Triage fremder Bausteine siehe docs/MIGRATION-TRIAGE.md.");
  }
  return 0;
}

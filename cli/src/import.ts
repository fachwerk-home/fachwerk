/**
 * `fachwerk import <dump.sql> <ziel-verzeichnis>` (Import-Assistent, Stufe 1):
 * schreibt Datenpunkte als kanonisches Gewerk und druckt den Bericht
 * (Baustein-Bedarf = Portierungs-Prioritäten). Stufe 2 (Logik-Graph) und
 * Stufe 3 (Visu) folgen.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { datenpunkteZuYaml, logikZuYaml, manifestZuYaml, loadGewerk } from "@fachwerk/core";
import {
  bewerte,
  extrahiereStruktur,
  konvertiere,
  konvertiereSeite,
  parseDump,
} from "@fachwerk/importer";

export function importiere(dumpPfad: string, ziel: string): number {
  const sql = readFileSync(dumpPfad, "utf8");
  const tabellen = parseDump(sql);
  if (!tabellen.has("editKo")) {
    console.error("FEHLER: Dump enthält keine editKo-Tabelle — falsche Datei?");
    return 1;
  }
  const { datenpunkte, koZuSchluessel, bericht } = konvertiere(tabellen);

  // Gewerk schreiben (kanonisch — ADR-0004)
  mkdirSync(join(ziel, "datenpunkte"), { recursive: true });
  writeFileSync(
    join(ziel, "gewerk.yaml"),
    manifestZuYaml({ format: 1, name: "Importiertes Gewerk (Stufe 1+2)" }),
    "utf8",
  );
  for (const [gruppe, datei] of datenpunkte) {
    writeFileSync(join(ziel, "datenpunkte", `${gruppe}.yaml`), datenpunkteZuYaml(datei), "utf8");
  }

  // ---- Stufe 2: Logik (nur vollständig abbildbare Seiten schreiben) ----------
  const seiten = extrahiereStruktur(tabellen);
  const logikReport = bewerte(seiten);
  let seitenGeschrieben = 0;
  const seitenFehler: string[] = [];
  if (seiten.some((s) => s.elemente.length > 0)) mkdirSync(join(ziel, "logik"), { recursive: true });
  for (const seite of seiten) {
    const { ergebnis, fehler } = konvertiereSeite(seite, koZuSchluessel);
    if (ergebnis) {
      writeFileSync(
        join(ziel, "logik", `${ergebnis.seiteSlug}.yaml`),
        logikZuYaml(ergebnis.logik),
        "utf8",
      );
      seitenGeschrieben++;
    } else if (fehler.length > 0) {
      seitenFehler.push(`${seite.name}: ${fehler.length} offene(r) Punkt(e)`);
    }
  }

  // Selbstprüfung: das erzeugte Gewerk muss unser eigenes validate bestehen.
  const kontrolle = loadGewerk(ziel);
  if (kontrolle.fehler.length > 0) {
    console.error("FEHLER: erzeugtes Gewerk ist nicht schema-konform (Importer-Bug):");
    for (const f of kontrolle.fehler.slice(0, 10)) {
      console.error(`  ${f.datei} ${f.pfad}: ${f.meldung}`);
    }
    return 1;
  }

  // Bericht
  const b = bericht;
  console.log(`Datenpunkte: ${b.kos.gesamt} KOs → ${b.kos.bus} Bus + ${b.kos.intern} intern` +
    (b.kos.uebersprungen > 0 ? ` (${b.kos.uebersprungen} übersprungen)` : ""));
  console.log(`Gruppen: ${datenpunkte.size} Dateien unter datenpunkte/`);
  console.log(`Logik (noch nicht konvertiert): ${b.logik.seiten} Seiten, ` +
    `${b.logik.instanzen} Baustein-Instanzen, ${b.logik.verknuepfungen} Verknüpfungen`);
  console.log("\nBaustein-Bedarf (Top 20 — Portierungs-Prioritäten):");
  for (const eintrag of b.bausteinBedarf.slice(0, 20)) {
    console.log(`  ${String(eintrag.verwendungen).padStart(4)}× ${eintrag.name} (${eintrag.id})`);
  }
  const dptVerteilung = [...b.werttypen.entries()]
    .sort((x, y) => y[1] - x[1])
    .map(([typ, n]) => `${typ}:${n}`)
    .join("  ");
  console.log(`\nWerttyp-Verteilung (≈ DPT-Hauptnummern): ${dptVerteilung}`);
  for (const h of b.hinweise.slice(0, 10)) console.log(`HINWEIS: ${h}`);

  // Logik-Report
  console.log(`\n── Logik (Stufe 2) ──`);
  console.log(
    `${seitenGeschrieben} von ${logikReport.seiten.length} Seiten als Logik-Entwurf geschrieben` +
      (seitenFehler.length > 0 ? `, ${seitenFehler.length} mit offenen Punkten.` : "."),
  );
  // Reine Ausgangsbox-Seiten = Archiv-/KO-Schreibmuster (SPEC-004, nicht Logik).
  const archiv = logikReport.seiten.filter(
    (s) => s.elemente > 0 && s.ausgangsboxen === s.elemente,
  );
  if (archiv.length > 0) {
    console.log(
      `${archiv.length} Seite(n) bestehen nur aus Ausgangsboxen (Archiv-/Schreibmuster → SPEC-004): ` +
        archiv.map((s) => s.seite).join(", "),
    );
  }
  const kandidaten = logikReport.seiten.filter((s) => s.vollstaendig && s.ausgangsboxen < s.elemente);
  if (kandidaten.length > 0) {
    console.log("Logik-Abnahme-Kandidaten (vollständig abbildbar):");
    for (const s of kandidaten.slice(0, 12)) console.log(`  ✓ ${s.seite} (${s.elemente} Elemente)`);
  }
  console.log("Offener Fachbaustein-Bedarf (Portierungs-Prioritäten, LBS-Id × Verwendungen):");
  for (const o of logikReport.offen.slice(0, 12)) {
    const name = b.bausteinBedarf.find((x) => x.id === o.functionId)?.name ?? "?";
    console.log(`  ${String(o.anzahl).padStart(4)}× ${o.functionId} ${name}`);
  }

  console.log(`\nOK: Gewerk geschrieben nach ${ziel} (validate bestanden)`);
  return 0;
}

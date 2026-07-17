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
  BEKANNTE_LUECKEN,
  befehlsStatistik,
  bewerte,
  defInfos,
  extrahiereStruktur,
  konvertiere,
  konvertiereSeite,
  parseDump,
  type StubInfo,
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

  // ---- Stufe 2: Logik — jede Seite konvertiert; Fremd-LBS werden Stubs ------
  const seiten = extrahiereStruktur(tabellen);
  const defs = defInfos(tabellen);
  const logikReport = bewerte(seiten);
  let seitenGeschrieben = 0;
  const seitenFehler: string[] = [];
  const alleStubs = new Map<number, StubInfo>();
  if (seiten.some((s) => s.elemente.length > 0)) mkdirSync(join(ziel, "logik"), { recursive: true });
  let hinweisAnzahl = 0;
  for (const seite of seiten) {
    const { ergebnis, fehler, hinweise } = konvertiereSeite(seite, koZuSchluessel, defs);
    hinweisAnzahl += hinweise.length;
    if (ergebnis) {
      writeFileSync(
        join(ziel, "logik", `${ergebnis.seiteSlug}.yaml`),
        logikZuYaml(ergebnis.logik),
        "utf8",
      );
      seitenGeschrieben++;
      // Erzeugte Datenpunkte (z. B. MQTT-Topics) einsammeln.
      for (const [gruppe, datei] of ergebnis.neueDatenpunkte) {
        const vorhanden = datenpunkte.get(gruppe) ?? {};
        Object.assign(vorhanden, datei);
        datenpunkte.set(gruppe, vorhanden);
      }
      for (const s of ergebnis.stubs) alleStubs.set(s.functionId, s);
    } else if (fehler.length > 0) {
      seitenFehler.push(`${seite.name}: ${fehler.length} offene(r) Punkt(e)`);
    }
  }
  // Datenpunkt-Dateien neu schreiben (inkl. der aus LBS erzeugten Topics).
  for (const [gruppe, datei] of datenpunkte) {
    writeFileSync(join(ziel, "datenpunkte", `${gruppe}.yaml`), datenpunkteZuYaml(datei), "utf8");
  }

  // Stub-Bausteine schreiben: Struktur importiert, Verhalten = Portierungs-TODO.
  // Clean-Room: nur Portzahlen/Name aus Nutzdaten — KEIN Code des Originals.
  if (alleStubs.size > 0) {
    for (const stub of alleStubs.values()) {
      const dir = join(ziel, "bausteine", `lbs${stub.functionId}`);
      mkdirSync(dir, { recursive: true });
      const eingaenge = Array.from({ length: stub.eingaenge }, (_, i) => `e${i + 1}`);
      const ausgaenge = Array.from({ length: stub.ausgaenge }, (_, i) => `a${i + 1}`);
      writeFileSync(
        join(dir, "manifest.yaml"),
        [
          `id: lbs${stub.functionId}`,
          `name: "${stub.name.replaceAll('"', "'")} (Stub)"`,
          "version: 1",
          `beschreibung: "Portierungs-TODO: Verhalten des Original-Bausteins ist NICHT implementiert."`,
          `eingaenge: [${eingaenge.join(", ")}]`,
          `ausgaenge: [${ausgaenge.join(", ")}]`,
          "",
        ].join("\n"),
        "utf8",
      );
      writeFileSync(
        join(dir, "baustein.js"),
        [
          `// STUB fuer "${stub.name}" — beim Import erzeugt.`,
          "// Die Verdrahtung ist vollstaendig importiert; das VERHALTEN fehlt bewusst",
          "// (Portierungs-TODO). Implementiere gemaess docs/BAUSTEIN-SDK.md:",
          "//   export default function rechne(eingaenge, ctx) { ... }",
          "export default function rechne() {",
          "  return null; // Stub: keine Ausgabe",
          "}",
          "",
        ].join("\n"),
        "utf8",
      );
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
      (hinweisAnzahl > 0
        ? ` (${hinweisAnzahl} übersprungene Befehle/Nebenausgänge — Archiv/Visu/Aktion).`
        : "."),
  );
  for (const f of seitenFehler) console.log(`  ! FEHLER ${f}`);
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
  const voll = logikReport.seiten.filter(
    (s) => s.elemente > 0 && s.ausgangsboxen < s.elemente && s.stubFunctionIds.length === 0,
  );
  if (voll.length > 0) {
    console.log("Voll lauffähig importiert (ohne Stubs):");
    for (const s of voll) console.log(`  ✓ ${s.seite} (${s.elemente} Elemente)`);
  }
  if (alleStubs.size > 0) {
    console.log(
      `Stub-Bausteine erzeugt (Struktur importiert, Verhalten = Portierungs-TODO):`,
    );
    for (const s of [...alleStubs.values()].sort((a, b) => a.functionId - b.functionId)) {
      console.log(
        `  ○ lbs${s.functionId}  ${s.name}  (${s.eingaenge} Ein-/${s.ausgaenge} Ausgänge)`,
      );
    }
  }
  // Ausgangsbox-Befehle nach Fachwerk-Zuständigkeit (KO-Schreiben abbildbar,
  // Archiv→SPEC-004, Visu→SPEC-003, Aktion/System → eigene Treiber).
  const bs = befehlsStatistik(seiten);
  if (bs.gesamt > 0) {
    console.log(`Ausgangsbox-Befehle nach Zuständigkeit (${bs.gesamt} gesamt):`);
    for (const k of bs.proKategorie) console.log(`  ${String(k.anzahl).padStart(4)}× ${k.kategorie}`);
    // „unbekannt" > 0 wäre ein Hinweis auf noch nicht katalogisierte cmd-Nummern.
    if (bs.proKategorie.some((k) => k.kategorie === "unbekannt")) {
      console.log("  (Kategorie unbekannt = noch nicht katalogisierte Befehlstypen)");
    }
  }
  console.log("Bekannte Katalog-Lücken:");
  for (const l of BEKANNTE_LUECKEN) console.log(`  · ${l}`);

  console.log(`\nOK: Gewerk geschrieben nach ${ziel} (validate bestanden)`);
  return 0;
}

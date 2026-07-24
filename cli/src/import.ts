/**
 * `fachwerk import <dump.sql> <ziel-verzeichnis>` (Import-Assistent, Stufe 1):
 * schreibt Datenpunkte als kanonisches Gewerk und druckt den Bericht
 * (Baustein-Bedarf = Portierungs-Prioritäten). Stufe 2 (Logik-Graph) und
 * Stufe 3 (Visu) folgen.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  archiveZuYaml,
  datenpunkteZuYaml,
  ladeVisu,
  logikZuYaml,
  manifestZuYaml,
  loadGewerk,
  visuDesignsZuYaml,
  visuSeiteZuYaml,
} from "@fachwerk/core";
import type { ArchivDefinition, Datenpunkt } from "@fachwerk/schema";
import {
  BEKANNTE_LUECKEN,
  befehlsStatistik,
  bewerte,
  defInfos,
  ermittleMigrationsBedarf,
  extrahiereStruktur,
  konvertiere,
  konvertiereSeite,
  istTar,
  konvertiereVisu,
  leseTar,
  migrationsReportAlsMarkdown,
  parseDump,
  type StubInfo,
  type VisuExport,
} from "@fachwerk/importer";

export function importiere(dumpPfad: string, ziel: string, visuPfad?: string): number {
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
  const alleArchive = new Map<string, ArchivDefinition>();
  if (seiten.some((s) => s.elemente.length > 0)) mkdirSync(join(ziel, "logik"), { recursive: true });
  let hinweisAnzahl = 0;
  for (const seite of seiten) {
    const { ergebnis, fehler, hinweise, archive } = konvertiereSeite(seite, koZuSchluessel, defs);
    hinweisAnzahl += hinweise.length;
    // Archiv-Definitionen seitenübergreifend zusammenführen (P5-13c) — auch
    // von reinen Archiv-Seiten, die kein Logik-Ergebnis haben:
    // gleiche ID + gleiche Quelle = eine Definition, sonst Warnung, erste gewinnt.
    for (const [id, def] of archive) {
      const vorhanden = alleArchive.get(id);
      if (vorhanden === undefined) alleArchive.set(id, def);
      else if (vorhanden.quelle !== def.quelle) {
        console.warn(
          `WARNUNG: Archiv ${id} mit abweichenden Quellen (${vorhanden.quelle} vs ${def.quelle}) — erste gewinnt`,
        );
      }
    }
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

  // Archiv-Definitionen schreiben (P5-13c: aus cmd 13/42 synthetisiert).
  if (alleArchive.size > 0) {
    mkdirSync(join(ziel, "archiv"), { recursive: true });
    writeFileSync(
      join(ziel, "archiv", "import.yaml"),
      archiveZuYaml(Object.fromEntries(alleArchive)),
      "utf8",
    );
  }

  // ---- Stufe 3: Visu (P5-9) — optional, nur mit --visu ----------------------
  let visuBericht: ReturnType<typeof konvertiereVisu>["bericht"] | null = null;
  const visuDateien: string[] = [];
  if (visuPfad !== undefined) {
    // Der Export kommt entweder als nackte JSON oder als Paket (Tar) mit
    // Schriften/Bildern — ADR-0015. Das Paket ist der bessere Weg: nur damit
    // erscheinen die Symbole des Panels.
    let visuExport: VisuExport;
    const beilagen: Array<{ name: string; inhalt: Buffer }> = [];
    try {
      const roh = readFileSync(visuPfad);
      if (istTar(roh)) {
        const eintraege = leseTar(roh);
        const json = eintraege.find((e) => e.name.toLowerCase().endsWith(".json"));
        if (!json) {
          console.error(`FEHLER: Paket ${visuPfad} enthält keine Export-JSON.`);
          return 1;
        }
        visuExport = JSON.parse(json.inhalt.toString("utf8")) as VisuExport;
        for (const e of eintraege) {
          if (e !== json) beilagen.push({ name: e.name, inhalt: e.inhalt });
        }
      } else {
        visuExport = JSON.parse(roh.toString("utf8")) as VisuExport;
      }
    } catch (e) {
      console.error(`FEHLER: Visu-Export nicht lesbar: ${e instanceof Error ? e.message : e}`);
      return 1;
    }
    // GA -> Datenpunkt-Schluessel aus den bereits erzeugten Datenpunkten
    // (Auftrag F-1: Aufloesung ueber die GA der Bus-Datenpunkte).
    const gaIndex = new Map<string, string>();
    for (const [gruppe, datei] of datenpunkte) {
      for (const [key, def] of Object.entries(datei)) {
        const adresse = (def as Datenpunkt).adresse;
        if (adresse) gaIndex.set(adresse, `${gruppe}.${key}`);
      }
    }
    const visu = konvertiereVisu(visuExport, (ga) => gaIndex.get(ga));
    if (visu.seiten.size > 0) {
      mkdirSync(join(ziel, "visu", "seiten"), { recursive: true });
      writeFileSync(join(ziel, "visu", "designs.yaml"), visuDesignsZuYaml(visu.designs), "utf8");
      for (const [slug, seite] of visu.seiten) {
        writeFileSync(join(ziel, "visu", "seiten", `${slug}.yaml`), visuSeiteZuYaml(seite), "utf8");
      }
    }

    // Beilagen (Schriften/Bilder) ins Gewerk legen und benennen (ADR-0015).
    // Die Dateien heissen im Paket font-<id>.ttf; im Gewerk soll der SPRECHENDE
    // Name stehen, weil die Designs ihn referenzieren.
    if (beilagen.length > 0) {
      const dateienDir = join(ziel, "visu", "dateien");
      mkdirSync(dateienDir, { recursive: true });
      const fontNamen = new Map<number, string>();
      for (const f of Object.values(visuExport.editVisuFont ?? {}) as Array<Record<string, unknown>>) {
        const n = String(f["name"] ?? "");
        if (n !== "") fontNamen.set(Number(f["id"]), n);
      }
      for (const b of beilagen) {
        const fontId = /^font-(\d+)\./.exec(b.name);
        const name = fontId
          ? `${(fontNamen.get(Number(fontId[1])) ?? `font-${fontId[1]}`).replace(/[^\w. -]/g, "_")}${b.name.slice(b.name.lastIndexOf("."))}`
          : b.name;
        writeFileSync(join(dateienDir, name), b.inhalt);
        visuDateien.push(name);
      }
    }
    visuBericht = visu.bericht;
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

  // Visu-Selbstprüfung: das geschriebene visu/ muss fehlerfrei laden — inkl.
  // Querbezug der Bindungen gegen die Datenpunkt-Definitionen (Auftrag Stufe 4).
  if (visuBericht !== null) {
    const visuKontrolle = ladeVisu(ziel, {
      definition: (schluessel: string): unknown => {
        const punkt = schluessel.indexOf(".");
        if (punkt < 0) return undefined;
        const g = kontrolle.gewerk?.datenpunkte.get(schluessel.slice(0, punkt));
        return g?.[schluessel.slice(punkt + 1)];
      },
    });
    if (visuKontrolle.fehler.length > 0) {
      console.error("FEHLER: erzeugte Visu lädt nicht fehlerfrei (Importer-Bug):");
      for (const f of visuKontrolle.fehler.slice(0, 10)) {
        console.error(`  ${f.datei}${f.element ? ` [${f.element}]` : ""}: ${f.grund}`);
      }
      return 1;
    }
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
  if (alleArchive.size > 0) {
    console.log(`Archiv-Definitionen synthetisiert (archiv/import.yaml — Aufbewahrung prüfen!):`);
    for (const [id, def] of alleArchive) console.log(`  ◇ ${id} ← ${def.quelle}`);
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

  // ---- Visu-Report (Stufe 3) — Struktur rein, Lücken ehrlich ----------------
  if (visuBericht !== null) {
    const v = visuBericht;
    console.log(`\n── Visu (Stufe 3) ──`);
    console.log(
      `${v.seiten} Seite(n), ${v.elemente} Element(e) aus ${v.visus} Visu(s) übernommen` +
        (v.gruppenknoten > 0 ? ` (${v.gruppenknoten} Gruppenknoten übersprungen)` : "") +
        (v.unaufgeloesteBindungen > 0
          ? ` — ${v.unaufgeloesteBindungen} Bindung(en) nicht aufgelöst`
          : ""),
    );
    const typen = [...v.controltypVerteilung.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([t, n]) => `${t}:${n}`)
      .join("  ");
    console.log(`controltyp-Verteilung: ${typen}`);
    if (v.nichtAbgebildet.size > 0) {
      console.log("Nicht (vollständig) abgebildet — vom Betreiber zu prüfen:");
      for (const [grund, n] of [...v.nichtAbgebildet.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`  ${String(n).padStart(4)}× ${grund}`);
      }
    }
    console.log(
      "Hinweis: Designs (Farben/Schrift/Rahmen) aus den Slots übernommen — am Screenshot bestätigen." +
        (visuDateien.length > 0
          ? ` ${visuDateien.length} Beilage(n) in visu/dateien/ übernommen (Schriften/Bilder).`
          : " Symbol-Glyphen bleiben leer: der Export als .tar enthält die Schriften mit."),
    );
  }

  // ---- MIGRATION.md: was der Betreiber selbst klären muss -------------------
  // Zusammengeführt aus beiden Stufen: Fremd-LBS (Stubs) und nicht abgebildete
  // Visuelemente. Verwendungen und Fundstellen kommen aus dem Logik-Report
  // bzw. dem Visu-Bericht — ohne sie wäre die Liste nicht priorisierbar.
  const lbsVerwendung = new Map<number, { anzahl: number; seiten: Set<string> }>();
  for (const s of logikReport.seiten) {
    for (const eintrag of s.stubFunctionIds) {
      const v = lbsVerwendung.get(eintrag.functionId) ?? { anzahl: 0, seiten: new Set<string>() };
      v.anzahl += eintrag.anzahl;
      v.seiten.add(s.seite);
      lbsVerwendung.set(eintrag.functionId, v);
    }
  }
  const migration = ermittleMigrationsBedarf({
    stubs: [...alleStubs.values()].map((s) => {
      const v = lbsVerwendung.get(s.functionId);
      return {
        functionId: s.functionId,
        name: s.name,
        eingaenge: s.eingaenge,
        ausgaenge: s.ausgaenge,
        verwendungen: v?.anzahl ?? 0,
        seiten: v ? [...v.seiten] : [],
      };
    }),
    vse: (visuBericht?.fremdElemente ?? []).map((f) => ({
      controltyp: f.controltyp,
      verwendungen: f.verwendungen,
      seiten: f.seiten,
    })),
  });
  let migrationMd = migrationsReportAlsMarkdown(migration);
  // Symbol-Glyphen anhängen: die Panel-Schrift ist NICHT Teil des Exports,
  // die Zeichen erscheinen sonst als leere Kästchen. Die Liste ist die
  // Grundlage, um sie auf Fachwerk-Symbole abzubilden.
  const glyphen = visuBericht?.glyphen ?? [];
  if (glyphen.length > 0 && visuDateien.length === 0) {
    migrationMd +=
      `\n## Symbole aus der Panel-Schrift (${glyphen.length})\n\n` +
      "Diese Zeichen stammen aus einer Symbol-Schrift des Altsystems. Der Export\n" +
      "enthält die Schriftdatei nicht — die Zeichen erscheinen deshalb leer. Ordne\n" +
      "jedem Zeichen ein Symbol zu (oder hinterlege die Schrift in deiner\n" +
      "Installation); die Reihenfolge zeigt, wo sich der Aufwand lohnt.\n\n" +
      "| Zeichen | Verwendungen |\n|---|---|\n" +
      glyphen.map((g) => `| U+${g.codepoint} | ${g.verwendungen} |`).join("\n") +
      "\n";
  }
  writeFileSync(join(ziel, "MIGRATION.md"), migrationMd, "utf8");

  const offen = migration.summe.lbs + migration.summe.vse;
  console.log(
    `\n── Migration ──\n` +
      (offen === 0
        ? "Nichts offen: alle Bausteine und Elemente sind abgebildet."
        : `${migration.summe.lbs} Baustein(e) und ${migration.summe.vse} Elementtyp(en) brauchen ` +
          `eine Entscheidung — Liste in ${join(ziel, "MIGRATION.md")}`) +
      (glyphen.length > 0 && visuDateien.length === 0
        ? `\n${glyphen.length} Symbol-Zeichen ohne Schrift — als .tar exportieren, dann kommen sie mit.`
        : ""),
  );

  console.log(`\nOK: Gewerk geschrieben nach ${ziel} (validate bestanden)`);
  return 0;
}

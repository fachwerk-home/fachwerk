/**
 * Einstiegspunkt `fachwerk` — Walking Skeleton (Phase 3).
 * Kommandos entstehen schrittweise: validate (S-2), run (S-6).
 */
import {
  analysiereLogik,
  ladeArchive,
  ladeVisu,
  loadGewerk,
  SUPPORTED_GEWERK_FORMAT,
} from "@fachwerk/core";
import { CLI_VERSION } from "./index.ts";

const [cmd = "--version", ...args] = process.argv.slice(2);

switch (cmd) {
  case "--version":
  case "version":
    console.log(
      `fachwerk ${CLI_VERSION} (Gewerk-Format v${SUPPORTED_GEWERK_FORMAT}) — Walking Skeleton`,
    );
    break;

  case "validate": {
    const dir = args[0];
    if (!dir) {
      console.error("Aufruf: fachwerk validate <gewerk-verzeichnis>");
      process.exit(2);
    }
    const { gewerk, fehler } = loadGewerk(dir);
    if (fehler.length > 0) {
      console.error(`FEHLER: ${fehler.length} Problem(e) in ${dir}`);
      for (const f of fehler) {
        console.error(`  ${f.datei}${f.pfad === "/" ? "" : ` ${f.pfad}`}: ${f.meldung}`);
      }
      process.exit(1);
    }
    // Statische Analyse (ADR-0005): Zyklen sind Fehler, Mehrfach-Schreiber Warnungen.
    // Eigene Bausteine zählen als bekannt (Dummy — validate startet keine Sandbox).
    const analyse = analysiereLogik(gewerk!, (typ) =>
      gewerk!.bausteine?.has(typ) ? { typ, rechne: () => null } : undefined,
    );
    for (const w of analyse.warnungen) console.warn(`WARNUNG: ${w}`);
    if (analyse.fehler.length > 0) {
      for (const f of analyse.fehler) console.error(`FEHLER: ${f}`);
      process.exit(1);
    }
    // Visu + Archive sind optional, aber wenn vorhanden, muessen sie stimmen
    // (Integration P5-6/P5-13a; Querbezuege gegen die Datenpunkt-Definitionen).
    const dpLookup = {
      definition: (schluessel: string): unknown => {
        const punkt = schluessel.indexOf(".");
        if (punkt < 0) return undefined;
        return gewerk!.datenpunkte.get(schluessel.slice(0, punkt))?.[schluessel.slice(punkt + 1)];
      },
    };
    const visu = ladeVisu(dir, dpLookup);
    const archive = ladeArchive(dir, gewerk!.datenpunkte);
    if (visu.fehler.length > 0 || archive.fehler.length > 0) {
      console.error(`FEHLER: ${visu.fehler.length + archive.fehler.length} Problem(e) in ${dir}`);
      for (const f of visu.fehler) {
        console.error(`  ${f.datei}${f.element ? ` [${f.element}]` : ""}: ${f.grund}`);
      }
      for (const f of archive.fehler) {
        console.error(`  ${f.datei}${f.pfad === "/" ? "" : ` ${f.pfad}`}: ${f.meldung}`);
      }
      process.exit(1);
    }
    const dpAnzahl = [...gewerk!.datenpunkte.values()].reduce(
      (n, datei) => n + Object.keys(datei).length,
      0,
    );
    const extras = [
      visu.seiten.size > 0 ? `${visu.seiten.size} Visuseite(n)` : "",
      archive.archive.size > 0 ? `${archive.archive.size} Archiv(e)` : "",
    ]
      .filter(Boolean)
      .join(", ");
    console.log(
      `OK: „${gewerk!.manifest.name}" — ${dpAnzahl} Datenpunkte, ${gewerk!.logik.size} Logikseite(n)${extras ? `, ${extras}` : ""}`,
    );
    break;
  }

  case "run": {
    const dir = args[0];
    if (!dir) {
      console.error("Aufruf: fachwerk run <gewerk-verzeichnis>");
      process.exit(2);
    }
    const { run } = await import("./run.ts");
    try {
      process.exit(await run(dir));
    } catch (e) {
      // Fataler Fehler sichtbar machen (im Container sonst schwer zu sehen).
      console.error("FATAL:", e instanceof Error ? (e.stack ?? e.message) : String(e));
      process.exit(1);
    }
    break;
  }

  case "import": {
    // Positionsargumente von der Option --visu <datei> trennen.
    const positional: string[] = [];
    let visuPfad: string | undefined;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--visu") {
        visuPfad = args[++i];
        if (visuPfad === undefined) {
          console.error("Aufruf: fachwerk import ... --visu braucht einen Dateipfad");
          process.exit(2);
        }
      } else {
        positional.push(args[i]!);
      }
    }
    const [dump, ziel] = [positional[0], positional[1]];
    if (!dump || !ziel) {
      console.error(
        "Aufruf: fachwerk import <projekt-dump.sql> <ziel-verzeichnis> [--visu <exportVisu.json>]",
      );
      process.exit(2);
    }
    const { importiere } = await import("./import.ts");
    // --visu ist optional: ohne sie laeuft nur Stufe 1+2 wie bisher.
    process.exit(importiere(dump, ziel, visuPfad));
    break;
  }

  case "katalog": {
    const { katalog } = await import("./katalog.ts");
    process.exit(katalog(args));
    break;
  }

  case "nutzer": {
    const { nutzer } = await import("./nutzer.ts");
    process.exit(await nutzer(args));
    break;
  }

  case "baustein": {
    if (args[0] !== "test" || !args[1]) {
      console.error("Aufruf: fachwerk baustein test <gewerk-verzeichnis>");
      process.exit(2);
    }
    const { bausteinTest } = await import("./baustein-test.ts");
    process.exit(await bausteinTest(args[1]));
    break;
  }

  default:
    console.error(`Unbekanntes Kommando: ${cmd}`);
    console.error(
      "Verfügbar: version · validate <verzeichnis> · run <verzeichnis> · " +
        "baustein test <verzeichnis> · nutzer anlegen|entfernen|liste · katalog [--json]",
    );
    process.exit(1);
}

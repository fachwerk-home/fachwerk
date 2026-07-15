/**
 * Einstiegspunkt `fachwerk` — Walking Skeleton (Phase 3).
 * Kommandos entstehen schrittweise: validate (S-2), run (S-6).
 */
import { analysiereLogik, loadGewerk, SUPPORTED_GEWERK_FORMAT } from "@fachwerk/core";
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
    const dpAnzahl = [...gewerk!.datenpunkte.values()].reduce(
      (n, datei) => n + Object.keys(datei).length,
      0,
    );
    console.log(
      `OK: „${gewerk!.manifest.name}" — ${dpAnzahl} Datenpunkte, ${gewerk!.logik.size} Logikseite(n)`,
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
    process.exit(await run(dir));
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
      "Verfügbar: version · validate <verzeichnis> · run <verzeichnis> · baustein test <verzeichnis>",
    );
    process.exit(1);
}

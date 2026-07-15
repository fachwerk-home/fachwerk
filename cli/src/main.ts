/**
 * Einstiegspunkt `fachwerk` — Walking Skeleton (Phase 3).
 * Kommandos entstehen schrittweise: validate (S-2), run (S-6).
 */
import { SUPPORTED_GEWERK_FORMAT } from "@fachwerk/core";
import { CLI_VERSION } from "./index.ts";

const cmd = process.argv[2] ?? "--version";

switch (cmd) {
  case "--version":
  case "version":
    console.log(
      `fachwerk ${CLI_VERSION} (Gewerk-Format v${SUPPORTED_GEWERK_FORMAT}) — Walking Skeleton`,
    );
    break;
  default:
    console.error(`Unbekanntes Kommando: ${cmd}`);
    console.error("Verfügbar: version");
    process.exit(1);
}

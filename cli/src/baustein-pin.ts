/**
 * `fachwerk baustein pin <gewerk> [--herkunft eigen|community|unverifiziert]`
 * — schreibt/aktualisiert `bausteine/pins.yaml` (ADR-0014 V-3).
 *
 * Ohne dieses Kommando waeren Pins unbenutzbar: niemand tippt einen sha256 von
 * Hand ab. Der Aufruf ist bewusst eine EIGENE Handlung — er beglaubigt den
 * aktuellen Stand. Wer ihn blind nach jeder Aenderung ausfuehrt, hebelt den
 * Schutz aus; deshalb markiert die Ausgabe, was sich geaendert hat.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { istHerkunft, loadGewerk, pinsZuYaml, type BausteinHerkunft } from "@fachwerk/core";

export function bausteinPin(zielDir: string, args: string[]): number {
  const i = args.indexOf("--herkunft");
  let herkunft: BausteinHerkunft = "eigen";
  if (i >= 0) {
    const roh = args[i + 1];
    if (!roh || !istHerkunft(roh)) {
      console.error("FEHLER: --herkunft braucht eigen | community | unverifiziert");
      return 2;
    }
    herkunft = roh;
  }

  // OHNE Pin-Pruefung laden: nach einer gewollten Aenderung muss sich ein
  // Gewerk neu pinnen lassen, sonst blockiert der alte Pin genau die Handlung,
  // die ihn erneuern soll. Alle anderen Fehler bleiben Fehler.
  const { gewerk, fehler } = loadGewerk(zielDir, { ohnePinPruefung: true });
  if (fehler.length > 0 || !gewerk) {
    console.error(`FEHLER: Gewerk ${zielDir} nicht ladbar:`);
    for (const f of fehler.slice(0, 10)) console.error(`  ${f.datei} ${f.pfad}: ${f.meldung}`);
    return 1;
  }
  if (!gewerk.bausteine || gewerk.bausteine.size === 0) {
    console.log("Keine eigenen Bausteine — nichts zu pinnen.");
    return 0;
  }

  const pinPfad = join(zielDir, "bausteine", "pins.yaml");
  const bisher = existsSync(pinPfad) ? readFileSync(pinPfad, "utf8") : "";

  const neu: Record<string, { version: number; sha256: string; herkunft: BausteinHerkunft }> = {};
  for (const id of [...gewerk.bausteine.keys()].sort()) {
    const b = gewerk.bausteine.get(id)!;
    neu[id] = { version: b.manifest.version, sha256: b.sha256, herkunft };
  }

  mkdirSync(join(zielDir, "bausteine"), { recursive: true });
  writeFileSync(pinPfad, pinsZuYaml(neu), "utf8");

  console.log(`${Object.keys(neu).length} Baustein(e) gepinnt in ${pinPfad} (Herkunft: ${herkunft})`);
  const geaendert: string[] = [];
  for (const [id, p] of Object.entries(neu)) {
    const unveraendert = bisher.includes(p.sha256);
    if (!unveraendert && bisher !== "") geaendert.push(id);
    console.log(`  ${unveraendert ? "=" : "~"} ${id.padEnd(20)} v${p.version}  ${p.sha256.slice(0, 12)}…`);
  }
  if (geaendert.length > 0) {
    console.error(
      `\nHinweis: ${geaendert.join(", ")} hat/haben sich geaendert. Pruefe die Aenderung, ` +
        "bevor du den neuen Stand committest — genau dafuer sind Pins da.",
    );
  }
  return 0;
}

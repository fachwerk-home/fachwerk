/**
 * `fachwerk baustein test <gewerk-dir>` (P4-5): führt die Testvektoren aus
 * den Baustein-Manifesten in der Sandbox aus — lokales Testen ohne Anlage,
 * ohne Toolchain (ADR-0008 S-7). Für Menschen UND Agenten der schnellste
 * Weg, einen Baustein zu prüfen.
 */
import { BausteinSandbox, loadGewerk, type Wert } from "@fachwerk/core";

export async function bausteinTest(dir: string): Promise<number> {
  const { gewerk, fehler } = loadGewerk(dir);
  if (fehler.length > 0 || !gewerk) {
    for (const f of fehler) console.error(`FEHLER: ${f.datei} ${f.pfad}: ${f.meldung}`);
    return 1;
  }
  const bausteine = [...(gewerk.bausteine?.values() ?? [])];
  if (bausteine.length === 0) {
    console.log("Keine eigenen Bausteine im Gewerk.");
    return 0;
  }

  let fehlgeschlagen = 0;
  for (const { manifest, jsPfad } of bausteine) {
    const tests = manifest.tests ?? [];
    if (tests.length === 0) {
      console.log(`~ ${manifest.id}: keine Testvektoren im Manifest`);
      continue;
    }
    const sandbox = new BausteinSandbox(jsPfad);
    const zustand: Record<string, Wert> = {}; // Vektoren teilen den Zustand (sequenziell)
    tests.forEach((t, i) => {
      const antwort = sandbox.rechne({
        eingaenge: t.eingaenge as Record<string, Wert | undefined>,
        parameter: { ...manifest.parameter, ...t.parameter },
        zustand,
        ausloeser: { art: "eingang" },
      });
      if ("fehler" in antwort) {
        console.error(`✗ ${manifest.id} #${i + 1}: ${antwort.fehler}`);
        fehlgeschlagen++;
        return;
      }
      Object.assign(zustand, antwort.zustand);
      const erwartet = t.erwartet ?? null;
      const ist = JSON.stringify(antwort.ausgaenge);
      const soll = JSON.stringify(erwartet);
      if (ist === soll) {
        console.log(`✓ ${manifest.id} #${i + 1}`);
      } else {
        console.error(`✗ ${manifest.id} #${i + 1}: erwartet ${soll}, erhalten ${ist}`);
        fehlgeschlagen++;
      }
    });
    sandbox.beende();
  }

  if (fehlgeschlagen > 0) {
    console.error(`FEHLER: ${fehlgeschlagen} Testvektor(en) fehlgeschlagen`);
    return 1;
  }
  console.log("OK: alle Baustein-Tests bestanden");
  return 0;
}

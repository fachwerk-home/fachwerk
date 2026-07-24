/**
 * Baustein-Pins (ADR-0014 V-3): Vertrauen bei der Installation, nicht zur
 * Laufzeit. Das Gewerk haelt je Baustein `version` + `sha256` fest; weicht der
 * Inhalt ab, verweigert das Gewerk den Start.
 *
 * Wogegen das schuetzt — und wogegen NICHT: Die Pins sind nicht faelschungs-
 * sicher (wer den Baustein aendert, kann die Pin-Datei mitaendern). Ihr Wert
 * liegt darin, dass jede Aenderung an fremdem Code im Git-Diff SICHTBAR wird
 * und nicht unbemerkt mitlaeuft — das Gewerk ist versionierter Text (ADR-0004).
 * Harte Isolation bleibt Stufe 2 (V-4).
 *
 * Ablage: `bausteine/pins.yaml`, neben den Bausteinen. Bewusst NICHT im
 * Baustein-Manifest (ein Baustein darf sich nicht selbst beglaubigen) und
 * nicht in gewerk.yaml (das bleibt das schlanke Manifest).
 */
import { createHash } from "node:crypto";

/** Woher ein Baustein stammt — bestimmt, wie laut gewarnt wird. */
export type BausteinHerkunft = "eigen" | "community" | "unverifiziert";

export const HERKUNFT_STUFEN: readonly BausteinHerkunft[] = [
  "eigen",
  "community",
  "unverifiziert",
];

export function istHerkunft(wert: string): wert is BausteinHerkunft {
  return (HERKUNFT_STUFEN as readonly string[]).includes(wert);
}

export interface BausteinPin {
  version: number;
  sha256: string;
  herkunft: BausteinHerkunft;
}

/** Inhalt von `bausteine/pins.yaml`: Baustein-Id -> Pin. */
export type BausteinPins = Record<string, BausteinPin>;

/**
 * Hash ueber die Dateien EINES Bausteins. Eingang ist die Zuordnung
 * Dateiname -> Inhalt; gehasht wird nach Namen sortiert, mit Laengenpraefix
 * je Datei. Das Laengenpraefix verhindert, dass zwei verschiedene Aufteilungen
 * denselben Hash ergeben (`a`+`bc` vs `ab`+`c`).
 *
 * Zeilenenden werden auf LF normalisiert: das Gewerk wird zwischen Windows und
 * Linux ausgetauscht, und ein Checkout darf den Hash nicht kippen.
 */
export function bausteinHash(dateien: ReadonlyMap<string, string>): string {
  const hash = createHash("sha256");
  for (const name of [...dateien.keys()].sort()) {
    const inhalt = (dateien.get(name) ?? "").replaceAll("\r\n", "\n");
    hash.update(`${name}\n${inhalt.length}\n`);
    hash.update(inhalt);
  }
  return hash.digest("hex");
}

export interface PinPruefung {
  /** Baustein-Id. */
  id: string;
  art: "ok" | "abweichung" | "fehlt" | "verwaist";
  meldung?: string;
  /** Warnstufe fuer die Oberflaeche (nur bei art "ok" gesetzt). */
  herkunft?: BausteinHerkunft;
}

export interface PinLage {
  ergebnisse: PinPruefung[];
  /** Startverweigerung: mindestens eine echte Abweichung. */
  blockiert: boolean;
  /** Bausteine ohne Pin — zulaessig, aber nennenswert. */
  ungepinnt: string[];
}

/**
 * Vergleicht die tatsaechlichen Bausteine mit den Pins.
 *
 * Bewusste Abstufung:
 * - **Abweichung** (Hash oder Version passt nicht) blockiert den Start. Genau
 *   dafuer sind Pins da.
 * - **Verwaist** (Pin ohne Baustein) blockiert NICHT: einen Baustein zu
 *   entfernen ist eine normale Aenderung, kein Angriff. Es wird gemeldet.
 * - **Ohne Pin** blockiert NICHT: bestehende Gewerke haben keine Pins, und ein
 *   Zwang wuerde jedes Upgrade brechen. Wer Pins pflegt, bekommt Schutz; wer
 *   keine hat, bleibt wo er war.
 */
export function pruefePins(
  vorhanden: ReadonlyMap<string, { version: number; sha256: string }>,
  pins: BausteinPins,
): PinLage {
  const ergebnisse: PinPruefung[] = [];
  const ungepinnt: string[] = [];
  let blockiert = false;

  for (const id of [...vorhanden.keys()].sort()) {
    const ist = vorhanden.get(id)!;
    const pin = pins[id];
    if (!pin) {
      ungepinnt.push(id);
      ergebnisse.push({ id, art: "fehlt", meldung: "kein Pin hinterlegt" });
      continue;
    }
    if (pin.sha256 !== ist.sha256) {
      blockiert = true;
      ergebnisse.push({
        id,
        art: "abweichung",
        meldung:
          `Inhalt weicht vom Pin ab (erwartet sha256 ${pin.sha256.slice(0, 12)}…, ` +
          `gefunden ${ist.sha256.slice(0, 12)}…)`,
      });
      continue;
    }
    if (pin.version !== ist.version) {
      blockiert = true;
      ergebnisse.push({
        id,
        art: "abweichung",
        meldung: `Version weicht vom Pin ab (erwartet ${pin.version}, gefunden ${ist.version})`,
      });
      continue;
    }
    ergebnisse.push({ id, art: "ok", herkunft: pin.herkunft });
  }

  for (const id of Object.keys(pins).sort()) {
    if (!vorhanden.has(id)) {
      ergebnisse.push({ id, art: "verwaist", meldung: "Pin ohne zugehoerigen Baustein" });
    }
  }

  return { ergebnisse, blockiert, ungepinnt };
}

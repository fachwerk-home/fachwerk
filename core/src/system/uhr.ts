/**
 * Uhr-Dienst (Zeit-Gruppe): speist System-Datenpunkte (SPEC-001, klasse
 * `system`) mit der aktuellen Zeit — das Fachwerk-Gegenstück zu den
 * Systemzeit-/Systemdatum-KOs des Referenzsystems. Die Zeit-BAUSTEINE bleiben
 * dadurch pur (Zeit ist ein normaler Eingang): deterministisch und testbar;
 * nur DIESER Dienst berührt die Wanduhr, und auch er mit injizierbarer Uhr.
 *
 * Konvention: ein System-Datenpunkt wird über seinen Schlüssel (letzter Teil)
 * erkannt — Gruppe frei wählbar:
 *   zeit       text  "HH:MM:SS" (lokale Zeit, 24 h)
 *   datum      text  "YYYY-MM-DD" (ISO — sortier-/vergleichbar)
 *   unix       zahl  Sekunden seit Epoche
 *   wochentag  zahl  1 = Montag … 7 = Sonntag
 */
import type { DatenpunktRegistry } from "../datenpunkte/registry.ts";
import type { Gewerk } from "../gewerk/loader.ts";

export type UhrArt = "zeit" | "datum" | "unix" | "wochentag";

const ARTEN = new Set<UhrArt>(["zeit", "datum", "unix", "wochentag"]);

/** System-Datenpunkte eines Gewerks, die der Uhr-Dienst speisen kann. */
export function uhrDatenpunkte(gewerk: Gewerk): Map<string, UhrArt> {
  const map = new Map<string, UhrArt>();
  for (const [gruppe, datei] of gewerk.datenpunkte) {
    for (const [key, def] of Object.entries(datei)) {
      if (def.klasse === "system" && ARTEN.has(key as UhrArt)) {
        map.set(`${gruppe}.${key}`, key as UhrArt);
      }
    }
  }
  return map;
}

const zwei = (n: number): string => String(n).padStart(2, "0");

export function uhrWert(art: UhrArt, jetzt: Date): string | number {
  switch (art) {
    case "zeit":
      return `${zwei(jetzt.getHours())}:${zwei(jetzt.getMinutes())}:${zwei(jetzt.getSeconds())}`;
    case "datum":
      return `${jetzt.getFullYear()}-${zwei(jetzt.getMonth() + 1)}-${zwei(jetzt.getDate())}`;
    case "unix":
      return Math.floor(jetzt.getTime() / 1000);
    case "wochentag":
      return jetzt.getDay() === 0 ? 7 : jetzt.getDay(); // 1=Mo … 7=So
  }
}

export interface UhrOptionen {
  /** Injizierbare Wanduhr (Tests). Default: () => new Date(). */
  jetzt?: () => Date;
  /** Tick-Intervall in ms (Default 1000 — Systemzeit tickt sekündlich). */
  intervallMs?: number;
}

export class UhrDienst {
  readonly #registry: DatenpunktRegistry;
  readonly #ziele: Map<string, UhrArt>;
  readonly #jetzt: () => Date;
  readonly #intervallMs: number;
  #timer: ReturnType<typeof setInterval> | null = null;

  constructor(registry: DatenpunktRegistry, ziele: Map<string, UhrArt>, opts: UhrOptionen = {}) {
    this.#registry = registry;
    this.#ziele = ziele;
    this.#jetzt = opts.jetzt ?? (() => new Date());
    this.#intervallMs = opts.intervallMs ?? 1000;
  }

  /** Schreibt die aktuellen Werte (on-change der Registry filtert Unverändertes). */
  tick(): void {
    const jetzt = this.#jetzt();
    for (const [schluessel, art] of this.#ziele) {
      this.#registry.schreibe(schluessel, uhrWert(art, jetzt), "system");
    }
  }

  start(): void {
    if (this.#timer || this.#ziele.size === 0) return;
    this.tick(); // sofort initialisieren, nicht erst nach dem ersten Intervall
    this.#timer = setInterval(() => this.tick(), this.#intervallMs);
    this.#timer.unref?.();
  }

  stop(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
  }
}

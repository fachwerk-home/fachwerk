/**
 * Gewerk-Loader (S-2): liest einen Gewerk-Verzeichnisbaum (ADR-0004),
 * validiert gegen die JSON-Schemas (@fachwerk/schema) und prüft Referenzen.
 * Fehler sind präzise adressiert (Datei + Pfad + Meldung) — für Menschen
 * UND Agenten lesbar (Plan § 4.1).
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { parse } from "yaml";
import {
  type ErrorObject,
  validateGewerkManifest,
  validateDatenpunktDatei,
  validateLogikSeite,
  validateBausteinManifest,
  GEWERK_FORMAT_VERSION,
  type GewerkManifest,
  type DatenpunktDatei,
  type LogikSeite,
  type BausteinManifest,
} from "@fachwerk/schema";

export interface LadeFehler {
  datei: string;
  pfad: string;
  meldung: string;
}

export interface EigenerBaustein {
  manifest: BausteinManifest;
  /** Absoluter Pfad zu baustein.js (plain JS, ESM). */
  jsPfad: string;
}

export interface Gewerk {
  manifest: GewerkManifest;
  /** Gruppe (Dateiname ohne .yaml) → Datenpunkte. */
  datenpunkte: Map<string, DatenpunktDatei>;
  /** Seite (Dateiname ohne .yaml) → Logikseite. */
  logik: Map<string, LogikSeite>;
  /** Eigene Bausteine (bausteine/<id>/), Schlüssel = Manifest-Id. */
  bausteine?: Map<string, EigenerBaustein>;
}

export interface LadeErgebnis {
  gewerk: Gewerk | null;
  fehler: LadeFehler[];
}

function ajvFehler(datei: string, errors: ErrorObject[] | null | undefined): LadeFehler[] {
  return (errors ?? []).map((e) => ({
    datei,
    pfad: e.instancePath === "" ? "/" : e.instancePath,
    meldung: e.message ?? "ungültig",
  }));
}

function yamlDateien(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".yaml"))
    .sort()
    .map((f) => join(dir, f));
}

function parseYaml(
  datei: string,
  fehler: LadeFehler[],
): unknown {
  let text: string;
  try {
    text = readFileSync(datei, "utf8");
  } catch {
    fehler.push({ datei, pfad: "/", meldung: "Datei nicht lesbar" });
    return undefined;
  }
  try {
    return parse(text);
  } catch (e) {
    fehler.push({
      datei,
      pfad: "/",
      meldung: `YAML-Syntaxfehler: ${e instanceof Error ? e.message : String(e)}`,
    });
    return undefined;
  }
}

/** Ist die Referenz ein Datenpunkt (dp:<gruppe>.<key>)? */
function alsDatenpunktRef(ref: string): { gruppe: string; key: string } | null {
  if (!ref.startsWith("dp:")) return null;
  const [gruppe, key] = ref.slice(3).split(".", 2) as [string, string];
  return { gruppe, key };
}

/** Referenzprüfung: jede Kante muss auf existierende Datenpunkte/Knoten zeigen. */
function pruefeReferenzen(gewerk: Gewerk, fehler: LadeFehler[]): void {
  const hatDp = (gruppe: string, key: string): boolean =>
    gewerk.datenpunkte.get(gruppe)?.[key] !== undefined;

  for (const [seite, logik] of gewerk.logik) {
    const datei = `logik/${seite}.yaml`;
    logik.kanten.forEach((kante, i) => {
      for (const ende of ["von", "nach"] as const) {
        const ref = kante[ende];
        const dp = alsDatenpunktRef(ref);
        if (dp) {
          if (!hatDp(dp.gruppe, dp.key)) {
            fehler.push({
              datei,
              pfad: `/kanten/${i}/${ende}`,
              meldung: `unbekannter Datenpunkt „${ref}" (erwartet dp:<gruppe>.<key> aus datenpunkte/)`,
            });
          }
        } else {
          const knoten = ref.split(".", 1)[0] as string;
          if (logik.knoten[knoten] === undefined) {
            fehler.push({
              datei,
              pfad: `/kanten/${i}/${ende}`,
              meldung: `unbekannter Knoten „${knoten}" (nicht in /knoten dieser Seite)`,
            });
          }
        }
      }
    });
  }
}

/**
 * Lädt ein Gewerk aus einem Verzeichnis. Sammelt ALLE Fehler statt beim
 * ersten abzubrechen; `gewerk` ist nur bei fehlerfreier Struktur gesetzt.
 */
export function loadGewerk(dir: string): LadeErgebnis {
  const fehler: LadeFehler[] = [];

  // Manifest
  const manifestPfad = join(dir, "gewerk.yaml");
  if (!existsSync(manifestPfad)) {
    return {
      gewerk: null,
      fehler: [{ datei: "gewerk.yaml", pfad: "/", meldung: "fehlt (kein Gewerk-Verzeichnis?)" }],
    };
  }
  const manifestRoh = parseYaml(manifestPfad, fehler);
  if (manifestRoh !== undefined && !validateGewerkManifest(manifestRoh)) {
    fehler.push(...ajvFehler("gewerk.yaml", validateGewerkManifest.errors));
  }
  const manifest = manifestRoh as GewerkManifest | undefined;
  if (manifest && manifest.format !== GEWERK_FORMAT_VERSION) {
    fehler.push({
      datei: "gewerk.yaml",
      pfad: "/format",
      meldung: `Format v${manifest.format} wird nicht unterstützt (diese Version: v${GEWERK_FORMAT_VERSION})`,
    });
  }

  // Datenpunkte
  const datenpunkte = new Map<string, DatenpunktDatei>();
  for (const datei of yamlDateien(join(dir, "datenpunkte"))) {
    const rel = `datenpunkte/${basename(datei)}`;
    const roh = parseYaml(datei, fehler);
    if (roh === undefined) continue;
    if (!validateDatenpunktDatei(roh)) {
      fehler.push(...ajvFehler(rel, validateDatenpunktDatei.errors));
      continue;
    }
    datenpunkte.set(basename(datei, ".yaml"), roh);
  }

  // Eigene Bausteine (bausteine/<verzeichnis>/manifest.yaml + baustein.js)
  const bausteine = new Map<string, EigenerBaustein>();
  const bausteinDir = join(dir, "bausteine");
  if (existsSync(bausteinDir)) {
    for (const eintrag of readdirSync(bausteinDir, { withFileTypes: true })) {
      if (!eintrag.isDirectory()) continue;
      const rel = `bausteine/${eintrag.name}/manifest.yaml`;
      const manifestPfad2 = join(bausteinDir, eintrag.name, "manifest.yaml");
      if (!existsSync(manifestPfad2)) {
        fehler.push({ datei: rel, pfad: "/", meldung: "manifest.yaml fehlt" });
        continue;
      }
      const roh = parseYaml(manifestPfad2, fehler);
      if (roh === undefined) continue;
      if (!validateBausteinManifest(roh)) {
        fehler.push(...ajvFehler(rel, validateBausteinManifest.errors));
        continue;
      }
      if (roh.id !== eintrag.name) {
        fehler.push({
          datei: rel,
          pfad: "/id",
          meldung: `Id „${roh.id}" muss dem Verzeichnisnamen „${eintrag.name}" entsprechen`,
        });
        continue;
      }
      const jsPfad = join(bausteinDir, eintrag.name, "baustein.js");
      if (!existsSync(jsPfad)) {
        fehler.push({
          datei: `bausteine/${eintrag.name}/baustein.js`,
          pfad: "/",
          meldung: "baustein.js fehlt (plain JS, ESM, default-Export rechne)",
        });
        continue;
      }
      bausteine.set(roh.id, { manifest: roh, jsPfad });
    }
  }

  // Logikseiten
  const logik = new Map<string, LogikSeite>();
  for (const datei of yamlDateien(join(dir, "logik"))) {
    const rel = `logik/${basename(datei)}`;
    const roh = parseYaml(datei, fehler);
    if (roh === undefined) continue;
    if (!validateLogikSeite(roh)) {
      fehler.push(...ajvFehler(rel, validateLogikSeite.errors));
      continue;
    }
    logik.set(basename(datei, ".yaml"), roh);
  }

  if (fehler.length > 0 || !manifest) {
    return { gewerk: null, fehler };
  }

  const gewerk: Gewerk = { manifest, datenpunkte, logik, bausteine };
  pruefeReferenzen(gewerk, fehler);
  return fehler.length > 0 ? { gewerk: null, fehler } : { gewerk, fehler: [] };
}

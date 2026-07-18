import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { parse } from "yaml";
import { type ArchivDatei, validateArchivDatei, type ArchivDefinition } from "@fachwerk/schema";
import type { DatenpunktDatei } from "@fachwerk/schema";

export interface ArchivLadeFehler {
  datei: string;
  pfad: string;
  meldung: string;
}

export interface ArchivLadeErgebnis {
  archive: Map<string, ArchivDefinition>;
  fehler: ArchivLadeFehler[];
}

export function ladeArchive(
  gewerkVerzeichnis: string,
  datenpunkte?: Map<string, DatenpunktDatei>
): ArchivLadeErgebnis {
  const fehler: ArchivLadeFehler[] = [];
  const archive = new Map<string, ArchivDefinition>();
  const archivDir = join(gewerkVerzeichnis, "archiv");

  if (!existsSync(archivDir)) {
    return { archive, fehler };
  }

  const yamlDateien = readdirSync(archivDir)
    .filter((f) => f.endsWith(".yaml"))
    .sort()
    .map((f) => join(archivDir, f));

  const hatDpUndIstKorrekt = (quelle: string): boolean => {
    if (!datenpunkte) return true;
    const punktIndex = quelle.indexOf(".");
    if (punktIndex === -1) return false;
    const g = quelle.substring(0, punktIndex);
    const k = quelle.substring(punktIndex + 1);
    const dp = datenpunkte.get(g)?.[k];
    if (!dp) return false;
    return dp.typ === "zahl" || dp.typ === "bool";
  };
  
  const datenpunktExistiert = (quelle: string): boolean => {
      if (!datenpunkte) return true;
      const punktIndex = quelle.indexOf(".");
      if (punktIndex === -1) return false;
      const g = quelle.substring(0, punktIndex);
      const k = quelle.substring(punktIndex + 1);
      return datenpunkte.get(g)?.[k] !== undefined;
  };

  for (const datei of yamlDateien) {
    const rel = `archiv/${basename(datei)}`;
    let text: string;
    try {
      text = readFileSync(datei, "utf8");
    } catch {
      fehler.push({ datei: rel, pfad: "/", meldung: "Datei nicht lesbar" });
      continue;
    }

    let roh: unknown;
    try {
      roh = parse(text);
    } catch (e) {
      fehler.push({
        datei: rel,
        pfad: "/",
        meldung: `YAML-Syntaxfehler: ${e instanceof Error ? e.message : String(e)}`,
      });
      continue;
    }

    if (!validateArchivDatei(roh)) {
      (validateArchivDatei.errors ?? []).forEach((e) => {
        fehler.push({
          datei: rel,
          pfad: e.instancePath === "" ? "/" : e.instancePath,
          meldung: e.message ?? "ungültig",
        });
      });
      continue;
    }

    const dateiArchive = roh as ArchivDatei;
    for (const [id, def] of Object.entries(dateiArchive)) {
      if (archive.has(id)) {
        fehler.push({
          datei: rel,
          pfad: `/${id}`,
          meldung: `Archiv-ID „${id}“ ist nicht eindeutig (bereits in anderer Datei definiert)`,
        });
        continue;
      }
      
      if (datenpunkte) {
          if (!datenpunktExistiert(def.quelle)) {
              fehler.push({
                  datei: rel,
                  pfad: `/${id}/quelle`,
                  meldung: `Quelle „${def.quelle}“ existiert nicht in den Datenpunkten`,
              });
              continue;
          }
          if (!hatDpUndIstKorrekt(def.quelle)) {
              fehler.push({
                  datei: rel,
                  pfad: `/${id}/quelle`,
                  meldung: `Quelle „${def.quelle}“ muss vom Typ 'zahl' oder 'bool' sein`,
              });
              continue;
          }
      }

      archive.set(id, def);
    }
  }

  return { archive, fehler };
}

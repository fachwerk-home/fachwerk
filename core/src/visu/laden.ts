import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { parse } from "yaml";
import {
  type ErrorObject,
  type VisuDesigns,
  type VisuSeite,
  validateVisuDesigns,
  validateVisuSeite,
} from "@fachwerk/schema";

export interface VisuLadeFehler {
  datei: string;
  element?: string;
  grund: string;
}

export interface DatenpunktDefinitionen {
  definition(schluessel: string): unknown;
}

export interface VisuLadeErgebnis {
  seiten: Map<string, VisuSeite>;
  designs: VisuDesigns;
  fehler: VisuLadeFehler[];
}

function schemaFehler(datei: string, errors: ErrorObject[] | null | undefined): VisuLadeFehler[] {
  return (errors ?? []).map((error) => {
    const teile = error.instancePath.split("/").filter(Boolean);
    const elementIndex = teile.indexOf("elemente");
    const element = elementIndex >= 0 ? teile[elementIndex + 1] : undefined;
    return {
      datei,
      ...(element ? { element } : {}),
      grund: `${error.instancePath || "/"}: ${error.message ?? "ungültig"}`,
    };
  });
}

function leseYaml(datei: string, rel: string, fehler: VisuLadeFehler[]): unknown {
  try {
    return parse(readFileSync(datei, "utf8"));
  } catch (error) {
    fehler.push({
      datei: rel,
      grund: `YAML konnte nicht gelesen werden: ${error instanceof Error ? error.message : String(error)}`,
    });
    return undefined;
  }
}

function pruefeSeite(
  datei: string,
  seite: VisuSeite,
  designs: VisuDesigns,
  definitionen: DatenpunktDefinitionen | undefined,
  fehler: VisuLadeFehler[],
): void {
  if (seite.groessen[seite.basis] === undefined) {
    fehler.push({ datei, grund: `Basis-Breakpoint ${seite.basis} fehlt in groessen` });
  }
  for (const [elementKey, element] of Object.entries(seite.elemente)) {
    const melde = (grund: string): void => { fehler.push({ datei, element: elementKey, grund }); };
    if (element.gruppe && seite.gruppen?.[element.gruppe] === undefined) melde(`Gruppe ${element.gruppe} ist nicht definiert`);
    if (element.design && designs[element.design] === undefined) melde(`Design ${element.design} ist nicht definiert`);
    for (const regel of element.design_je_wert ?? []) {
      if (designs[regel.design] === undefined) melde(`Design ${regel.design} aus design_je_wert ist nicht definiert`);
    }
    for (const breakpoint of Object.keys(element.placements ?? {})) {
      if (seite.groessen[breakpoint] === undefined) melde(`Placement-Breakpoint ${breakpoint} fehlt in groessen`);
    }
    if (definitionen) {
      for (const [rolle, schluessel] of Object.entries(element.bindungen ?? {})) {
        if (definitionen.definition(schluessel) === undefined) melde(`Bindung ${rolle} verweist auf unbekannten Datenpunkt ${schluessel}`);
      }
    }
  }
}

/** Lädt den optionalen Visu-Baum eines Gewerks und sammelt alle erkennbaren Fehler. */
export function ladeVisu(
  gewerkVerzeichnis: string,
  definitionen?: DatenpunktDefinitionen,
): VisuLadeErgebnis {
  const visuDir = join(gewerkVerzeichnis, "visu");
  const seiten = new Map<string, VisuSeite>();
  const fehler: VisuLadeFehler[] = [];
  if (!existsSync(visuDir)) return { seiten, designs: {}, fehler };

  let designs: VisuDesigns = {};
  const designsPfad = join(visuDir, "designs.yaml");
  if (existsSync(designsPfad)) {
    const roh = leseYaml(designsPfad, "visu/designs.yaml", fehler);
    if (roh !== undefined) {
      if (validateVisuDesigns(roh)) designs = roh;
      else fehler.push(...schemaFehler("visu/designs.yaml", validateVisuDesigns.errors));
    }
  }

  const seitenDir = join(visuDir, "seiten");
  if (existsSync(seitenDir)) {
    const dateien = readdirSync(seitenDir)
      .filter((name) => name.endsWith(".yaml"))
      .sort();
    for (const name of dateien) {
      const rel = `visu/seiten/${name}`;
      const roh = leseYaml(join(seitenDir, name), rel, fehler);
      if (roh === undefined) continue;
      if (!validateVisuSeite(roh)) {
        fehler.push(...schemaFehler(rel, validateVisuSeite.errors));
        continue;
      }
      const key = basename(name, ".yaml");
      seiten.set(key, roh);
      pruefeSeite(rel, roh, designs, definitionen, fehler);
    }
    // Include-Verweise erst pruefen, wenn ALLE Seiten gelesen sind — sonst
    // haengt das Ergebnis von der Dateireihenfolge ab.
    for (const [key, seite] of seiten) {
      for (const ziel of seite.includes ?? []) {
        const zielSeite = seiten.get(ziel);
        if (!zielSeite) {
          fehler.push({
            datei: `visu/seiten/${key}.yaml`,
            grund: `includes verweist auf unbekannte Seite ${ziel}`,
          });
        } else if (zielSeite.typ !== "include") {
          fehler.push({
            datei: `visu/seiten/${key}.yaml`,
            grund: `includes verweist auf ${ziel}, aber die Seite hat typ ${zielSeite.typ} (erwartet: include)`,
          });
        }
      }
    }
  }
  return { seiten, designs, fehler };
}

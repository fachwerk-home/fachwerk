import type { VisuDesigns, VisuSeite, WertFormat } from "../../../schema/src/visu.ts";
import { api, type DatenpunktSicht } from "../lib/api.ts";

export interface VisuAntwort {
  seiten: Record<string, VisuSeite>;
  designs: VisuDesigns;
}

export type VisuDatenpunkt = DatenpunktSicht & { format?: WertFormat };

export async function ladeVisuDaten(): Promise<{
  visu: VisuAntwort;
  datenpunkte: VisuDatenpunkt[];
}> {
  const [visu, datenpunkte] = await Promise.all([
    api.visu<VisuAntwort>(),
    api.datenpunkte(),
  ]);
  return {
    visu,
    datenpunkte: datenpunkte.datenpunkte as VisuDatenpunkt[],
  };
}

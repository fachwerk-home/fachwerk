import type { VisuDesigns, VisuSeite, WertFormat } from "../../../schema/src/visu.ts";
import { api, type DatenpunktSicht } from "../lib/api.ts";

export interface VisuAntwort {
  seiten: Record<string, VisuSeite>;
  designs: VisuDesigns;
}

export type VisuDatenpunkt = DatenpunktSicht & { format?: WertFormat };

function zugriffsToken(): string | null {
  const ausUrl = new URLSearchParams(location.search).get("token");
  if (ausUrl) localStorage.setItem("fachwerk-token", ausUrl);
  return localStorage.getItem("fachwerk-token");
}

export async function ladeVisuDaten(): Promise<{
  visu: VisuAntwort;
  datenpunkte: VisuDatenpunkt[];
}> {
  const token = zugriffsToken();
  const [antwort, datenpunkte] = await Promise.all([
    fetch("/api/visu", { headers: token ? { authorization: `Bearer ${token}` } : {} }),
    api.datenpunkte(),
  ]);
  if (!antwort.ok) throw new Error(`${antwort.status} ${antwort.statusText} bei /api/visu`);
  return {
    visu: await antwort.json() as VisuAntwort,
    datenpunkte: datenpunkte.datenpunkte as VisuDatenpunkt[],
  };
}

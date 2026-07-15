/**
 * Kanonische Serialisierung (ADR-0004): dieselbe Struktur ergibt immer
 * denselben Text — stabile Schlüssel-Reihenfolge, feste YAML-Optionen.
 * Damit bleiben Git-Diffs minimal und Round-trips verlustfrei.
 */
import { stringify } from "yaml";
import {
  KEY_ORDER,
  type GewerkManifest,
  type DatenpunktDatei,
  type LogikSeite,
} from "@fachwerk/schema";

const YAML_OPTS = { indent: 2, lineWidth: 100 } as const;

/** Objekt mit Schlüsseln in kanonischer Reihenfolge neu aufbauen. */
function ordne(
  eingabe: object,
  reihenfolge: readonly string[],
): Record<string, unknown> {
  const obj = eingabe as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of reihenfolge) {
    if (obj[k] !== undefined) out[k] = obj[k];
  }
  // Unbekannte Schlüssel (sollten nach Validierung nicht existieren) hinten, sortiert.
  for (const k of Object.keys(obj).sort()) {
    if (!reihenfolge.includes(k) && obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
}

export function manifestZuYaml(m: GewerkManifest): string {
  return stringify(ordne(m, KEY_ORDER.gewerk), YAML_OPTS);
}

export function datenpunkteZuYaml(datei: DatenpunktDatei): string {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(datei).sort()) {
    out[key] = ordne(datei[key] as unknown as Record<string, unknown>, KEY_ORDER.datenpunkt);
  }
  return stringify(out, YAML_OPTS);
}

export function logikZuYaml(seite: LogikSeite): string {
  const knoten: Record<string, unknown> = {};
  for (const key of Object.keys(seite.knoten).sort()) {
    knoten[key] = ordne(
      seite.knoten[key] as unknown as Record<string, unknown>,
      KEY_ORDER.logikKnoten,
    );
  }
  const out = ordne(
    {
      notizen: seite.notizen,
      knoten,
      kanten: seite.kanten.map((k) =>
        ordne(k as unknown as Record<string, unknown>, KEY_ORDER.logikKante),
      ),
    },
    KEY_ORDER.logikSeite,
  );
  return stringify(out, YAML_OPTS);
}

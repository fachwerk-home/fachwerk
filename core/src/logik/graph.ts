/**
 * Logik-Graph (S-4): baut aus den Logikseiten eines Gewerks EINEN globalen
 * Graphen (ADR-0005 E-2b: Datenpunkte sind Knoten desselben Graphen,
 * Kaskaden enden nicht an Seitengrenzen) und liefert die statischen
 * Analysen: topologische Ordnung, Zyklen (E-6), Mehrfach-Schreiber (E-7).
 */
import type { TriggerSemantik } from "@fachwerk/schema";
import type { Gewerk } from "../gewerk/loader.ts";
import { findeBaustein, type Baustein } from "./bausteine.ts";

/** Knoten-Id ist seitenqualifiziert: <seite>/<name>. */
export type KnotenId = string;

export type Endpunkt =
  | { art: "dp"; schluessel: string }
  | { art: "port"; knoten: KnotenId; port: string };

export interface Eingang {
  port: string;
  quelle: Endpunkt;
  trigger: TriggerSemantik;
}

export interface Ausgang {
  port: string;
  ziel: Endpunkt;
}

export interface GraphKnoten {
  id: KnotenId;
  baustein: Baustein;
  parameter: Readonly<Record<string, unknown>>;
  eingaenge: Eingang[];
  ausgaenge: Ausgang[];
}

export interface DpLeser {
  knoten: KnotenId;
  port: string;
  trigger: TriggerSemantik;
}

export interface LogikGraph {
  knoten: Map<KnotenId, GraphKnoten>;
  /** Datenpunkt → lesende Eingänge (Kaskaden-Start). */
  dpLeser: Map<string, DpLeser[]>;
  /** Globale topologische Ordnung (nur gültig, wenn zyklen leer). */
  topoOrdnung: KnotenId[];
  /** Knoten, die an mindestens einem Zyklus beteiligt sind (E-6). */
  zyklusKnoten: KnotenId[];
  /** Datenpunkte mit mehr als einem schreibenden Ausgang (E-7). */
  mehrfachSchreiber: Array<{ schluessel: string; schreiber: KnotenId[] }>;
  /** Baufehler (unbekannte Bausteine, unzulässige Kanten). */
  fehler: string[];
}

function parseEndpunkt(ref: string, seite: string): Endpunkt {
  if (ref.startsWith("dp:")) {
    return { art: "dp", schluessel: ref.slice(3) };
  }
  const [knoten, port] = ref.split(".", 2) as [string, string];
  return { art: "port", knoten: `${seite}/${knoten}`, port };
}

export function baueGraph(gewerk: Gewerk): LogikGraph {
  const knoten = new Map<KnotenId, GraphKnoten>();
  const fehler: string[] = [];

  for (const [seite, logik] of gewerk.logik) {
    for (const [name, def] of Object.entries(logik.knoten)) {
      const impl = findeBaustein(def.baustein);
      if (!impl) {
        fehler.push(`logik/${seite}.yaml: unbekannter Baustein „${def.baustein}" (Knoten ${name})`);
        continue;
      }
      knoten.set(`${seite}/${name}`, {
        id: `${seite}/${name}`,
        baustein: impl,
        parameter: def.parameter ?? {},
        eingaenge: [],
        ausgaenge: [],
      });
    }
  }

  for (const [seite, logik] of gewerk.logik) {
    logik.kanten.forEach((kante, i) => {
      const von = parseEndpunkt(kante.von, seite);
      const nach = parseEndpunkt(kante.nach, seite);
      const ort = `logik/${seite}.yaml kanten[${i}]`;

      if (von.art === "dp" && nach.art === "dp") {
        fehler.push(`${ort}: Kante Datenpunkt→Datenpunkt ist nicht erlaubt (Baustein dazwischensetzen)`);
        return;
      }
      if (nach.art === "port") {
        const ziel = knoten.get(nach.knoten);
        if (!ziel) return; // Baufehler des Knotens bereits gemeldet
        ziel.eingaenge.push({
          port: nach.port,
          quelle: von,
          trigger: kante.trigger ?? "on-change",
        });
      }
      if (von.art === "port") {
        const quelle = knoten.get(von.knoten);
        if (!quelle) return;
        quelle.ausgaenge.push({ port: von.port, ziel: nach });
      }
    });
  }

  // Datenpunkt-Leser und -Schreiber sammeln
  const dpLeser = new Map<string, DpLeser[]>();
  const dpSchreiber = new Map<string, KnotenId[]>();
  for (const k of knoten.values()) {
    for (const e of k.eingaenge) {
      if (e.quelle.art === "dp") {
        const liste = dpLeser.get(e.quelle.schluessel) ?? [];
        liste.push({ knoten: k.id, port: e.port, trigger: e.trigger });
        dpLeser.set(e.quelle.schluessel, liste);
      }
    }
    for (const a of k.ausgaenge) {
      if (a.ziel.art === "dp") {
        const liste = dpSchreiber.get(a.ziel.schluessel) ?? [];
        liste.push(k.id);
        dpSchreiber.set(a.ziel.schluessel, liste);
      }
    }
  }

  const mehrfachSchreiber = [...dpSchreiber.entries()]
    .filter(([, schreiber]) => schreiber.length > 1)
    .map(([schluessel, schreiber]) => ({ schluessel, schreiber }));

  // Knoten-Adjazenz: A→B direkt (Port→Port) oder via Datenpunkt (E-2b global).
  const nachfolger = new Map<KnotenId, Set<KnotenId>>();
  for (const id of knoten.keys()) nachfolger.set(id, new Set());
  for (const k of knoten.values()) {
    for (const a of k.ausgaenge) {
      if (a.ziel.art === "port") {
        nachfolger.get(k.id)!.add(a.ziel.knoten);
      } else {
        for (const leser of dpLeser.get(a.ziel.schluessel) ?? []) {
          nachfolger.get(k.id)!.add(leser.knoten);
        }
      }
    }
  }

  // Kahn: topologische Ordnung; Rest = Zyklusbeteiligte (E-6).
  const eingangsgrad = new Map<KnotenId, number>();
  for (const id of knoten.keys()) eingangsgrad.set(id, 0);
  for (const ziele of nachfolger.values()) {
    for (const ziel of ziele) eingangsgrad.set(ziel, (eingangsgrad.get(ziel) ?? 0) + 1);
  }
  const frei = [...eingangsgrad.entries()].filter(([, n]) => n === 0).map(([id]) => id);
  frei.sort(); // deterministische Ordnung bei Gleichstand
  const topoOrdnung: KnotenId[] = [];
  while (frei.length > 0) {
    const id = frei.shift()!;
    topoOrdnung.push(id);
    for (const ziel of nachfolger.get(id) ?? []) {
      const n = eingangsgrad.get(ziel)! - 1;
      eingangsgrad.set(ziel, n);
      if (n === 0) {
        frei.push(ziel);
        frei.sort();
      }
    }
  }
  const zyklusKnoten = [...knoten.keys()].filter((id) => !topoOrdnung.includes(id)).sort();

  return { knoten, dpLeser, topoOrdnung, zyklusKnoten, mehrfachSchreiber, fehler };
}

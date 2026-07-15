/**
 * Logik-Konvertierung (Import-Assistent, Stufe 2). Zwei getrennte Aufgaben:
 *  1. STRUKTUR extrahieren — Seiten, Element-Instanzen, typisierte Kanten
 *     (KO-Referenz / Element-Ausgang / statischer Wert). Rein aus Nutzdaten.
 *  2. ABBILDEN, was eindeutig abbildbar ist, und den Rest ehrlich als Lücke
 *     berichten (Portierungs-Prioritäten). KEINE geratenen Semantiken.
 *
 * Clean-Room: liest ausschließlich die Konfigurations-/Verdrahtungsdaten des
 * Anlagenbetreibers, niemals Programmcode.
 */
import type { LogikSeite } from "@fachwerk/schema";
import type { Tabelle, Zeile } from "./sql-dump.ts";
import { slug } from "./konvertiere.ts";
import { befehlDef, type BefehlKategorie } from "./befehle-katalog.ts";

function zahl(z: Zeile, k: string): number {
  const v = z[k];
  return typeof v === "number" ? v : Number(v ?? 0);
}
function text(z: Zeile, k: string): string {
  const v = z[k];
  return v === null || v === undefined ? "" : String(v);
}

/** Kantenquelle: KO / anderer Element-Ausgang / statischer Wert. */
export type Quelle =
  | { art: "ko"; koId: number }
  | { art: "port"; elementId: number; ausgang: number }
  | { art: "wert"; wert: string };

export interface RohKante {
  elementId: number; // Ziel-Element
  eingang: number; // Ziel-Eingang (1-basiert)
  quelle: Quelle;
}

/** Ein Ausgangsbox-Befehl (aus editLogicCmdList). */
export interface RohBefehl {
  cmd: number;
  id1: number;
  id2: number;
  wert1: string;
}

export interface RohElement {
  id: number;
  functionId: number;
  name: string;
  /** Nur bei Ausgangsboxen: die Befehlsliste (Ziel-KOs etc.). */
  befehle: RohBefehl[];
}

export interface RohSeite {
  id: number;
  name: string;
  elemente: RohElement[];
  kanten: RohKante[];
}

/** Struktur-Extraktion: Altsystem-Tabellen → Seiten mit Elementen und Kanten. */
export function extrahiereStruktur(tabellen: Map<string, Tabelle>): RohSeite[] {
  const zeilen = (n: string): Zeile[] => tabellen.get(n)?.zeilen ?? [];

  const seiten = new Map<number, RohSeite>();
  for (const p of zeilen("editLogicPage")) {
    seiten.set(zahl(p, "id"), {
      id: zahl(p, "id"),
      name: text(p, "name") || `seite_${zahl(p, "id")}`,
      elemente: [],
      kanten: [],
    });
  }
  // Ausgangsbox-Befehle je Element (targetid → Befehle).
  const befehle = new Map<number, RohBefehl[]>();
  for (const c of zeilen("editLogicCmdList")) {
    const tid = zahl(c, "targetid");
    const liste = befehle.get(tid) ?? [];
    liste.push({
      cmd: zahl(c, "cmd"),
      id1: zahl(c, "cmdid1"),
      id2: zahl(c, "cmdid2"),
      wert1: text(c, "cmdvalue1"),
    });
    befehle.set(tid, liste);
  }

  const elementSeite = new Map<number, number>();
  for (const e of zeilen("editLogicElement")) {
    const seite = seiten.get(zahl(e, "pageid"));
    if (!seite) continue;
    const id = zahl(e, "id");
    seite.elemente.push({
      id,
      functionId: zahl(e, "functionid"),
      name: text(e, "name"),
      befehle: befehle.get(id) ?? [],
    });
    elementSeite.set(id, zahl(e, "pageid"));
  }
  for (const l of zeilen("editLogicLink")) {
    const pid = elementSeite.get(zahl(l, "elementid"));
    if (pid === undefined) continue;
    const linktyp = zahl(l, "linktyp");
    let quelle: Quelle;
    if (linktyp === 0) quelle = { art: "ko", koId: zahl(l, "linkid") };
    else if (linktyp === 1)
      quelle = { art: "port", elementId: zahl(l, "linkid"), ausgang: zahl(l, "ausgang") };
    else quelle = { art: "wert", wert: text(l, "value") };
    seiten.get(pid)!.kanten.push({
      elementId: zahl(l, "elementid"),
      eingang: zahl(l, "eingang"),
      quelle,
    });
  }
  return [...seiten.values()];
}

// ---- Baustein-Abbildung (nur eindeutige Fälle) -------------------------------

export interface BausteinAbbildung {
  typ: string;
  /** Eingang-Index (1-basiert) → Fachwerk-Portname. */
  eingaenge: Record<number, string>;
  /** Ausgang-Index (1-basiert) → Fachwerk-Portname. */
  ausgaenge: Record<number, string>;
  /** Statischer Eingang, der zu einem Parameter wird: Index → Parametername. */
  parameterAusEingang?: Record<number, string>;
}

/**
 * Abbildungstabelle Altsystem-FunctionId → Fachwerk-Baustein. Bewusst nur die
 * verhaltensgleichen Standardbausteine. Ausgangsbox und SendByChange werden
 * separat aufgelöst (Kanten/Datenpunkt-Schreiben), nicht als Baustein.
 */
export const ABBILDUNG: Record<number, BausteinAbbildung> = {
  13000031: { typ: "NOT", eingaenge: { 1: "in" }, ausgaenge: { 1: "out" } },
  14000023: { typ: "OR", eingaenge: { 1: "a", 2: "b" }, ausgaenge: { 1: "out" } },
  14000025: {
    typ: "OR8",
    eingaenge: { 1: "e1", 2: "e2", 3: "e3", 4: "e4", 5: "e5", 6: "e6", 7: "e7", 8: "e8" },
    ausgaenge: { 1: "out" },
  },
  15000040: {
    typ: "VERGLEICH",
    eingaenge: { 1: "a", 2: "b" },
    ausgaenge: { 1: "out" },
  },
  16000112: {
    typ: "VERZOEGERUNG",
    eingaenge: { 1: "in" },
    ausgaenge: { 1: "out" },
    parameterAusEingang: { 2: "ms" },
  },
};

/** FunctionIds, die als „Ausgangsbox" gelten (schreiben auf KO). */
export const AUSGANGSBOX = new Set([12000010, 12000011, 12000012]);
/** SendByChange: reicht Eingang durch (on-change) — in Fachwerk eine Kante. */
export const SENDBYCHANGE = 13000030;

export interface SeitenReport {
  seite: string;
  elemente: number;
  abbildbar: number;
  ausgangsboxen: number;
  offeneFunctionIds: Array<{ functionId: number; anzahl: number }>;
  vollstaendig: boolean;
}

export interface LogikReport {
  seiten: SeitenReport[];
  /** Global: unabgebildete LBS über alle Seiten (Portierungs-Prioritäten). */
  offen: Array<{ functionId: number; anzahl: number }>;
}

/** Bewertet Konvertierbarkeit je Seite, ohne zu konvertieren. */
export function bewerte(seiten: RohSeite[]): LogikReport {
  const globalOffen = new Map<number, number>();
  const seitenReports: SeitenReport[] = [];

  for (const seite of seiten) {
    const offen = new Map<number, number>();
    let abbildbar = 0;
    let boxen = 0;
    for (const el of seite.elemente) {
      if (AUSGANGSBOX.has(el.functionId)) {
        boxen++;
      } else if (el.functionId === SENDBYCHANGE || ABBILDUNG[el.functionId]) {
        abbildbar++;
      } else {
        offen.set(el.functionId, (offen.get(el.functionId) ?? 0) + 1);
        globalOffen.set(el.functionId, (globalOffen.get(el.functionId) ?? 0) + 1);
      }
    }
    seitenReports.push({
      seite: seite.name,
      elemente: seite.elemente.length,
      abbildbar: abbildbar + boxen,
      ausgangsboxen: boxen,
      offeneFunctionIds: [...offen.entries()]
        .map(([functionId, anzahl]) => ({ functionId, anzahl }))
        .sort((a, b) => b.anzahl - a.anzahl),
      vollstaendig: offen.size === 0,
    });
  }

  return {
    seiten: seitenReports.sort((a, b) => a.offeneFunctionIds.length - b.offeneFunctionIds.length),
    offen: [...globalOffen.entries()]
      .map(([functionId, anzahl]) => ({ functionId, anzahl }))
      .sort((a, b) => b.anzahl - a.anzahl),
  };
}

/** Zählt alle Ausgangsbox-Befehle über alle Seiten nach Fachwerk-Kategorie. */
export function befehlsStatistik(seiten: RohSeite[]): {
  proKategorie: Array<{ kategorie: BefehlKategorie | "unbekannt"; anzahl: number }>;
  gesamt: number;
} {
  const zaehler = new Map<BefehlKategorie | "unbekannt", number>();
  let gesamt = 0;
  for (const seite of seiten) {
    for (const el of seite.elemente) {
      if (!AUSGANGSBOX.has(el.functionId)) continue;
      for (const bf of el.befehle) {
        const kat = befehlDef(bf.cmd)?.kategorie ?? "unbekannt";
        zaehler.set(kat, (zaehler.get(kat) ?? 0) + 1);
        gesamt++;
      }
    }
  }
  return {
    proKategorie: [...zaehler.entries()]
      .map(([kategorie, anzahl]) => ({ kategorie, anzahl }))
      .sort((a, b) => b.anzahl - a.anzahl),
    gesamt,
  };
}

// ---- Konvertierung einer vollständig abbildbaren Seite ------------------------

export interface KonvertierungsFehler {
  seite: string;
  meldung: string;
}

export interface SeitenKonvertierung {
  seiteSlug: string;
  logik: LogikSeite;
}

/** Fachwerk-Knoten-Id eines Elements. */
const knotenId = (elementId: number): string => `e${elementId}`;

/**
 * Konvertiert EINE Seite, sofern jedes Element abbildbar ist. SendByChange
 * wird zur Kante kollabiert (Quelle wandert an den Verbraucher), Ausgangsbox
 * wird zum Schreiben auf einen Datenpunkt. Gibt null + Grund zurück, wenn die
 * Seite (noch) nicht vollständig abbildbar ist.
 */
export function konvertiereSeite(
  seite: RohSeite,
  koZuSchluessel: Map<number, string>,
): { ergebnis: SeitenKonvertierung | null; fehler: KonvertierungsFehler[] } {
  const fehler: KonvertierungsFehler[] = [];
  const meld = (m: string): void => void fehler.push({ seite: seite.name, meldung: m });

  const byId = new Map(seite.elemente.map((e) => [e.id, e]));

  // SendByChange-Ausgänge auf ihre Quelle zurückführen (Kollaps).
  const sendByChange = new Set(
    seite.elemente.filter((e) => e.functionId === SENDBYCHANGE).map((e) => e.id),
  );
  const sbcQuelle = new Map<number, Quelle>();
  for (const k of seite.kanten) {
    if (sendByChange.has(k.elementId) && k.eingang === 1) sbcQuelle.set(k.elementId, k.quelle);
  }

  /** Löst eine Quelle auf, kollabiert SendByChange-Ketten. */
  function aufloesen(q: Quelle, tiefe = 0): Quelle | null {
    if (tiefe > 20) return null;
    if (q.art === "port" && sendByChange.has(q.elementId)) {
      const weiter = sbcQuelle.get(q.elementId);
      return weiter ? aufloesen(weiter, tiefe + 1) : null;
    }
    return q;
  }

  /** Quelle → Fachwerk-Endpunkt (dp:… oder knoten.port). */
  function endpunkt(q: Quelle): string | null {
    if (q.art === "ko") {
      const s = koZuSchluessel.get(q.koId);
      if (!s) {
        meld(`KO ${q.koId} ohne Datenpunkt-Zuordnung`);
        return null;
      }
      return `dp:${s}`;
    }
    if (q.art === "port") {
      const ziel = byId.get(q.elementId);
      if (!ziel) return null;
      const abb = ABBILDUNG[ziel.functionId];
      const port = abb?.ausgaenge[q.ausgang];
      if (!port) {
        meld(`Element ${q.elementId} Ausgang ${q.ausgang} nicht abbildbar`);
        return null;
      }
      return `${knotenId(q.elementId)}.${port}`;
    }
    return null; // statischer Wert ist kein Endpunkt
  }

  const knoten: LogikSeite["knoten"] = {};
  const kanten: LogikSeite["kanten"] = [];

  for (const el of seite.elemente) {
    if (el.functionId === SENDBYCHANGE || AUSGANGSBOX.has(el.functionId)) continue; // separat
    const abb = ABBILDUNG[el.functionId];
    if (!abb) {
      meld(`Element ${el.id}: LBS ${el.functionId} nicht abbildbar`);
      continue;
    }
    const parameter: Record<string, unknown> = {};
    for (const k of seite.kanten) {
      if (k.elementId !== el.id) continue;
      const pName = abb.parameterAusEingang?.[k.eingang];
      if (pName && k.quelle.art === "wert") {
        const n = Number(k.quelle.wert);
        parameter[pName] = Number.isFinite(n) ? n : k.quelle.wert;
      }
    }
    knoten[knotenId(el.id)] = {
      baustein: abb.typ,
      ...(Object.keys(parameter).length > 0 ? { parameter } : {}),
    };
  }

  // Kanten der abgebildeten Knoten (Eingänge, außer Parameter-Eingänge).
  for (const el of seite.elemente) {
    const abb = ABBILDUNG[el.functionId];
    if (!abb) continue;
    for (const k of seite.kanten) {
      if (k.elementId !== el.id) continue;
      if (abb.parameterAusEingang?.[k.eingang]) continue; // ist Parameter
      const port = abb.eingaenge[k.eingang];
      if (!port) continue;
      const q = aufloesen(k.quelle);
      if (!q || q.art === "wert") continue;
      const von = endpunkt(q);
      if (von) kanten.push({ von, nach: `${knotenId(el.id)}.${port}` });
    }
  }

  // Ausgangsbox → Befehle ausführen (Ziel-KO steckt in editLogicCmdList).
  //   cmd 1  = Eingangswert auf KO cmdid1 schreiben  (Hauptfall)
  //   cmd 2  = festen Wert cmdvalue1 auf KO cmdid1 schreiben
  //   cmd 13 = Datenarchiv (SPEC-004, noch nicht) → Report
  //   sonst  = seltener Spezialbefehl → Report
  for (const box of seite.elemente.filter((e) => AUSGANGSBOX.has(e.functionId))) {
    // Wertquelle = der verbundene (nicht-statische) Box-Eingang.
    const wertKante = seite.kanten.find(
      (k) => k.elementId === box.id && k.quelle.art !== "wert",
    );
    const wertVon = wertKante ? endpunkt(aufloesen(wertKante.quelle) ?? wertKante.quelle) : null;

    if (box.befehle.length === 0) {
      meld(`Ausgangsbox ${box.id}: keine Befehle`);
      continue;
    }
    for (const bf of box.befehle) {
      if (bf.cmd === 1) {
        // Eingangswert auf KO zuweisen → direkt als Datenpunkt-Schreiben.
        const schluessel = koZuSchluessel.get(bf.id1);
        if (!schluessel) {
          meld(`Ausgangsbox ${box.id}: Ziel-KO ${bf.id1} ohne Datenpunkt`);
          continue;
        }
        if (!wertVon) {
          meld(`Ausgangsbox ${box.id}: keine Wertquelle für „zuweisen"`);
          continue;
        }
        kanten.push({ von: wertVon, nach: `dp:${schluessel}` });
      } else {
        const def = befehlDef(bf.cmd);
        const bez = def ? `${def.name} (${def.kategorie})` : `Befehlstyp ${bf.cmd}`;
        meld(`Ausgangsbox ${box.id}: ${bez} noch nicht abgebildet — übersprungen`);
      }
    }
  }

  if (fehler.length > 0) return { ergebnis: null, fehler };
  if (Object.keys(knoten).length === 0 && kanten.length === 0) {
    return { ergebnis: null, fehler: [{ seite: seite.name, meldung: "leer" }] };
  }
  return {
    ergebnis: {
      seiteSlug: slug(seite.name),
      logik: { notizen: `Import aus „${seite.name}" (Stufe 2, Entwurf)`, knoten, kanten },
    },
    fehler: [],
  };
}

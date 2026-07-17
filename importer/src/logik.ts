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
import type { Datenpunkt, LogikSeite } from "@fachwerk/schema";
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
  /** Feste Parameter (z. B. der Operator einer Vergleicher-Variante). */
  festeParameter?: Record<string, unknown>;
  /**
   * Konfig-variabler Baustein (ADR-0012): statische Eingänge ab diesem Index
   * werden zu Einträgen der `felder`-Liste (name `wert{n}`, pfad = Wert) statt
   * zu je einem festen Port. So wird der EDOMI-„N-fach"-Selektor zu N Feldern.
   */
  felderAusEingang?: number;
  /**
   * Konfig-variable Port-Anzahl (ADR-0012): Setzt den Parameter `anzahl` auf
   * die tatsächlich genutzte Port-Zahl (statt fixe „10-fach"). `richtung`
   * bestimmt, ob benutzte Eingänge (JOIN) oder Ausgänge (SPLIT) gezählt werden;
   * nur Ports im Bereich [1, max] zählen (z. B. ohne Trigger/Separator/Rest).
   */
  anzahlAusPorts?: { richtung: "eingang" | "ausgang"; max: number };
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
    festeParameter: { op: "==" }, // A=B
  },
  15000041: {
    typ: "VERGLEICH",
    eingaenge: { 1: "a", 2: "b" },
    ausgaenge: { 1: "out" },
    festeParameter: { op: "!=" }, // A≠B
  },
  15000042: {
    typ: "VERGLEICH",
    eingaenge: { 1: "a", 2: "b" },
    ausgaenge: { 1: "out" },
    festeParameter: { op: ">" }, // A>B
  },
  15000043: {
    typ: "VERGLEICH",
    eingaenge: { 1: "a", 2: "b" },
    ausgaenge: { 1: "out" },
    festeParameter: { op: "<" }, // A<B
  },
  16000112: {
    typ: "VERZOEGERUNG",
    eingaenge: { 1: "in" },
    ausgaenge: { 1: "out" },
    parameterAusEingang: { 2: "ms" },
  },
  13000022: {
    typ: "WERTAUSLOESER",
    eingaenge: { 1: "trigger", 2: "wert" },
    ausgaenge: { 1: "out" },
  },
  16000110: {
    typ: "IMPULS",
    eingaenge: { 1: "trigger" },
    ausgaenge: { 1: "out" },
    parameterAusEingang: { 2: "ms" },
  },
  15000052: { typ: "MULT", eingaenge: { 1: "a", 2: "b" }, ausgaenge: { 1: "out" } },
  13000011: { typ: "KLEMME", eingaenge: { 1: "in1", 2: "in2" }, ausgaenge: { 1: "out" } },
  19000119: {
    typ: "WENN_DANN_SONST",
    eingaenge: { 1: "eingang", 2: "op", 3: "vergleich", 4: "dann", 5: "sonst" },
    ausgaenge: { 1: "out" },
  },
  // JSON Extractor: 1 Dokument, N Selector-Pfade → N benannte Felder + Status
  // (konfig-variabel, ADR-0012). Selektoren (Eingang 2..11) werden zu `felder`.
  19001208: {
    typ: "EXTRACT",
    eingaenge: { 1: "text" },
    ausgaenge: {
      1: "status",
      2: "wert1", 3: "wert2", 4: "wert3", 5: "wert4", 6: "wert5",
      7: "wert6", 8: "wert7", 9: "wert8", 10: "wert9", 11: "wert10",
    },
    festeParameter: { format: "json" },
    felderAusEingang: 2,
  },
  // Auswahlschalter: Trigger wechselt Status — das ist TOGGLE (Flanke out2 entfällt).
  13000028: { typ: "TOGGLE", eingaenge: { 1: "in" }, ausgaenge: { 1: "out" } },
  // Wertauslöser plus: Trigger + Wert → E2 (verhaltensgleich zu WERTAUSLOESER).
  19000458: {
    typ: "WERTAUSLOESER",
    eingaenge: { 1: "trigger", 2: "wert" },
    ausgaenge: { 1: "out" },
  },
  // 8 Bit → Byte.
  15000070: {
    typ: "BITS_ZU_BYTE",
    eingaenge: { 1: "bit0", 2: "bit1", 3: "bit2", 4: "bit3", 5: "bit4", 6: "bit5", 7: "bit6", 8: "bit7" },
    ausgaenge: { 1: "out" },
  },
  // Vergleicher =[Konstante] 5-fach → VERGLEICH_LISTE (konfig-variabel).
  15000039: {
    typ: "VERGLEICH_LISTE",
    eingaenge: { 1: "in" },
    ausgaenge: { 1: "ne", 2: "eq1", 3: "eq2", 4: "eq3", 5: "eq4", 6: "eq5" },
    parameterAusEingang: { 2: "w1", 3: "w2", 4: "w3", 5: "w4", 6: "w5" },
    festeParameter: { anzahl: 5 },
  },
  // Wenn-Dann-Vergleich 10-fach → WENN_LISTE (konfig-variabel).
  19001480: {
    typ: "WENN_LISTE",
    eingaenge: {
      1: "in",
      2: "vergl1", 3: "wert1", 4: "vergl2", 5: "wert2", 6: "vergl3", 7: "wert3",
      8: "vergl4", 9: "wert4", 10: "vergl5", 11: "wert5", 12: "vergl6", 13: "wert6",
      14: "vergl7", 15: "wert7", 16: "vergl8", 17: "wert8", 18: "vergl9", 19: "wert9",
      20: "vergl10", 21: "wert10",
    },
    ausgaenge: { 1: "out" },
    parameterAusEingang: {
      2: "vergl1", 3: "wert1", 4: "vergl2", 5: "wert2", 6: "vergl3", 7: "wert3",
      8: "vergl4", 9: "wert4", 10: "vergl5", 11: "wert5", 12: "vergl6", 13: "wert6",
      14: "vergl7", 15: "wert7", 16: "vergl8", 17: "wert8", 18: "vergl9", 19: "wert9",
      20: "vergl10", 21: "wert10",
    },
    festeParameter: { anzahl: 10 },
  },
  // Ein-/Ausgangsmatrix 10-fach → MATRIX (konfig-variabel).
  14000100: {
    typ: "MATRIX",
    eingaenge: {
      1: "e1", 2: "e2", 3: "e3", 4: "e4", 5: "e5",
      6: "e6", 7: "e7", 8: "e8", 9: "e9", 10: "e10",
      11: "wahl_eingang", 12: "wahl_ausgang",
    },
    ausgaenge: {
      1: "a1", 2: "a2", 3: "a3", 4: "a4", 5: "a5",
      6: "a6", 7: "a7", 8: "a8", 9: "a9", 10: "a10",
    },
    parameterAusEingang: { 11: "wahl_eingang", 12: "wahl_ausgang" },
    festeParameter: { anzahl: 10 },
  },
  // Subtraktion A−B: schlicht eine feste Formel (ADR-0012-Geist: kein Extra-Baustein).
  15000051: {
    typ: "FORMEL",
    eingaenge: { 1: "a", 2: "b" },
    ausgaenge: { 1: "out" },
    festeParameter: { formel: "$a-$b" },
  },
  // Formelberechnung: Formel (statisch → Parameter) über $x,$a..$e.
  15000000: {
    typ: "FORMEL",
    eingaenge: { 3: "x", 4: "a", 5: "b", 6: "c", 7: "d", 8: "e" },
    ausgaenge: { 1: "out" }, // out2 (Fehler) nicht abgebildet
    parameterAusEingang: { 1: "formel" },
  },
  // Sperre „Entsperrt"-Variante: E1 Entsperrt (durchlassen bei true), E2 Wert.
  14000029: {
    typ: "SPERRE",
    eingaenge: { 1: "sperre", 2: "in" },
    ausgaenge: { 1: "out" }, // out2 nicht abgebildet
    festeParameter: { modus: "freigabe" },
  },
  // Zeitbereich: liegt Uhrzeit (System-KO) zwischen von und bis (inkl. Wrap)?
  19000068: {
    typ: "ZEITVERGLEICH",
    eingaenge: { 3: "von", 4: "bis", 5: "zeit" }, // Trigger/Debug entfallen
    ausgaenge: { 1: "out" },
  },
  // Zwei Uhrzeiten vergleichen (Δ-Ausgänge 1/2 sind nicht abbildbar → Report).
  19000152: {
    typ: "ZEITVERGLEICH_AB",
    eingaenge: { 1: "a", 2: "b" },
    ausgaenge: { 3: "eq", 4: "gt", 5: "lt" },
  },
  // Zeitformatierung/Addition: strftime-Muster, Modifikator = Sekunden-Offset.
  19000153: {
    typ: "ZEITFORMAT",
    eingaenge: { 1: "zeit", 6: "offset" }, // Locale/UTC/Trenner/LogLevel entfallen
    ausgaenge: { 1: "out" },
    parameterAusEingang: { 2: "format", 6: "offset" },
  },
  // String zerteilen: text (Eingang 1) → teil1..teilN + rest. Anzahl = genutzte
  // Ausgänge; Separator (Eingang 2) wird Parameter (konfig-variabel, ADR-0012).
  18000003: {
    typ: "SPLIT",
    eingaenge: { 1: "text" },
    ausgaenge: {
      1: "teil1", 2: "teil2", 3: "teil3", 4: "teil4", 5: "teil5",
      6: "teil6", 7: "teil7", 8: "teil8", 9: "teil9", 10: "teil10", 11: "rest",
    },
    parameterAusEingang: { 2: "separator" },
    anzahlAusPorts: { richtung: "ausgang", max: 10 },
  },
  // Strings verbinden: teil1..teilN (Eingang 1..10) → text. Anzahl = genutzte
  // Eingänge; Modus (12)/Separator (13) werden Parameter. Trigger (11) entfällt.
  18000001: {
    typ: "JOIN",
    eingaenge: {
      1: "teil1", 2: "teil2", 3: "teil3", 4: "teil4", 5: "teil5",
      6: "teil6", 7: "teil7", 8: "teil8", 9: "teil9", 10: "teil10",
    },
    ausgaenge: { 1: "text" },
    parameterAusEingang: { 12: "modus", 13: "separator" },
    anzahlAusPorts: { richtung: "eingang", max: 10 },
  },
};

/** FunctionIds, die als „Ausgangsbox" gelten (schreiben auf KO). */
export const AUSGANGSBOX = new Set([12000010, 12000011, 12000012]);
/**
 * SendByChange (normal + remanent): reicht Eingang bei Änderung durch — in
 * Fachwerk eingebaute on-change-Kanten-Semantik; Remanenz ist Datenpunkt-Sache.
 */
export const SENDBYCHANGE = new Set([13000030, 13000032]);
/**
 * Entfällt ersatzlos: KO-Initialisierung schreibt beim Start den Default-Wert
 * — das leistet in Fachwerk `initial` am Datenpunkt (SPEC-001) nativ.
 */
export const ENTFAELLT = new Set([12000100]);

/**
 * LBS, die in Fachwerk zu DATENPUNKTEN werden statt zu Bausteinen: der
 * MQTT-Subscribe-Client wird zum mqtt-Datenpunkt (Topic aus der Instanz-
 * Konfiguration); den Transport übernimmt der Core-Treiber (ADR-0007).
 * Broker-Verbindungsdaten kommen aus der Umgebung, nicht aus der Logik.
 */
export const DATENPUNKT_QUELLEN: Record<
  number,
  { topicAusEingang: number; wertAusgang: number; typ: "bool" | "zahl" | "text" }
> = {
  19001054: { topicAusEingang: 9, wertAusgang: 2, typ: "text" }, // MQTT Subscribe → Payload
};

/** Info über einen generierten Stub (Fremd-LBS, Verhalten = Portierungs-TODO). */
export interface StubInfo {
  functionId: number;
  name: string;
  eingaenge: number;
  ausgaenge: number;
}

export interface SeitenReport {
  seite: string;
  elemente: number;
  ausgangsboxen: number;
  /** Fremd-LBS auf dieser Seite, die als Stub importiert werden. */
  stubFunctionIds: Array<{ functionId: number; anzahl: number }>;
}

export interface LogikReport {
  seiten: SeitenReport[];
  /** Global: Fremd-LBS → Stub (Portierungs-TODO-Liste). */
  stubs: Array<{ functionId: number; anzahl: number }>;
}

/** Ist die FunctionId auf einem der bekannten Wege abbildbar (kein Stub)? */
function bekannt(functionId: number): boolean {
  return (
    AUSGANGSBOX.has(functionId) ||
    SENDBYCHANGE.has(functionId) ||
    ENTFAELLT.has(functionId) ||
    DATENPUNKT_QUELLEN[functionId] !== undefined ||
    ABBILDUNG[functionId] !== undefined
  );
}

/** Bewertet je Seite, was direkt abbildbar ist und was Stub wird. */
export function bewerte(seiten: RohSeite[]): LogikReport {
  const globalStubs = new Map<number, number>();
  const seitenReports: SeitenReport[] = [];

  for (const seite of seiten) {
    const stubs = new Map<number, number>();
    let boxen = 0;
    for (const el of seite.elemente) {
      if (AUSGANGSBOX.has(el.functionId)) boxen++;
      else if (!bekannt(el.functionId)) {
        stubs.set(el.functionId, (stubs.get(el.functionId) ?? 0) + 1);
        globalStubs.set(el.functionId, (globalStubs.get(el.functionId) ?? 0) + 1);
      }
    }
    seitenReports.push({
      seite: seite.name,
      elemente: seite.elemente.length,
      ausgangsboxen: boxen,
      stubFunctionIds: [...stubs.entries()]
        .map(([functionId, anzahl]) => ({ functionId, anzahl }))
        .sort((a, b) => b.anzahl - a.anzahl),
    });
  }

  return {
    seiten: seitenReports.sort((a, b) => a.stubFunctionIds.length - b.stubFunctionIds.length),
    stubs: [...globalStubs.entries()]
      .map(([functionId, anzahl]) => ({ functionId, anzahl }))
      .sort((a, b) => b.anzahl - a.anzahl),
  };
}

/** Portzahlen + Name je LBS-Definition (für Stub-Manifeste) — nur Metadaten. */
export function defInfos(
  tabellen: Map<string, Tabelle>,
): Map<number, { name: string; eingaenge: number; ausgaenge: number }> {
  const infos = new Map<number, { name: string; eingaenge: number; ausgaenge: number }>();
  for (const z_ of tabellen.get("editLogicElementDef")?.zeilen ?? []) {
    infos.set(zahl(z_, "id"), {
      name: text(z_, "name") || text(z_, "title") || `LBS ${zahl(z_, "id")}`,
      eingaenge: 0,
      ausgaenge: 0,
    });
  }
  for (const z_ of tabellen.get("editLogicElementDefIn")?.zeilen ?? []) {
    const info = infos.get(zahl(z_, "targetid"));
    if (info) info.eingaenge = Math.max(info.eingaenge, zahl(z_, "id"));
  }
  for (const z_ of tabellen.get("editLogicElementDefOut")?.zeilen ?? []) {
    const info = infos.get(zahl(z_, "targetid"));
    if (info) info.ausgaenge = Math.max(info.ausgaenge, zahl(z_, "id"));
  }
  return infos;
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

/**
 * Zyklen seitenlokal entschärfen (ADR-0005 E-6): Das Referenzsystem erlaubt
 * Rückkopplungen (sie laufen dort über den nächsten Ereignis-Zyklus). Fachwerk
 * verlangt einen expliziten Bruch — der Importer setzt eine VERZOEGERUNG mit
 * ms:0 in eine Zykluskante: gleiche Semantik („nächste Kaskade" via
 * Timer-Queue), statisch azyklisch. Gibt die Anzahl der Brüche zurück.
 */
export function entschaerfeZyklen(logik: LogikSeite): number {
  let brueche = 0;

  /** Findet eine Kante, die Teil eines Zyklus ist (DFS mit Rückkanten-Erkennung). */
  function findeZyklusKante(): LogikKanteRef | null {
    // Knoten-Adjazenz: direkt (Port→Port) und dp-vermittelt innerhalb der Seite.
    type Kante = { von: string; zu: string; ref: LogikKanteRef };
    const kantenListe: Kante[] = [];
    const dpSchreiber = new Map<string, Array<{ knoten: string; ref: LogikKanteRef }>>();
    const dpLeser = new Map<string, string[]>();
    for (const k of logik.kanten) {
      const vonDp = k.von.startsWith("dp:");
      const nachDp = k.nach.startsWith("dp:");
      const vonKnoten = vonDp ? null : k.von.split(".")[0]!;
      const nachKnoten = nachDp ? null : k.nach.split(".")[0]!;
      if (vonKnoten && nachKnoten) kantenListe.push({ von: vonKnoten, zu: nachKnoten, ref: k });
      if (vonKnoten && nachDp) {
        const liste = dpSchreiber.get(k.nach) ?? [];
        liste.push({ knoten: vonKnoten, ref: k });
        dpSchreiber.set(k.nach, liste);
      }
      if (vonDp && nachKnoten) {
        const liste = dpLeser.get(k.von) ?? [];
        liste.push(nachKnoten);
        dpLeser.set(k.von, liste);
      }
    }
    // dp-vermittelt: Schreiber → Leser; Bruchstelle ist die SCHREIB-Kante.
    for (const [dp, schreiber] of dpSchreiber) {
      for (const s of schreiber) {
        for (const leser of dpLeser.get(dp) ?? []) {
          kantenListe.push({ von: s.knoten, zu: leser, ref: s.ref });
        }
      }
    }
    const nachfolger = new Map<string, Kante[]>();
    for (const k of kantenListe) {
      const liste = nachfolger.get(k.von) ?? [];
      liste.push(k);
      nachfolger.set(k.von, liste);
    }
    const status = new Map<string, "offen" | "fertig">();
    let gefunden: LogikKanteRef | null = null;
    function dfs(knoten: string): void {
      if (gefunden) return;
      status.set(knoten, "offen");
      for (const k of nachfolger.get(knoten) ?? []) {
        if (gefunden) return;
        const s = status.get(k.zu);
        if (s === "offen") {
          gefunden = k.ref; // Rückkante = Teil eines Zyklus
          return;
        }
        if (s === undefined) dfs(k.zu);
      }
      status.set(knoten, "fertig");
    }
    for (const knoten of Object.keys(logik.knoten)) {
      if (!status.has(knoten)) dfs(knoten);
      if (gefunden) break;
    }
    return gefunden;
  }

  for (let i = 0; i < 25; i++) {
    const kante = findeZyklusKante();
    if (!kante) break;
    brueche++;
    const id = `zyklusbruch_${brueche}`;
    logik.knoten[id] = { baustein: "VERZOEGERUNG", parameter: { ms: 0 } };
    const nach = kante.nach;
    kante.nach = `${id}.in`;
    logik.kanten.push({ von: `${id}.out`, nach });
  }
  return brueche;
}

type LogikKanteRef = LogikSeite["kanten"][number];

// ---- Konvertierung einer vollständig abbildbaren Seite ------------------------

export interface KonvertierungsFehler {
  seite: string;
  meldung: string;
}

export interface SeitenKonvertierung {
  seiteSlug: string;
  logik: LogikSeite;
  /** Aus LBS-Instanzen erzeugte Datenpunkte (z. B. MQTT-Topics). */
  neueDatenpunkte: Map<string, Record<string, Datenpunkt>>;
  /** Auf dieser Seite verwendete Stubs (Fremd-LBS, Portierungs-TODO). */
  stubs: StubInfo[];
}

/** Fachwerk-Knoten-Id eines Elements. */
const knotenId = (elementId: number): string => `e${elementId}`;

/**
 * Konvertiert EINE Seite. SendByChange wird zur Kante kollabiert, Ausgangsbox
 * zum Datenpunkt-Schreiben, MQTT-Subscribe-LBS zum mqtt-Datenpunkt; Fremd-LBS
 * werden als STUB importiert (Struktur + Ports, Verhalten = Portierungs-TODO —
 * Clean-Room: nur Metadaten, nie Code). Gibt null + Grund nur bei echten
 * Fehlern zurück (fehlendes Topic, kaputte Referenz).
 */
export function konvertiereSeite(
  seite: RohSeite,
  koZuSchluessel: Map<number, string>,
  defs?: Map<number, { name: string; eingaenge: number; ausgaenge: number }>,
): {
  ergebnis: SeitenKonvertierung | null;
  fehler: KonvertierungsFehler[];
  /** Nicht blockierend: übersprungene Befehle/Ausgänge (andere Subsysteme). */
  hinweise: KonvertierungsFehler[];
} {
  const fehler: KonvertierungsFehler[] = [];
  const hinweise: KonvertierungsFehler[] = [];
  const meld = (m: string): void => void fehler.push({ seite: seite.name, meldung: m });
  const hinweis = (m: string): void => void hinweise.push({ seite: seite.name, meldung: m });

  const byId = new Map(seite.elemente.map((e) => [e.id, e]));
  const neueDatenpunkte = new Map<string, Record<string, Datenpunkt>>();
  const stubs = new Map<number, StubInfo>();

  // ---- Datenpunkt-Quellen (MQTT-Subscribe → mqtt-Datenpunkt) ----------------
  const dpQuelle = new Map<number, { schluessel: string; wertAusgang: number }>();
  for (const el of seite.elemente) {
    const q = DATENPUNKT_QUELLEN[el.functionId];
    if (!q) continue;
    const topicKante = seite.kanten.find(
      (k) => k.elementId === el.id && k.eingang === q.topicAusEingang,
    );
    if (!topicKante || topicKante.quelle.art !== "wert" || topicKante.quelle.wert === "") {
      // Topic dynamisch/fehlend: als Stub importieren statt Seite zu blockieren.
      hinweis(`Element ${el.id}: Topic nicht statisch — wird Stub statt Datenpunkt`);
      continue;
    }
    const topic = topicKante.quelle.wert;
    const key = slug(topic);
    const datei = neueDatenpunkte.get("mqtt") ?? {};
    datei[key] = { name: topic, klasse: "bus", typ: q.typ, treiber: "mqtt", adresse: topic };
    neueDatenpunkte.set("mqtt", datei);
    dpQuelle.set(el.id, { schluessel: `mqtt.${key}`, wertAusgang: q.wertAusgang });
  }

  // ---- Stubs (Fremd-LBS) -----------------------------------------------------
  /** Generische Stub-Ports: max aus Definition und tatsächlicher Nutzung. */
  function stubFuer(el: RohElement): StubInfo {
    let info = stubs.get(el.functionId);
    if (info) return info;
    const def = defs?.get(el.functionId);
    let maxIn = def?.eingaenge ?? 0;
    let maxOut = def?.ausgaenge ?? 0;
    for (const k of seite.kanten) {
      if (k.elementId === el.id) maxIn = Math.max(maxIn, k.eingang);
      if (k.quelle.art === "port" && k.quelle.elementId === el.id) {
        maxOut = Math.max(maxOut, k.quelle.ausgang);
      }
    }
    info = {
      functionId: el.functionId,
      name: def?.name ?? `LBS ${el.functionId}`,
      eingaenge: Math.max(1, maxIn),
      ausgaenge: Math.max(1, maxOut),
    };
    stubs.set(el.functionId, info);
    return info;
  }
  /** Stub: unbekannte LBS ODER Datenpunkt-Quelle ohne statisches Topic. */
  const istStub = (el: RohElement): boolean =>
    !bekannt(el.functionId) ||
    (DATENPUNKT_QUELLEN[el.functionId] !== undefined && !dpQuelle.has(el.id));

  // SendByChange-Ausgänge auf ihre Quelle zurückführen (Kollaps).
  const sendByChange = new Set(
    seite.elemente.filter((e) => SENDBYCHANGE.has(e.functionId)).map((e) => e.id),
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
      // Datenpunkt-Quelle (MQTT): der Wert-Ausgang IST der Datenpunkt.
      const quelle = dpQuelle.get(q.elementId);
      if (quelle) {
        if (q.ausgang === quelle.wertAusgang) return `dp:${quelle.schluessel}`;
        hinweis(
          `Element ${q.elementId}: Nebenausgang ${q.ausgang} der Datenpunkt-Quelle entfällt`,
        );
        return null;
      }
      // Stub: generische Ports a1..aN.
      if (istStub(ziel)) {
        stubFuer(ziel);
        return `${knotenId(q.elementId)}.a${q.ausgang}`;
      }
      const abb = ABBILDUNG[ziel.functionId];
      const port = abb?.ausgaenge[q.ausgang];
      if (!port) {
        // Neben-Ausgang ohne Fachwerk-Pendant: Kante entfällt mit Notiz.
        hinweis(`Element ${q.elementId} (${abb?.typ ?? ziel.functionId}): Ausgang ${q.ausgang} entfällt`);
        return null;
      }
      return `${knotenId(q.elementId)}.${port}`;
    }
    return null; // statischer Wert ist kein Endpunkt
  }

  const knoten: LogikSeite["knoten"] = {};
  const kanten: LogikSeite["kanten"] = [];

  for (const el of seite.elemente) {
    if (
      SENDBYCHANGE.has(el.functionId) ||
      AUSGANGSBOX.has(el.functionId) ||
      ENTFAELLT.has(el.functionId) || // KO-Init: durch dp.initial abgedeckt
      dpQuelle.has(el.id) // Datenpunkt-Quelle: wird Datenpunkt, kein Knoten
    ) {
      continue; // separat bzw. entfällt
    }
    // Fremd-LBS → Stub-Knoten (generische Ports; Verhalten = Portierungs-TODO).
    if (istStub(el)) {
      stubFuer(el);
      knoten[knotenId(el.id)] = { baustein: `lbs${el.functionId}` };
      continue;
    }
    const abb = ABBILDUNG[el.functionId];
    if (!abb) {
      meld(`Element ${el.id}: LBS ${el.functionId} nicht abbildbar`);
      continue;
    }
    const parameter: Record<string, unknown> = { ...abb.festeParameter };
    for (const k of seite.kanten) {
      if (k.elementId !== el.id) continue;
      const pName = abb.parameterAusEingang?.[k.eingang];
      if (pName && k.quelle.art === "wert") {
        const n = Number(k.quelle.wert);
        parameter[pName] = Number.isFinite(n) ? n : k.quelle.wert;
      }
    }
    // Konfig-variabel: Port-Anzahl aus tatsächlich benutzten Ports ableiten.
    if (abb.anzahlAusPorts) {
      const { richtung, max } = abb.anzahlAusPorts;
      let genutzt = 0;
      if (richtung === "eingang") {
        for (const k of seite.kanten) {
          if (k.elementId === el.id && k.eingang >= 1 && k.eingang <= max) {
            genutzt = Math.max(genutzt, k.eingang);
          }
        }
      } else {
        for (const k of seite.kanten) {
          if (
            k.quelle.art === "port" &&
            k.quelle.elementId === el.id &&
            k.quelle.ausgang >= 1 &&
            k.quelle.ausgang <= max
          ) {
            genutzt = Math.max(genutzt, k.quelle.ausgang);
          }
        }
      }
      if (genutzt > 0) parameter["anzahl"] = genutzt;
    }
    // Konfig-variabel: statische Eingänge ab felderAusEingang → felder-Liste.
    // Selektor-Trenner des Referenzsystems ist „|" (intent|intentName) —
    // Fachwerk-EXTRACT nutzt Punktpfade (intent.intentName).
    if (abb.felderAusEingang !== undefined) {
      const felder: Array<{ name: string; pfad: string }> = [];
      for (const k of seite.kanten) {
        if (k.elementId !== el.id || k.eingang < abb.felderAusEingang) continue;
        if (k.quelle.art === "wert" && k.quelle.wert !== "") {
          felder.push({
            name: `wert${k.eingang - abb.felderAusEingang + 1}`,
            pfad: k.quelle.wert.replaceAll("|", "."),
          });
        }
      }
      if (felder.length > 0) parameter["felder"] = felder;
    }
    knoten[knotenId(el.id)] = {
      baustein: abb.typ,
      ...(Object.keys(parameter).length > 0 ? { parameter } : {}),
    };
  }

  // Kanten der abgebildeten Knoten (Eingänge, außer Parameter-Eingänge).
  for (const el of seite.elemente) {
    const stub = istStub(el);
    const abb = ABBILDUNG[el.functionId];
    if (!abb && !stub) continue;
    for (const k of seite.kanten) {
      if (k.elementId !== el.id) continue;
      // Statischer Wert an einem Parameter-Eingang wurde bereits Parameter;
      // ein dynamisch gespeister Eingang wird trotzdem verkabelt.
      if (abb?.parameterAusEingang?.[k.eingang] && k.quelle.art === "wert") continue;
      const port = stub ? `e${k.eingang}` : abb!.eingaenge[k.eingang];
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
      // Box ohne Befehle tut nichts (unfertig konfiguriert) — kein Blocker.
      hinweis(`Ausgangsbox ${box.id}: keine Befehle — entfällt`);
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
        if (wertVon.startsWith("dp:")) {
          // dp→dp ist verboten (ADR-0004: Baustein dazwischensetzen) —
          // der Importer setzt automatisch eine KOPIE ein.
          const kopieId = `kopie_${knotenId(box.id)}`;
          if (!knoten[kopieId]) {
            knoten[kopieId] = { baustein: "KOPIE" };
            kanten.push({ von: wertVon, nach: `${kopieId}.in` });
          }
          kanten.push({ von: `${kopieId}.out`, nach: `dp:${schluessel}` });
        } else {
          kanten.push({ von: wertVon, nach: `dp:${schluessel}` });
        }
      } else {
        // Andere Befehle gehören anderen Subsystemen (Archiv/Visu/Aktion) —
        // sie blockieren die Seite NICHT, sondern werden als Hinweis notiert.
        const def = befehlDef(bf.cmd);
        const bez = def ? `${def.name} (${def.kategorie})` : `Befehlstyp ${bf.cmd}`;
        hinweis(`Ausgangsbox ${box.id}: ${bez} — übersprungen`);
      }
    }
  }

  if (fehler.length > 0) return { ergebnis: null, fehler, hinweise };
  if (Object.keys(knoten).length === 0 && kanten.length === 0) {
    // Nichts Logisches übrig (z. B. reine Archiv-Seite) — kein Fehler.
    return { ergebnis: null, fehler: [], hinweise };
  }
  const stubListe = [...stubs.values()];
  const logikSeite: LogikSeite = { knoten, kanten };
  const brueche = entschaerfeZyklen(logikSeite);
  if (brueche > 0) {
    hinweis(`${brueche} Rückkopplung(en) mit VERZOEGERUNG ms:0 entschärft (E-6)`);
  }
  const notizen =
    `Import aus „${seite.name}" (Stufe 2, Entwurf)` +
    (stubListe.length > 0
      ? ` — enthält ${stubListe.length} Stub(s): ${stubListe.map((s) => s.name).join(", ")} (Portierungs-TODO)`
      : "") +
    (brueche > 0 ? ` — ${brueche} Zyklusbruch/-brüche (VERZOEGERUNG ms:0)` : "");
  return {
    ergebnis: {
      seiteSlug: slug(seite.name),
      logik: { notizen, knoten: logikSeite.knoten, kanten: logikSeite.kanten },
      neueDatenpunkte,
      stubs: stubListe,
    },
    fehler: [],
    hinweise,
  };
}

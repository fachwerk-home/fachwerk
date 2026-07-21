/**
 * Visu-Import (Import-Assistent, Stufe 3, P5-9): erzeugt aus dem Export der
 * editVisu*-Tabellen des Altsystems Fachwerk-Visuseiten im P5-6-Format.
 *
 * Clean-Room: gelesen werden ausschliesslich NUTZDATEN des Betreibers
 * (Seiten, Elementpositionen, KO-Rollen, Texte) — niemals Programmcode,
 * niemals Grafiken. Was nicht sicher abbildbar ist, wird NICHT geraten,
 * sondern als `label` mit Notiz importiert und im Bericht gezaehlt.
 *
 * Aufloesung der Datenpunkte (Auftrag F-1): ein Element verweist ueber
 * `gaid`/`gaid2`/`gaid3` auf einen KO-Eintrag der Visu-eigenen editKo-Tabelle;
 * dessen GA fuehrt ueber den injizierten `gaKey`-Index (aus den bereits
 * importierten Datenpunkten des Ziel-Gewerks) auf den Fachwerk-Schluessel.
 * Interne KOs ohne GA lassen sich so nicht aufloesen — sie landen ehrlich
 * im Bericht statt als geratene Bindung.
 */
import type {
  VisuAktion,
  VisuDesigns,
  VisuElement,
  VisuPreset,
  VisuSeite,
  VisuSeitenTyp,
} from "@fachwerk/schema";
import { slug } from "./konvertiere.ts";

/** Rohe Visu-Tabellen aus exportVisu.json (Werte, kein Code). */
export interface VisuExport {
  editVisuPage?: unknown;
  editVisuElement?: unknown;
  editVisuCmdList?: unknown;
  editKo?: unknown;
  [tabelle: string]: unknown;
}

/** GA-Schluessel (z. B. "1/3/21") -> Fachwerk-Datenpunkt-Schluessel. */
export type GaAufloesung = (ga: string) => string | undefined;

export interface VisuKonvertierErgebnis {
  seiten: Map<string, VisuSeite>;
  designs: VisuDesigns;
  bericht: VisuBericht;
}

export interface VisuBericht {
  visus: number;
  seiten: number;
  elemente: number;
  /** controltyp -> Anzahl (Grundlage fuer weiteres Mapping). */
  controltypVerteilung: Map<number, number>;
  /** Was NICHT abgebildet wurde: Grund -> Anzahl. */
  nichtAbgebildet: Map<string, number>;
  /** Bindungen, deren KO sich nicht auf einen Datenpunkt aufloesen liess. */
  unaufgeloesteBindungen: number;
  hinweise: string[];
}

// ---- kleine Helfer ---------------------------------------------------------

/** Export-Tabellen sind mal Array, mal id-indiziertes Objekt. */
function alsZeilen(o: unknown): Record<string, unknown>[] {
  if (Array.isArray(o)) return o as Record<string, unknown>[];
  if (o && typeof o === "object") return Object.values(o as Record<string, unknown>) as Record<string, unknown>[];
  return [];
}

function num(z: Record<string, unknown>, spalte: string): number {
  const v = z[spalte];
  return typeof v === "number" ? v : Number(v ?? 0) || 0;
}

function str(z: Record<string, unknown>, spalte: string): string {
  const v = z[spalte];
  return v === null || v === undefined ? "" : String(v);
}

/** Ein GA-belegtes KO oder undefined. */
function istGa(ga: string): boolean {
  return /^\d+\/\d+\/\d+$/.test(ga);
}

// ---- Konvertierung ---------------------------------------------------------

export function konvertiereVisu(
  visu: VisuExport,
  gaKey: GaAufloesung,
): VisuKonvertierErgebnis {
  const nichtAbgebildet = new Map<string, number>();
  const controltypVerteilung = new Map<number, number>();
  const hinweise: string[] = [];
  let unaufgeloesteBindungen = 0;
  const zaehle = (grund: string): void => {
    nichtAbgebildet.set(grund, (nichtAbgebildet.get(grund) ?? 0) + 1);
  };

  // KO-Id -> GA (aus der Visu-eigenen editKo-Tabelle).
  const koGa = new Map<number, string>();
  for (const ko of alsZeilen(visu.editKo)) koGa.set(num(ko, "id"), str(ko, "ga"));

  /** gaid (KO-Id) -> Datenpunkt-Schluessel, oder undefined (dann Bericht). */
  const aufloese = (koId: number): string | undefined => {
    if (koId === 0) return undefined;
    const ga = koGa.get(koId);
    if (ga === undefined) return undefined;
    if (!istGa(ga)) {
      // Internes KO ohne GA — ueber den GA-Index nicht aufloesbar.
      zaehle("Bindung auf internes KO (keine GA) nicht aufloesbar");
      unaufgeloesteBindungen++;
      return undefined;
    }
    const key = gaKey(ga);
    if (key === undefined) {
      zaehle("GA im Ziel-Gewerk nicht gefunden");
      unaufgeloesteBindungen++;
    }
    return key;
  };

  // Seiten: id -> {slug, typ, name}. Erst der Index, dann die Elemente —
  // Navigationsziele brauchen die Slugs anderer Seiten.
  const seitenRoh = alsZeilen(visu.editVisuPage);
  const visuIds = new Set<number>();
  const seiteInfo = new Map<number, { slug: string; typ: VisuSeitenTyp; name: string }>();
  const slugVergeben = new Set<string>();
  for (const p of seitenRoh) {
    const id = num(p, "id");
    visuIds.add(num(p, "visuid"));
    const name = str(p, "name") || `Seite ${id}`;
    let s = slug(name);
    while (slugVergeben.has(s)) s = `${s}_${id}`;
    slugVergeben.add(s);
    seiteInfo.set(id, { slug: s, typ: seitentyp(num(p, "pagetyp")), name });
  }

  // Elemente je Seite gruppieren.
  const elementeRoh = alsZeilen(visu.editVisuElement);
  const proSeite = new Map<number, Record<string, unknown>[]>();
  for (const e of elementeRoh) {
    const pid = num(e, "pageid");
    (proSeite.get(pid) ?? proSeite.set(pid, []).get(pid)!).push(e);
    controltypVerteilung.set(num(e, "controltyp"), (controltypVerteilung.get(num(e, "controltyp")) ?? 0) + 1);
  }

  // Befehle je Element (targetid -> Befehle).
  const cmdProElement = new Map<number, Record<string, unknown>[]>();
  for (const c of alsZeilen(visu.editVisuCmdList)) {
    const t = num(c, "targetid");
    (cmdProElement.get(t) ?? cmdProElement.set(t, []).get(t)!).push(c);
  }

  const seiten = new Map<string, VisuSeite>();
  let elementAnzahl = 0;

  for (const [pid, info] of seiteInfo) {
    const rohElemente = proSeite.get(pid) ?? [];
    const elemente: Record<string, VisuElement> = {};
    let maxX = 1;
    let maxY = 1;
    const elemSlugs = new Set<string>();

    const seitenNotizen: string[] = [];

    for (const e of rohElemente) {
      const id = num(e, "id");
      const x = num(e, "xpos");
      const y = num(e, "ypos");
      const w = num(e, "xsize");
      const h = num(e, "ysize");
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + h);

      const { element, notizen } = baueElement(
        e,
        aufloese,
        seiteInfo,
        cmdProElement.get(id) ?? [],
        zaehle,
      );

      const name = str(e, "name") || str(e, "text") || `element_${id}`;
      let key = slug(name);
      while (elemSlugs.has(key)) key = `${key}_${id}`;
      elemSlugs.add(key);
      elemente[key] = element;

      // Placement (einziger Breakpoint "panel"). w/h nur wenn > 0 (Schema).
      const panel: { x: number; y: number; w?: number; h?: number } = { x, y };
      if (w > 0) panel.w = w;
      if (h > 0) panel.h = h;
      element.placements = { panel };
      const z = num(e, "zindex");
      if (z > 0) element.ebene = z;
      // Element-Notizen sammeln sich seitenweit — das Schema kennt kein
      // Notizfeld je Element, aber eines je Seite.
      for (const n of notizen) seitenNotizen.push(`${key}: ${n}`);
      elementAnzahl++;
    }

    const seite: VisuSeite = {
      typ: info.typ,
      name: info.name,
      basis: "panel",
      groessen: { panel: { w: Math.ceil(maxX), h: Math.ceil(maxY) } },
      elemente,
    };
    if (seitenNotizen.length > 0) seite.notizen = seitenNotizen.join("\n");
    seiten.set(info.slug, seite);
  }

  return {
    seiten,
    designs: BASIS_DESIGNS,
    bericht: {
      visus: visuIds.size,
      seiten: seiten.size,
      elemente: elementAnzahl,
      controltypVerteilung,
      nichtAbgebildet,
      unaufgeloesteBindungen,
      hinweise,
    },
  };
}

/**
 * Ein einzelnes Element abbilden. Reihenfolge der Entscheidung:
 * Navigation (gotopageid) schlaegt den controltyp, weil sie das Verhalten
 * bestimmt; danach die bekannten controltyp-Familien; alles Uebrige wird
 * `label` mit Notiz — Struktur rein, Verhalten offen (Stub-Philosophie).
 */
function baueElement(
  e: Record<string, unknown>,
  aufloese: (koId: number) => string | undefined,
  seiteInfo: Map<number, { slug: string; typ: VisuSeitenTyp; name: string }>,
  cmds: Record<string, unknown>[],
  zaehle: (grund: string) => void,
): { element: VisuElement; notizen: string[] } {
  const controltyp = num(e, "controltyp");
  const text = str(e, "text");
  const gaid = num(e, "gaid");
  const bindungen: Record<string, string> = {};
  const aktionen: Record<string, VisuAktion> = {};
  const notizen: string[] = [];

  // Navigation: gotopageid / closepopupid.
  const ziel = num(e, "gotopageid");
  if (ziel !== 0) {
    const zielInfo = seiteInfo.get(ziel);
    if (zielInfo) {
      aktionen.kurz = zielInfo.typ === "popup" ? { popup: zielInfo.slug } : { seite: zielInfo.slug };
    } else {
      zaehle("Navigationsziel (gotopageid) unbekannt");
      notizen.push(`Navigationsziel ${ziel} nicht gefunden`);
    }
  }
  if (num(e, "closepopupid") !== 0 || str(e, "closepopup") === "1") {
    // Fuer "Popup schliessen" gibt es (noch) keine eigene Aktion im Schema.
    zaehle("closepopup ohne Ziel-Aktion im Schema");
    notizen.push("schliesst ein Popup — im Zielschema noch nicht abbildbar");
  }

  // Befehle (cmd 2 = setze auf ein KO). cmd 4/6 sind noch nicht katalogisiert.
  for (const c of cmds) {
    const cmd = num(c, "cmd");
    if (cmd === 2) {
      const key = aufloese(num(c, "cmdid1"));
      if (key) {
        bindungen.set = key;
        if (aktionen.kurz === undefined) aktionen.kurz = { setze: cmdWert(str(c, "cmdvalue1")) };
      }
    } else {
      zaehle(`Element-Befehl cmd ${cmd} nicht abgebildet`);
    }
  }

  // Rollen aus gaid: gaid = anzeigen/schalten, gaid2/gaid3 = Status (best effort).
  const statusKey = aufloese(gaid) ?? aufloese(num(e, "gaid2")) ?? aufloese(num(e, "gaid3"));

  let preset: VisuPreset;
  if (aktionen.kurz && (aktionen.kurz as { seite?: string; popup?: string }).seite !== undefined) {
    preset = "navigation";
  } else if (aktionen.kurz && (aktionen.kurz as { popup?: string }).popup !== undefined) {
    preset = "navigation";
  } else if (controltyp === 1004) {
    // KO mit Zustandstexten -> Schalter; die Werte-Zuordnung der Texte ist
    // ohne Doku nicht sicher und wird bewusst NICHT geraten (Notiz + Bericht).
    preset = "schalter";
    if (statusKey) {
      bindungen.status = statusKey;
      if (bindungen.set === undefined) bindungen.set = statusKey;
    }
    if (aktionen.kurz === undefined && bindungen.set) aktionen.kurz = { art: "umschalten" };
    const zustaende = text.split("\n").map((t) => t.trim()).filter(Boolean);
    if (zustaende.length > 0) {
      notizen.push(`Zustandstexte: ${zustaende.join(" / ")} — Werte-Zuordnung pruefen`);
      zaehle("Zustandstexte eines Schalters nicht als Format abgebildet");
    }
  } else if (controltyp === 1) {
    if (statusKey) {
      preset = "statusanzeige";
      bindungen.status = statusKey;
    } else {
      preset = "label";
      if (text) {
        // Statischer Text hat im Preset-Schema keinen Platz (kein Textfeld);
        // ehrlich als Notiz sichern statt zu erfinden.
        notizen.push(`Text "${text}" nicht uebernommen (Schema hat kein Textfeld fuer Presets)`);
        zaehle("statischer Text ohne Zielfeld");
      }
    }
  } else if (controltyp === 0) {
    // Rein grafisches Element (Hintergrund/Rahmen) — kein Fachwerk-Preset
    // trifft es; als leeres Label mit Notiz, damit die Flaeche erhalten bleibt.
    preset = "label";
    zaehle("controltyp 0 (Grafik/Hintergrund) als label uebernommen");
  } else {
    preset = "label";
    zaehle(`controltyp ${controltyp} unbekannt -> als label`);
    notizen.push(`controltyp ${controltyp} beim Import nicht erkannt`);
  }

  // Preset-Elemente duerfen laut Schema KEIN parameter tragen (das ist den
  // Widgets vorbehalten) — Text/Notizen wandern deshalb in seite.notizen.
  const element: VisuElement = { preset, design: "standard" };
  if (Object.keys(bindungen).length > 0) element.bindungen = bindungen;
  if (Object.keys(aktionen).length > 0) element.aktionen = aktionen;
  return { element, notizen };
}

/** cmdvalue-Text in bool/zahl/text (best effort — wie im Bus-Kontext). */
function cmdWert(roh: string): string | number | boolean {
  if (roh === "1") return true;
  if (roh === "0") return false;
  const n = Number(roh);
  return Number.isFinite(n) && roh.trim() !== "" ? n : roh;
}

/** pagetyp -> Fachwerk-Seitentyp. 0 = Seite, 2 = Include (Header/Overlay). */
function seitentyp(pagetyp: number): VisuSeitenTyp {
  if (pagetyp === 2) return "include";
  if (pagetyp === 1) return "popup";
  return "seite";
}

/**
 * Neutrale Basis-Designs. Das Design-System des Altsystems (Slot-Matrix
 * s1..s48, CSS-Farbverlaeufe) ist undokumentiert; es zu dekodieren waere
 * Raten. Deshalb ein schlichtes, lesbares Set — Farben bestaetigt der
 * Betreiber am Screenshot, nicht der Import.
 */
const BASIS_DESIGNS: VisuDesigns = {
  standard: { hintergrund: "#222", text: "#eee", rand: { staerke: 1, farbe: "#444" } },
  aktiv: { hintergrund: "#fc0", text: "#000" },
};

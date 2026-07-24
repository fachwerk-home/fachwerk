/**
 * Visu-Import (Import-Assistent, Stufe 3, P5-9): erzeugt aus dem Export der
 * editVisu*-Tabellen des Altsystems Fachwerk-Visuseiten im P5-6-Format.
 *
 * Das Mapping folgt der geprueften Interop-Spec (research/visu-format-spec.md):
 *   - gaid  (KO1) = Status/Wert/Sichtbarkeit
 *   - gaid2 (KO2) = wird bei Klick gesetzt
 *   - gaid3 (KO3) = steuert dynamische Designs
 *   - text        = Beschriftung ODER Symbol-Glyph (B-8: eigenes Textfeld)
 *   - controltyp 1 (Universalelement): var3/var4 = Klick-Aktion,
 *     var15/var16 = zu sendender KO2-Wert, var11 = Symbolposition
 *   - Design-Slots s1..s48 je styletyp (0 Basis, 1 dynamisch): s9 Hintergrund-
 *     farbe, s14 Schriftgroesse, s15 Textfarbe, s31 Rahmenbreite, s27 Rahmen-
 *     farbe, s23 Eckenradius, s8 Deckkraft.
 *
 * Clean-Room: gelesen werden ausschliesslich NUTZDATEN des Betreibers; die
 * Spec stammt aus der Dirty-Room-Analyse und wurde vom Betreiber geprueft.
 * Was Spec und Daten NICHT eindeutig hergeben, wird NICHT geraten, sondern als
 * label/Notiz importiert und im Bericht gezaehlt (Stub-Philosophie).
 */
import type {
  VisuAktion,
  VisuDesign,
  VisuDesigns,
  VisuElement,
  VisuPreset,
  VisuSeite,
  VisuSeitenTyp,
  VisuWidget,
} from "@fachwerk/schema";
import { slug } from "./konvertiere.ts";

export interface VisuExport {
  editVisuPage?: unknown;
  editVisuElement?: unknown;
  editVisuElementDesign?: unknown;
  editVisuCmdList?: unknown;
  editVisuBGcol?: unknown;
  editVisuFGcol?: unknown;
  editKo?: unknown;
  [tabelle: string]: unknown;
}

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
  /** controltyp -> Anzahl. */
  controltypVerteilung: Map<number, number>;
  /** Uebersprungene Gruppenknoten (controltyp 0). */
  gruppenknoten: number;
  /** Was NICHT (vollstaendig) abgebildet wurde: Grund -> Anzahl. */
  nichtAbgebildet: Map<string, number>;
  /** Bindungen, deren KO sich nicht auf einen Datenpunkt aufloesen liess. */
  unaufgeloesteBindungen: number;
  /**
   * Elementtypen, die NICHT vollstaendig abgebildet wurden — Grundlage des
   * Migrations-Reports. Custom-Elemente mit fertigem Katalogeintrag (z. B.
   * der Schiebeschalter 1004) stehen hier bewusst NICHT: sie sind erledigt.
   */
  fremdElemente: Array<{ controltyp: number; verwendungen: number; seiten: string[] }>;
  /** Symbol-Glyphen aus der Panel-Schrift: Codepoint (hex) -> Verwendungen. */
  glyphen: Array<{ codepoint: string; verwendungen: number }>;
  hinweise: string[];
}

// ---- kleine Helfer ---------------------------------------------------------

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

function istGa(ga: string): boolean {
  return /^\d+\/\d+\/\d+$/.test(ga);
}

/** cmdvalue/var-Wert in bool/zahl/text (best effort — wie im Bus-Kontext). */
function alsWert(roh: string): string | number | boolean {
  if (roh === "1") return true;
  if (roh === "0") return false;
  const n = Number(roh);
  return Number.isFinite(n) && roh.trim() !== "" ? n : roh;
}

/**
 * EDOMI-Text kann HTML-Entities fuer Symbol-Glyphen enthalten (`&#xe92d`).
 * Numerische Entities in echte Zeichen wandeln, damit ein Symbol-Font sie
 * rendert; benannte Entities (&amp; …) bleiben unangetastet (selten in Labels).
 */
function entschluessleText(t: string): string {
  return t.replace(/&#x([0-9a-fA-F]+);?/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_, dez) => String.fromCodePoint(Number(dez)));
}

// ---- Klick-Aktionen (Spec controltyp 1, var3) ------------------------------
// Bitmaske: 1=Seitensteuerung, 2=Befehle, 4=KO2 setzen (Werte 0..7). Die
// Seitensteuerung laeuft ueber gotopageid, die Befehle ueber editVisuCmdList.
const AKT_KO2 = 4;

/**
 * Elementtypen, fuer die es eine echte Fachwerk-Entsprechung gibt. Alles
 * andere landet im Migrations-Report als Posten, den der Betreiber klaeren
 * muss. 0 = Gruppenknoten (uebersprungen), 1004 = Schiebeschalter (Katalog).
 */
const ABGEBILDETE_CONTROLTYPEN = new Set([0, 1, 13, 21, 1004]);

// ---- Konvertierung ---------------------------------------------------------

export function konvertiereVisu(
  visu: VisuExport,
  gaKey: GaAufloesung,
): VisuKonvertierErgebnis {
  const nichtAbgebildet = new Map<string, number>();
  const controltypVerteilung = new Map<number, number>();
  const hinweise: string[] = [];
  let unaufgeloesteBindungen = 0;
  let gruppenknoten = 0;
  const zaehle = (grund: string): void => {
    nichtAbgebildet.set(grund, (nichtAbgebildet.get(grund) ?? 0) + 1);
  };

  // KO-Id -> GA (aus der Visu-eigenen editKo-Tabelle).
  const koGa = new Map<number, string>();
  for (const ko of alsZeilen(visu.editKo)) koGa.set(num(ko, "id"), str(ko, "ga"));

  const aufloese = (koId: number): string | undefined => {
    if (koId === 0) return undefined;
    const ga = koGa.get(koId);
    if (ga === undefined) return undefined;
    if (!istGa(ga)) {
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

  // Farbpaletten (Slot-IDs -> Farbe).
  const bgFarbe = new Map<number, string>();
  for (const c of alsZeilen(visu.editVisuBGcol)) bgFarbe.set(num(c, "id"), str(c, "color"));
  const fgFarbe = new Map<number, string>();
  for (const c of alsZeilen(visu.editVisuFGcol)) fgFarbe.set(num(c, "id"), str(c, "color"));

  // Schriften (ADR-0015): Slot s13 verweist auf eine Font-Id; im Gewerk steht
  // der NAME, die Datei liegt daneben in visu/dateien/.
  const schriftName = new Map<number, string>();
  for (const f of alsZeilen(visu.editVisuFont)) {
    const name = str(f, "name");
    if (name !== "") schriftName.set(num(f, "id"), name);
  }

  // Basis-Designs je Element (styletyp 0) aus editVisuElementDesign.
  const designRoh = new Map<number, Record<string, unknown>>();
  for (const d of alsZeilen(visu.editVisuElementDesign)) {
    if (num(d, "styletyp") === 0) designRoh.set(num(d, "targetid"), d);
  }
  // Design-VORLAGEN (editVisuElementDesignDef): die Elementzeile verweist per
  // defid darauf und laesst ihre eigenen Slots meist leer — die Werte stehen
  // in der Vorlage. Wer nur die Elementzeile liest, verliert fast alles
  // (Schriften, Farben, Groessen).
  const designDef = new Map<number, Record<string, unknown>>();
  for (const d of alsZeilen(visu.editVisuElementDesignDef)) designDef.set(num(d, "id"), d);

  /** Slotwert mit Vorlagen-Kaskade: eigener Wert schlaegt Vorlage. */
  const slot = (roh: Record<string, unknown>, name: string): string => {
    const eigen = str(roh, name);
    if (eigen !== "") return eigen;
    const vorlage = designDef.get(num(roh, "defid"));
    return vorlage ? str(vorlage, name) : "";
  };
  const slotZahl = (roh: Record<string, unknown>, name: string): number => {
    const v = Number(slot(roh, name));
    return Number.isFinite(v) ? v : 0;
  };

  // Design-Sammlung: gleiche Optik -> ein Design (dedupliziert).
  const designs: VisuDesigns = {};
  const designNachSignatur = new Map<string, string>();
  const designFuer = (elementId: number): string | undefined => {
    const roh = designRoh.get(elementId);
    if (!roh) return undefined;
    const d: VisuDesign = {};
    const bg = bgFarbe.get(slotZahl(roh, "s9"));
    if (bg) d.hintergrund = bg;
    const tf = fgFarbe.get(slotZahl(roh, "s15"));
    if (tf) d.text = tf;
    const gr = slotZahl(roh, "s14");
    if (gr > 0) d.schriftgroesse = gr;
    const schrift = schriftName.get(slotZahl(roh, "s13"));
    if (schrift) d.schriftart = schrift;
    const deck = Number(slot(roh, "s8"));
    if (Number.isFinite(deck) && deck > 0 && deck < 1) d.deckkraft = deck;
    const rb = slotZahl(roh, "s31");
    const rf = fgFarbe.get(slotZahl(roh, "s27")) ?? bgFarbe.get(slotZahl(roh, "s27"));
    const radius = slotZahl(roh, "s23");
    if (rb > 0 || rf || radius > 0) {
      d.rand = {
        ...(rb > 0 ? { staerke: rb } : {}),
        ...(rf ? { farbe: rf } : {}),
        ...(radius > 0 ? { radius } : {}),
      };
    }
    if (Object.keys(d).length === 0) return undefined;
    const signatur = JSON.stringify(d);
    let name = designNachSignatur.get(signatur);
    if (!name) {
      name = `d${designNachSignatur.size + 1}`;
      designNachSignatur.set(signatur, name);
      designs[name] = d;
    }
    return name;
  };

  // Seiten-Index (Slugs, Typen) — vor den Elementen (Navigationsziele).
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

  const elementeRoh = alsZeilen(visu.editVisuElement);
  const proSeite = new Map<number, Record<string, unknown>[]>();
  for (const e of elementeRoh) {
    const pid = num(e, "pageid");
    (proSeite.get(pid) ?? proSeite.set(pid, []).get(pid)!).push(e);
    controltypVerteilung.set(num(e, "controltyp"), (controltypVerteilung.get(num(e, "controltyp")) ?? 0) + 1);
  }

  // Klick-Befehle je Element (Spec var3-Bit 2 „Befehle"): targetid -> Befehle.
  // Hier stecken die eigentlichen Aktionen der Symbol-Tasten (Rollladen auf/ab).
  const cmdProElement = new Map<number, Record<string, unknown>[]>();
  for (const c of alsZeilen(visu.editVisuCmdList)) {
    const t = num(c, "targetid");
    (cmdProElement.get(t) ?? cmdProElement.set(t, []).get(t)!).push(c);
  }

  const seiten = new Map<string, VisuSeite>();
  let elementAnzahl = 0;
  // Fremdelemente und Symbol-Glyphen einsammeln (Migrations-Report).
  const fremd = new Map<number, { verwendungen: number; seiten: Set<string> }>();
  const glyphZaehler = new Map<string, number>();

  for (const [pid, info] of seiteInfo) {
    const rohElemente = proSeite.get(pid) ?? [];
    const elemente: Record<string, VisuElement> = {};
    let maxX = 1;
    let maxY = 1;
    const elemSlugs = new Set<string>();
    const seitenNotizen: string[] = [];

    for (const e of rohElemente) {
      const controltyp = num(e, "controltyp");
      // controltyp 0 = Gruppen-/Ordnerknoten (1x1, kein Wert) — kein sichtbares
      // Element. Ueberspringen statt als leeres label zu rendern.
      if (controltyp === 0) {
        gruppenknoten++;
        continue;
      }

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

      const designName = designFuer(id);
      if (designName) element.design = designName;

      // Element-Schluessel: sprechender Name, sonst Text, sonst element_<id>.
      // ABER nie aus einem Wertausdruck: aus "{floor(#*100/255)} %" wuerde der
      // Schluessel floor_100_255 — und den zeigt der Renderer als Beschriftung
      // an. Ein Formeltext ist kein Name.
      // Fremdelemente fuer den Migrations-Report vormerken: alles, wofuer es
      // keine echte Fachwerk-Entsprechung gibt (Custom-VSE mit Katalogeintrag
      // wie 1004 zaehlen als erledigt).
      if (!ABGEBILDETE_CONTROLTYPEN.has(controltyp)) {
        const eintrag = fremd.get(controltyp) ?? { verwendungen: 0, seiten: new Set<string>() };
        eintrag.verwendungen++;
        eintrag.seiten.add(info.name);
        fremd.set(controltyp, eintrag);
      }
      // Symbol-Glyphen zaehlen: sie brauchen eine Zuordnung, weil die
      // Panel-Schrift nicht Teil des Exports ist.
      for (const m of str(e, "text").matchAll(/&#x([0-9a-fA-F]+);?/g)) {
        const cp = m[1]!.toUpperCase();
        glyphZaehler.set(cp, (glyphZaehler.get(cp) ?? 0) + 1);
      }

      const rohText2 = str(e, "text");
      const namensQuelle = rohText2.includes("{") ? "" : rohText2;
      const rohName = str(e, "name") || namensQuelle || `element_${id}`;
      let key = slug(rohName);
      while (elemSlugs.has(key)) key = `${key}_${id}`;
      elemSlugs.add(key);
      elemente[key] = element;

      const panel: { x: number; y: number; w?: number; h?: number } = { x, y };
      if (w > 0) panel.w = w;
      if (h > 0) panel.h = h;
      element.placements = { panel };
      const z = num(e, "zindex");
      if (z > 0) element.ebene = z;
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
    designs,
    bericht: {
      visus: visuIds.size,
      seiten: seiten.size,
      elemente: elementAnzahl,
      controltypVerteilung,
      gruppenknoten,
      nichtAbgebildet,
      unaufgeloesteBindungen,
      fremdElemente: [...fremd.entries()]
        .map(([controltyp, v]) => ({
          controltyp,
          verwendungen: v.verwendungen,
          seiten: [...v.seiten].sort(),
        }))
        .sort((a, b) => b.verwendungen - a.verwendungen || a.controltyp - b.controltyp),
      glyphen: [...glyphZaehler.entries()]
        .map(([codepoint, verwendungen]) => ({ codepoint, verwendungen }))
        .sort((a, b) => b.verwendungen - a.verwendungen || a.codepoint.localeCompare(b.codepoint)),
      hinweise,
    },
  };
}

/**
 * Ein einzelnes Element abbilden (Spec-Katalog). Reihenfolge: Navigation
 * schlaegt alles (bestimmt das Verhalten), dann Taster (setzt KO2), dann
 * Anzeige (Status/Wert), sonst Label. Unbekannte controltypen -> label+Notiz.
 */
function baueElement(
  e: Record<string, unknown>,
  aufloese: (koId: number) => string | undefined,
  seiteInfo: Map<number, { slug: string; typ: VisuSeitenTyp; name: string }>,
  cmds: Record<string, unknown>[],
  zaehle: (grund: string) => void,
): { element: VisuElement; notizen: string[] } {
  const controltyp = num(e, "controltyp");
  const rohText = str(e, "text");
  const text = rohText ? entschluessleText(rohText) : "";
  const bindungen: Record<string, string> = {};
  const aktionen: Record<string, VisuAktion> = {};
  const notizen: string[] = [];
  let element_format_bool: { wahr: string; falsch: string } | undefined;

  const statusKey = aufloese(num(e, "gaid"));
  let setKey = aufloese(num(e, "gaid2"));

  // Navigation: gotopageid / closepopupid.
  const navZiel = num(e, "gotopageid");
  if (navZiel !== 0) {
    const zi = seiteInfo.get(navZiel);
    if (zi) aktionen.kurz = zi.typ === "popup" ? { popup: zi.slug } : { seite: zi.slug };
    else {
      zaehle("Navigationsziel (gotopageid) unbekannt");
      notizen.push(`Navigationsziel ${navZiel} nicht gefunden`);
    }
  }
  if (num(e, "closepopupid") !== 0 || str(e, "closepopup") === "1") {
    zaehle("closepopup ohne Ziel-Aktion im Schema");
    notizen.push("schliesst ein Popup — im Zielschema noch nicht abbildbar");
  }

  // controltyp 1: Universalelement — var3 (Kurz-Klick-Aktion) + var15 (KO2-Wert).
  if (controltyp === 1) {
    const kurzAktion = num(e, "var3");
    if (kurzAktion & AKT_KO2 && setKey) {
      bindungen.set = setKey;
      const wert = str(e, "var15");
      if (wert !== "" && aktionen.kurz === undefined) aktionen.kurz = { setze: alsWert(wert) };
    }
  }

  // „Befehle" (var3-Bit 2): die eigentliche Aktion der Symbol-Tasten. cmd 2 =
  // setze KO auf einen Wert. cmdid1 = Ziel-KO, cmdvalue1 = Wert. Hier bekommen
  // Rollladen-Auf/Ab/Stopp erst ihre Funktion.
  for (const c of cmds) {
    const cmd = num(c, "cmd");
    if (cmd === 2) {
      const key = aufloese(num(c, "cmdid1"));
      if (key && aktionen.kurz === undefined) {
        setKey = key;
        bindungen.set = key;
        aktionen.kurz = { setze: alsWert(str(c, "cmdvalue1")) };
      }
    } else {
      zaehle(`Element-Befehl cmd ${cmd} nicht abgebildet`);
      notizen.push(`Klick-Befehl cmd ${cmd} noch nicht abgebildet`);
    }
  }

  // Vorrang-Reihenfolge fuer den Preset.
  const hatSeitenAktion =
    aktionen.kurz !== undefined &&
    ((aktionen.kurz as { seite?: string }).seite !== undefined ||
      (aktionen.kurz as { popup?: string }).popup !== undefined);

  let preset: VisuPreset | undefined;
  let widget: VisuWidget | undefined;

  if (hatSeitenAktion) {
    preset = "navigation";
  } else if (controltyp === 1004) {
    // Custom-Visuelement „Schiebeschalter (Designgesteuert)" von Sven Anders
    // (VSE 1004). Semantik aus der geprueften Dirty-Room-Spec (var1=Text-Modus,
    // var6/var8=Schaltlogik) clean-room nachgebildet. Es ist ein interaktiver
    // Umschalter auf KO1, KEINE reine Anzeige.
    preset = "schalter";
    if (statusKey) {
      bindungen.status = statusKey;
      bindungen.set = statusKey; // gaid2 ist bei diesem Element unbenutzt
      if (aktionen.kurz === undefined) aktionen.kurz = { art: "umschalten" };
    }
    const sch = schiebeschalter(e, text);
    if (sch.an && sch.aus && sch.an !== sch.aus) {
      element_format_bool = sch.onWahr
        ? { wahr: sch.an, falsch: sch.aus }
        : { wahr: sch.aus, falsch: sch.an };
    }
    if (sch.deaktiviert) {
      notizen.push(`Deaktiviert-Text "${sch.deaktiviert}" — Fachwerk hat keinen Sperrtext`);
    }
  } else if (controltyp === 21) {
    widget = "diagramm";
    zaehle("controltyp 21 (Diagramm) als Widget — Archivbindung pruefen");
    notizen.push("Diagramm: Archivquelle im Editor zuweisen");
  } else if (controltyp === 13) {
    widget = "slider";
    if (setKey) bindungen.set = setKey;
    if (statusKey) bindungen.display = statusKey;
  } else if (bindungen.set) {
    // Klickbares Element mit KO2 -> Taster (schickt einen festen Wert) bzw.
    // Schalter (kein fester Wert -> umschalten).
    if (aktionen.kurz && (aktionen.kurz as { setze?: unknown }).setze !== undefined) {
      preset = "taster";
    } else {
      preset = "schalter";
      if (statusKey) bindungen.status = statusKey;
      if (aktionen.kurz === undefined) aktionen.kurz = { art: "umschalten" };
    }
  } else if (statusKey) {
    // Reine Anzeige: Zahl -> Wertanzeige, sonst Statusanzeige.
    preset = text.includes("{") ? "wertanzeige" : "statusanzeige";
    bindungen.status = statusKey;
    if (preset === "wertanzeige") bindungen.display = statusKey;
  } else if (controltyp === 12 || controltyp === 15) {
    // Dimmer/RGB bzw. Colorpicker — kein direktes Fachwerk-Preset.
    preset = "label";
    zaehle(`controltyp ${controltyp} (Farb-/Dimmerregler) noch nicht als Widget abgebildet`);
    notizen.push(`controltyp ${controltyp}: Regler — im Editor nachbauen`);
  } else if (controltyp === 1) {
    preset = "label";
  } else {
    preset = "label";
    zaehle(`controltyp ${controltyp} unbekannt -> als label`);
    notizen.push(`controltyp ${controltyp} beim Import nicht erkannt`);
  }

  // Dynamisches Design via KO3 (Spec: gaid3 steuert design_je_wert).
  const designKo = aufloese(num(e, "gaid3"));
  if (designKo && bindungen.status === undefined && preset !== "navigation") {
    bindungen.status = designKo;
  }

  // Text als Format-Vorlage (z. B. "{floor(#*100/255)} %") -> WertFormat.
  // Dazu ggf. die bool-Beschriftung des Schiebeschalters (An/Aus).
  const skalFormat = textAlsFormat(text);
  const format =
    skalFormat || element_format_bool
      ? { ...(skalFormat ?? {}), ...(element_format_bool ? { bool_map: element_format_bool } : {}) }
      : undefined;

  const element: VisuElement = {};
  if (widget) {
    element.widget = widget;
    element.parameter = {}; // Widgets MUESSEN parameter tragen (Schema).
  } else {
    element.preset = preset!;
    // Statischer Text/Symbol nur, wo es kein Wert-Format/keine bool-Map ist.
    if (text && !format) element.text = text;
  }
  if (format) element.format = format;
  if (Object.keys(bindungen).length > 0) element.bindungen = bindungen;
  if (Object.keys(aktionen).length > 0) element.aktionen = aktionen;
  return { element, notizen };
}

/**
 * EDOMI-Wertausdruck im Text ("{floor(#*100/255)} %") in ein WertFormat
 * uebersetzen, soweit sicher moeglich. `#` ist der Rohwert. Erkannt wird der
 * haeufige Skalierungsfall floor(#*a/b); alles andere bleibt Text (kein Raten).
 */
function textAlsFormat(text: string): VisuElement["format"] | undefined {
  if (!text.includes("{")) return undefined;
  const m = text.match(/\{floor\(#\*(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)\)\}/);
  if (m) {
    const suffix = text.replace(m[0], "").trim();
    return {
      skalierung: Number(m[1]) / Number(m[2]),
      dezimalstellen: 0,
      ...(suffix ? { suffix: ` ${suffix}` } : {}),
    };
  }
  // Unbekannter Ausdruck: als Template durchreichen (# -> {wert}) waere Raten;
  // stattdessen den sichtbaren Text ohne Formel als Suffix behalten.
  return undefined;
}

/**
 * Schiebeschalter (VSE 1004): An-/Aus-/Deaktiviert-Beschriftungen und die
 * Ein-Bedeutung aus var1/var6/var8 bestimmen (Dirty-Room-Spec).
 *   var1 = Text-Modus (welche Zeile des Textfelds welche Rolle hat)
 *   var6 = Schaltlogik (0/1: An == x · 2/3: An != x)
 *   var8 = Vergleichswert x (bool: 1 = An)
 * `onWahr` = true bedeutet: KO-Wert wahr entspricht dem An-Text.
 */
function schiebeschalter(
  e: Record<string, unknown>,
  text: string,
): { an?: string; aus?: string; deaktiviert?: string; onWahr: boolean } {
  const zeilen = text.split(/<br\s*\/?>|\n/);
  const z = (i: number): string | undefined => {
    const t = (zeilen[i] ?? "").trim();
    return t === "" ? undefined : t;
  };
  const var1 = num(e, "var1");
  let an: string | undefined;
  let aus: string | undefined;
  let deaktiviert: string | undefined;
  // Index-Tabelle laut Spec; bei var1=5 die Knopf-Beschriftung (idx 2/3)
  // bevorzugen, sonst die Hintergrund-Beschriftung (idx 0/1).
  switch (var1) {
    case 1: [an, aus] = [z(0), z(1)]; break;
    case 2: [an, aus, deaktiviert] = [z(0), z(0), z(1)]; break;
    case 3: [an, aus, deaktiviert] = [z(0), z(1), z(2)]; break;
    case 4: [an, aus, deaktiviert] = [z(0), z(1), z(3)]; break;
    case 5: [an, aus, deaktiviert] = [z(2) ?? z(0), z(3) ?? z(1), z(4)]; break;
    default: break;
  }
  // Ein-Bedeutung: var6 0/1 => An bei value==x; 2/3 => An bei value!=x.
  const var6 = num(e, "var6");
  const xIstEins = str(e, "var8").trim() === "1";
  const anGleichX = var6 === 0 || var6 === 1;
  const onWahr = anGleichX ? xIstEins : !xIstEins;
  return { ...(an ? { an } : {}), ...(aus ? { aus } : {}), ...(deaktiviert ? { deaktiviert } : {}), onWahr };
}

function seitentyp(pagetyp: number): VisuSeitenTyp {
  if (pagetyp === 2) return "include";
  if (pagetyp === 1) return "popup";
  return "seite";
}

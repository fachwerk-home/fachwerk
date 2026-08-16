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
 *   - Design-Slots s1..s48 je styletyp: bei styletyp 1 (bedingtes Design)
 *     tragen s1/s2 den Wertebereich der Bedingung, sonst gilt ueberall
 *     s5/s6 Groessenzuschlag (Breite/Hoehe), s9 Hintergrundfarbe,
 *     s14 Schriftgroesse, s15 Textfarbe, s31 Rahmenbreite, s27 Rahmenfarbe,
 *     s23 Eckenradius, s8 Deckkraft. Ein bedingtes Design gilt, solange der
 *     Wert des Steuer-KOs (gaid3) im Bereich s1..s2 liegt. s11 ist dort KEIN
 *     CSS, sondern ein Textueberschreiber: er ersetzt den Elementtext, solange
 *     das bedingte Design gilt (bei styletyp 0 leert ihn das Altsystem).
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

/** Zusaetzliche Nachschlagewerke aus dem bereits erzeugten Gewerk. */
export interface VisuAufloesung {
  /**
   * Interne KOs (ohne Busadresse) ueber ihren NAMEN aufloesen. Der Hauptimport
   * legt fuer jedes interne KO einen Datenpunkt mit genau diesem Namen an.
   */
  nameKey?: (name: string) => string | undefined;
  /**
   * Typ eines Datenpunkts. Noetig fuer bedingte Designs: der Renderer
   * vergleicht STRIKT, ein `1` trifft keinen bool-Datenpunkt mit `true`.
   */
  typVon?: (schluessel: string) => string | undefined;
}

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

/**
 * Position eines radialen Verlaufs in die heutige Syntax bringen. Die alte
 * praefigierte Form nennt die Position nackt ("center"), die heutige verlangt
 * "at center" — oder laesst sie weg, weil die Mitte ohnehin der Standard ist.
 * Unveraendert durchgereicht ergaebe das ungueltiges CSS, und der Verlauf
 * verschwaende ersatzlos.
 */
function radialeRichtung(alt: string): string | undefined {
  const t = alt.trim().toLowerCase();
  if (t === "" || t === "center") return undefined;
  // Form- und Groessenangaben sind in beiden Syntaxen gleich.
  if (/^(circle|ellipse|closest|farthest)/.test(t)) return alt.trim();
  return `at ${alt.trim()}`;
}

/**
 * Winkel der alten, praefigierten Verlaufssyntax in die heutige uebersetzen.
 *
 * Die beiden Syntaxen zaehlen GEGENLAEUFIG und von verschiedenen Nullpunkten:
 * `-webkit-linear-gradient(0deg)` zeigt nach rechts und dreht gegen den
 * Uhrzeigersinn, `linear-gradient(0deg)` zeigt nach oben und dreht mit ihm.
 * Daraus wird `neu = 90 - alt`. Die Schluesselwoerter nennen im alten Dialekt
 * den START, im neuen das ZIEL — sie kehren sich also um.
 */
function verlaufsRichtung(alt: string): string {
  const grad = /^(-?\d+(?:\.\d+)?)deg$/.exec(alt.trim());
  if (grad) {
    const neu = ((90 - Number(grad[1])) % 360 + 360) % 360;
    return `${neu}deg`;
  }
  const gegenteil: Record<string, string> = {
    left: "to right",
    right: "to left",
    top: "to bottom",
    bottom: "to top",
  };
  const worte = alt.trim().toLowerCase().split(/\s+/);
  const ziel = worte.map((w) => gegenteil[w]?.replace("to ", "")).filter(Boolean);
  return ziel.length > 0 ? `to ${ziel.join(" ")}` : alt;
}

/**
 * Farbwert der Palette normalisieren. Der Export speichert Verlaeufe in der
 * alten `-webkit-`-Syntax. Das Praefix nur wegzustreichen ist FALSCH — die
 * praefigierte Form misst den Winkel anders, jeder Verlauf kaeme dabei um 90
 * Grad gedreht heraus (belegt am DOM des Altsystems: ein `-90deg`-Verlauf
 * laeuft dort von oben nach unten, ohne Praefix liefe er von rechts nach
 * links). Deshalb wird der Winkel mit umgerechnet.
 */
export function farbe(roh: string): string {
  return roh.replace(
    /-webkit-(linear-gradient|radial-gradient)\(\s*([^,]+),/g,
    (_treffer, art: string, richtung: string) =>
      art === "linear-gradient"
        ? `linear-gradient(${verlaufsRichtung(richtung)},`
        : (() => {
            const pos = radialeRichtung(richtung);
            return pos === undefined ? "radial-gradient(" : `radial-gradient(${pos},`;
          })(),
  );
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
const ABGEBILDETE_CONTROLTYPEN = new Set([0, 1, 11, 12, 13, 15, 21, 1004]);

/**
 * Voreinstellungen des Altsystems fuer Elemente ohne eigene Angabe. Sie sind
 * Anlagenkonfiguration und stehen nicht im Export; abgelesen wurden sie an der
 * Darstellung einer realen Anlage (Schriftgroesse 10, schwarzer Text). Wer
 * andere Vorgaben hat, korrigiert sie im erzeugten Gewerk — sie stehen dort
 * je Seite als `grundstil` und sind damit sichtbar statt eingebrannt.
 */
const GRUNDSCHRIFTGROESSE = 10;
const GRUNDTEXTFARBE = "#000000";

// ---- Konvertierung ---------------------------------------------------------

export function konvertiereVisu(
  visu: VisuExport,
  gaKey: GaAufloesung,
  opt: VisuAufloesung = {},
): VisuKonvertierErgebnis {
  const { nameKey, typVon } = opt;
  const nichtAbgebildet = new Map<string, number>();
  const controltypVerteilung = new Map<number, number>();
  const hinweise: string[] = [];
  let unaufgeloesteBindungen = 0;
  let gruppenknoten = 0;
  const zaehle = (grund: string): void => {
    nichtAbgebildet.set(grund, (nichtAbgebildet.get(grund) ?? 0) + 1);
  };

  // KO-Id -> GA und -> Name (aus der Visu-eigenen editKo-Tabelle).
  const koGa = new Map<number, string>();
  const koName = new Map<number, string>();
  for (const ko of alsZeilen(visu.editKo)) {
    koGa.set(num(ko, "id"), str(ko, "ga"));
    koName.set(num(ko, "id"), str(ko, "name"));
  }

  const aufloese = (koId: number): string | undefined => {
    if (koId === 0) return undefined;
    const ga = koGa.get(koId);
    if (ga === undefined) return undefined;
    if (!istGa(ga)) {
      // Internes KO: keine Busadresse — aber der Hauptimport hat daraus einen
      // internen Datenpunkt gemacht, der denselben Namen traegt. Ueber den
      // Namen ist er eindeutig zu finden; das ist keine Rateoperation, sondern
      // dieselbe Quelle. Ohne das verliert die Visu jede Bindung auf einen
      // Merker — und genau daran haengen die dynamischen Anzeigen.
      const key = nameKey?.(koName.get(koId) ?? "");
      if (key !== undefined) return key;
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
  for (const c of alsZeilen(visu.editVisuBGcol)) bgFarbe.set(num(c, "id"), farbe(str(c, "color")));
  const fgFarbe = new Map<number, string>();
  for (const c of alsZeilen(visu.editVisuFGcol)) fgFarbe.set(num(c, "id"), farbe(str(c, "color")));

  // Schriften (ADR-0015): Slot s13 verweist auf eine Font-Id; im Gewerk steht
  // der NAME, die Datei liegt daneben in visu/dateien/.
  const schriftName = new Map<number, string>();
  for (const f of alsZeilen(visu.editVisuFont)) {
    const name = str(f, "name");
    if (name !== "") schriftName.set(num(f, "id"), name);
  }

  // Bilder (Slot s10, s46, s47): die Beilage im Paket heisst img-<id>.<suffix>
  // und wird unter diesem Namen ins Gewerk gelegt. Das Design verweist auf den
  // Dateinamen, nie auf einen Pfad (ADR-0015 D-2).
  const bildDatei = new Map<number, string>();
  for (const b of alsZeilen(visu.editVisuImg)) {
    const suffix = str(b, "suffix");
    if (suffix !== "") bildDatei.set(num(b, "id"), `img-${num(b, "id")}.${suffix}`);
  }

  // Basis-Designs je Element (styletyp 0) aus editVisuElementDesign.
  const designRoh = new Map<number, Record<string, unknown>>();
  // Bedingte Designs (styletyp 1): gelten, solange der Wert des Steuer-KOs im
  // Bereich s1..s2 liegt. Ein Element kann mehrere davon haben.
  const designBedingt = new Map<number, Record<string, unknown>[]>();
  for (const d of alsZeilen(visu.editVisuElementDesign)) {
    const ziel = num(d, "targetid");
    if (num(d, "styletyp") === 0) designRoh.set(ziel, d);
    else if (num(d, "styletyp") === 1) {
      const liste = designBedingt.get(ziel);
      if (liste) liste.push(d);
      else designBedingt.set(ziel, [d]);
    }
  }
  // Design-VORLAGEN (editVisuElementDesignDef): die Elementzeile verweist per
  // defid darauf und laesst ihre eigenen Slots meist leer — die Werte stehen
  // in der Vorlage. Wer nur die Elementzeile liest, verliert fast alles
  // (Schriften, Farben, Groessen).
  const designDef = new Map<number, Record<string, unknown>>();
  for (const d of alsZeilen(visu.editVisuElementDesignDef)) designDef.set(num(d, "id"), d);

  /**
   * Groesse eines Elements. Das Altsystem addiert zwei Summanden:
   * `calc(<xsize>px + <s5>px)` — die Groesse am Element selbst und einen
   * Zuschlag aus dem Design (s5 = Breite, s6 = Hoehe). Dynamisch dimensionierte
   * Elemente lassen xsize/ysize auf 0 und bekommen ihre Groesse allein aus dem
   * Design; wer nur xsize liest, macht daraus ein Element ohne Ausdehnung.
   *
   * Fehlt der Design-Slot, erzeugt das Altsystem den ungueltigen Ausdruck
   * `calc(12px + px)`, worauf der Browser auf den reinen Elementwert
   * zurueckfaellt — die Addition mit 0 bildet genau das ab.
   */
  const groesse = (
    elementId: number,
    e: Record<string, unknown>,
    feld: "xsize" | "ysize",
    slotName: "s5" | "s6",
  ): number => {
    const rohDesign = designRoh.get(elementId);
    return num(e, feld) + (rohDesign ? slotZahl(rohDesign, slotName) : 0);
  };

  /**
   * Vergleichswert einer Design-Bedingung im Typ des Ziel-Datenpunkts. Der
   * Renderer vergleicht mit ===; eine 1 traefe einen bool-Datenpunkt nie, der
   * zur Laufzeit true fuehrt. Ist der Typ unbekannt, gewinnt die Zahl — das
   * Altsystem vergleicht numerisch.
   */
  const bedingungsWert = (roh: string, dpSchluessel: string | undefined): string | number | boolean => {
    const typ = dpSchluessel ? typVon?.(dpSchluessel) : undefined;
    if (typ === "bool") return roh === "1" || roh.toLowerCase() === "true";
    if (typ === "text") return roh;
    const n = Number(roh);
    return Number.isFinite(n) && roh.trim() !== "" ? n : roh;
  };

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
  const merkeDesign = (d: VisuDesign): string => {
    const signatur = JSON.stringify(d);
    let name = designNachSignatur.get(signatur);
    if (!name) {
      name = `d${designNachSignatur.size + 1}`;
      designNachSignatur.set(signatur, name);
      designs[name] = d;
    }
    return name;
  };
  const designAus = (roh: Record<string, unknown>, bedingt = false): string | undefined => {
    const d: VisuDesign = {};
    // s11 ersetzt den Anzeigetext, solange das Design gilt — aber NUR bei
    // bedingten Designs. Beim statischen Design leert das Altsystem den Slot
    // nach der Vorlagen-Vererbung; eine Vorlage, die s11 fuer ein
    // Bedingungs-Design mitbringt, darf den Grundtext nicht verdraengen.
    if (bedingt) {
      const beschriftung = entschluessleText(slot(roh, "s11"));
      if (beschriftung !== "") d.beschriftung = beschriftung;
    }
    const bg = bgFarbe.get(slotZahl(roh, "s9"));
    if (bg) d.hintergrund = bg;
    const tf = fgFarbe.get(slotZahl(roh, "s15"));
    if (tf) d.text = tf;
    const gr = slotZahl(roh, "s14");
    if (gr > 0) d.schriftgroesse = gr;
    const schrift = schriftName.get(slotZahl(roh, "s13"));
    if (schrift) d.schriftart = schrift;
    // Textausrichtung (Spec s18: 1=links 2=zentriert 3=rechts 4=Blocksatz).
    // In EDOMI ist links der Default (leer wie 1). Der Renderer soll ebenfalls
    // links als Default nehmen; deshalb schreiben wir nur die ABWEICHUNGEN ins
    // Design — sonst traegt jedes reine Farbdesign ein ueberfluessiges
    // Textattribut. Das behebt den Befund „kreuz und quer" (Labels waren links,
    // wurden aber zentriert dargestellt).
    const ausrichtung = ({ 2: "zentriert", 3: "rechts", 4: "blocksatz" } as const)[
      slotZahl(roh, "s18") as 2 | 3 | 4
    ];
    if (ausrichtung) d.textausrichtung = ausrichtung;
    const deck = Number(slot(roh, "s8"));
    if (Number.isFinite(deck) && deck > 0 && deck < 1) d.deckkraft = deck;
    // Schriftschnitt (s16/s17) — Aufzaehlungen aus der geprueften Spec.
    const stil = ({ 1: "normal", 2: "kursiv" } as const)[slotZahl(roh, "s16") as 1 | 2];
    if (stil) d.schriftstil = stil;
    const staerke = ({ 1: "normal", 2: "fett" } as const)[slotZahl(roh, "s17") as 1 | 2];
    if (staerke) d.schriftstaerke = staerke;
    const polster = slotZahl(roh, "s12");
    if (polster > 0) d.polsterung = polster;
    const dx = slotZahl(roh, "s3");
    const dy = slotZahl(roh, "s4");
    if (dx !== 0 || dy !== 0) d.versatz = { ...(dx ? { x: dx } : {}), ...(dy ? { y: dy } : {}) };
    const bild = bildDatei.get(slotZahl(roh, "s10"));
    if (bild) {
      d.bild = bild;
      // Ohne Angabe fuellt das Bild die Flaeche. Das ist der Standard des
      // Altsystems (var7=2) und der einzig brauchbare Rueckfall: ein Bild in
      // Originalgroesse in einem 300er Quadrat ist immer falsch. Die genaue
      // Angabe kommt spaeter aus var7 — aber NUR bei controltyp 1, wo var7
      // ueberhaupt die Bildskalierung meint. Bei anderen Typen bedeutet
      // dieselbe Nummer etwas voellig anderes.
      d.bildGroesse = "flaeche";
    }
    // Textschatten (s19-s22) und Boxschatten (s33-s38). Beide brauchen eine
    // Farbe, sonst waeren sie unsichtbar — ohne die wird nichts geschrieben.
    const tsFarbe = fgFarbe.get(slotZahl(roh, "s22"));
    if (tsFarbe) {
      d.textschatten = {
        x: slotZahl(roh, "s19"),
        y: slotZahl(roh, "s20"),
        unschaerfe: slotZahl(roh, "s21"),
        farbe: tsFarbe,
      };
    }
    const bsFarbe = fgFarbe.get(slotZahl(roh, "s37"));
    if (bsFarbe) {
      d.schatten = {
        x: slotZahl(roh, "s33"),
        y: slotZahl(roh, "s34"),
        unschaerfe: slotZahl(roh, "s35"),
        ueberstand: slotZahl(roh, "s36"),
        farbe: bsFarbe,
        // s38: 1 = aussen, 2 = innen.
        ...(slotZahl(roh, "s38") === 2 ? { innen: true } : {}),
      };
    }
    const rb = slotZahl(roh, "s31");
    const randFarbe = (slotName: string): string | undefined =>
      fgFarbe.get(slotZahl(roh, slotName)) ?? bgFarbe.get(slotZahl(roh, slotName));
    // s27-s30 sind vier eigenstaendige Seitenfarben. Sind alle gleich, genuegt
    // die einfache Angabe — sonst braucht der Renderer sie einzeln.
    const seiten = {
      links: randFarbe("s27"),
      oben: randFarbe("s28"),
      rechts: randFarbe("s29"),
      unten: randFarbe("s30"),
    };
    const gesetzteSeiten = Object.values(seiten).filter(Boolean);
    const einheitlicheFarbe =
      gesetzteSeiten.length === 4 && new Set(gesetzteSeiten).size === 1 ? seiten.links : undefined;
    const rf = einheitlicheFarbe ?? (gesetzteSeiten.length === 1 ? gesetzteSeiten[0] : undefined);
    const ecken = {
      ol: slotZahl(roh, "s23"),
      or: slotZahl(roh, "s24"),
      ur: slotZahl(roh, "s25"),
      ul: slotZahl(roh, "s26"),
    };
    const eckWerte = Object.values(ecken).filter((v) => v > 0);
    const radius = new Set(Object.values(ecken)).size === 1 ? ecken.ol : 0;
    const muster = ({ 1: "linie", 2: "punkte", 3: "striche" } as const)[
      slotZahl(roh, "s32") as 1 | 2 | 3
    ];
    if (rb > 0 || gesetzteSeiten.length > 0 || eckWerte.length > 0 || muster) {
      d.rand = {
        ...(rb > 0 ? { staerke: rb } : {}),
        ...(rf ? { farbe: rf } : {}),
        ...(rf === undefined && gesetzteSeiten.length > 0
          ? { farben: Object.fromEntries(Object.entries(seiten).filter(([, v]) => v)) }
          : {}),
        ...(radius > 0 ? { radius } : {}),
        ...(radius === 0 && eckWerte.length > 0
          ? { radien: Object.fromEntries(Object.entries(ecken).filter(([, v]) => v > 0)) }
          : {}),
        ...(muster ? { muster } : {}),
      };
    }
    if (Object.keys(d).length === 0) return undefined;
    return merkeDesign(d);
  };
  /**
   * Knopf-Design eines Schiebeschalters aus den Zusatzfarben s44/s42.
   *
   * Das Custom-Element zeichnet seinen Knopf ueber CSS-Variablen, die aus
   * diesen beiden Slots gespeist werden. Dass es der Knopf ist, steht nicht in
   * der Spec — es steht in den Daten: der Betreiber hat die Farben selbst
   * "Button Knopf off" und "Button Knopf on" genannt, und sie sind der EINZIGE
   * Unterschied zwischen seiner Aus- und Ein-Vorlage.
   */
  const knopfAus = (roh: Record<string, unknown>): string | undefined => {
    const d: VisuDesign = {};
    const hg = bgFarbe.get(slotZahl(roh, "s44"));
    if (hg) d.hintergrund = hg;
    const vg = fgFarbe.get(slotZahl(roh, "s42"));
    if (vg) d.text = vg;
    return Object.keys(d).length > 0 ? merkeDesign(d) : undefined;
  };

  const designFuer = (elementId: number): string | undefined => {
    const roh = designRoh.get(elementId);
    return roh ? designAus(roh) : undefined;
  };

  // Seiten-Index (Slugs, Typen) — vor den Elementen (Navigationsziele).
  const seitenRoh = alsZeilen(visu.editVisuPage);
  const visuIds = new Set<number>();
  const seiteInfo = new Map<
    number,
    { slug: string; typ: VisuSeitenTyp; name: string; bgcolorid: number; includeid: number; globalinclude: boolean }
  >();
  const slugVergeben = new Set<string>();
  for (const p of seitenRoh) {
    const id = num(p, "id");
    visuIds.add(num(p, "visuid"));
    const name = str(p, "name") || `Seite ${id}`;
    let s = slug(name);
    while (slugVergeben.has(s)) s = `${s}_${id}`;
    slugVergeben.add(s);
    seiteInfo.set(id, {
      slug: s,
      typ: seitentyp(num(p, "pagetyp")),
      name,
      bgcolorid: num(p, "bgcolorid"),
      includeid: num(p, "includeid"),
      globalinclude: num(p, "globalinclude") === 1,
    });
  }
  // Alle global einzubindenden Seiten (typ include) — Ziel jeder Seite mit
  // globalinclude=1.
  const globaleIncludes = [...seiteInfo.values()]
    .filter((i) => i.typ === "include")
    .map((i) => i.slug)
    .sort();

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
      const w = groesse(id, e, "xsize", "s5");
      const h = groesse(id, e, "ysize", "s6");
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
      // Bildskalierung aus var7 — ausschliesslich beim Universalelement.
      // controltypen.md: bei ct12 heisst var9 "Groesse in Prozent", bei ct15
      // "Cursor-Durchmesser". Dieselbe Nummer, andere Bedeutung; wer sie
      // typunabhaengig liest, macht funktionierende Elemente kaputt.
      if (controltyp === 1 && designName) {
        const d = designs[designName];
        if (d?.bild) {
          const art = ({ 0: "original", 1: "masse", 2: "flaeche", 3: "decken", 4: "einpassen" } as const)[
            num(e, "var7") as 0 | 1 | 2 | 3 | 4
          ];
          if (art) d.bildGroesse = art;
          const bb = num(e, "var9");
          const bh = num(e, "var10");
          if (art === "masse" && bb > 0 && bh > 0) d.bildMasse = { b: bb, h: bh };
        }
      }

      // Bedingte Designs: das Altsystem tauscht die Optik, sobald der Wert
      // des Steuer-KOs in den Bereich s1..s2 faellt. Steuer-KO ist laut Spec
      // KO3 (gaid3) — und FEHLT es, KO1 (gaid). Dieser Rueckfall ist kein
      // Randfall, sondern der Normalfall: die Standard-Schalter einer Anlage
      // haengen ihre Zustandsdesigns fast immer an KO1. Ohne ihn kamen die
      // Regeln zwar mit, aber ohne Statusquelle — und ein Design, dessen
      // Steuerwert nie eintrifft, wechselt nie.
      const bedingte = designBedingt.get(id) ?? [];
      const designQuelle =
        bedingte.length > 0
          ? aufloese(num(e, "gaid3")) ?? aufloese(num(e, "gaid")) ?? element.bindungen?.status
          : undefined;
      if (designQuelle && element.bindungen?.status === undefined) {
        element.bindungen = { ...element.bindungen, status: designQuelle };
      }
      // Fachwerk vergleicht STRIKT — der Vergleichswert muss den Typ des
      // Steuer-Datenpunkts tragen, sonst trifft er nie.
      const regeln: Array<{ wenn: string | number | boolean | null; design: string }> = [];
      for (const rohD of bedingte) {
        const von = str(rohD, "s1");
        const bis = str(rohD, "s2");
        if (von === "") continue;
        if (von !== bis) {
          zaehle("bedingtes Design mit Wertebereich (nur exakter Wert abgebildet)");
          continue;
        }
        const name = designAus(rohD, true);
        if (!name) continue;
        regeln.push({ wenn: bedingungsWert(von, designQuelle), design: name });
      }
      if (regeln.length > 0) element.design_je_wert = regeln;

      // ---- Elementtypen mit eigenem Widget --------------------------------
      // Preset und Widget schliessen sich aus (Schema): wer ein Widget bekommt,
      // verliert sein Preset. Die var-Bedeutungen sind JE TYP verschieden —
      // dieselbe Nummer heisst anderswo etwas anderes, deshalb steht jede
      // Auswertung in ihrem eigenen Zweig.
      if (controltyp === 1004) {
        // Schiebeschalter: Aus- und Ein-Optik stecken in Basis- und bedingtem
        // Design, der Knopf in deren Zusatzfarben.
        const basisRoh = designRoh.get(id);
        const einRoh = bedingte[0];
        const aus = designName;
        const ein = einRoh ? designAus(einRoh, true) : undefined;
        if (aus && ein) {
          delete element.preset;
          delete element.design_je_wert;
          element.widget = "schiebeschalter";
          const knopfA = basisRoh ? knopfAus(basisRoh) : undefined;
          const knopfE = einRoh ? knopfAus(einRoh) : undefined;
          const anteil = num(e, "var4");
          // var6 nennt die Richtung: welche Seite der EIN-Zustand belegt.
          // Am Panel des Betreibers steht der Knopf im Aus-Zustand RECHTS
          // (rot) — bei var6=0 liegt EIN also links.
          const einLinks = num(e, "var6") % 2 === 0;
          // var2 = Stil: 0 rund, sonst abgerundet/eckig. Die Werteliste fuehrt
          // die Spec nicht; belegt ist nur, dass der Betreiber mit 0 eine
          // Pillenform bekommt. Deshalb wird ausschliesslich dieser eine Wert
          // uebersetzt und alles andere offengelassen statt geraten.
          const stil = num(e, "var2");
          element.parameter = {
            aus,
            ein,
            ...(knopfA && knopfE ? { knopf_aus: knopfA, knopf_ein: knopfE } : {}),
            ...(anteil > 0 ? { knopf_anteil: anteil } : {}),
            ...(einLinks ? { ein_liegt: "links" } : {}),
            ...(stil === 0 ? { form: "pille" } : {}),
            dauer_ms: 200,
          };
          if (stil !== 0) zaehle(`Schiebeschalter Stil var2=${stil} — Werteliste fehlt in der Spec`);
          // Die Beschriftung gehoert IN den Knopf, nicht daneben. Der
          // Elementtext traegt die Zeilen An/Aus/deaktiviert; sie stehen
          // bereits als bool_map im Format.
          element.parameter["text_im_knopf"] = true;
        } else {
          zaehle("Schiebeschalter ohne Aus/Ein-Design — Zustand nicht sichtbar");
        }
      } else if (controltyp === 11 || controltyp === 12) {
        delete element.preset;
        element.widget = "regler";
        // Typ 11: var5-8 Wertebereich, var9 Groesse. Typ 12: var9 Groesse,
        // var10/11 Knopfgroesse. var1 nennt den Modus, aber die Spec fuehrt
        // die Werteliste NICHT — deshalb bleibt der Modus offen statt geraten.
        const groesse = num(e, "var9");
        const knopf = num(e, controltyp === 12 ? "var10" : "var10");
        element.parameter = {
          ...(groesse > 0 ? { groesse } : {}),
          ...(knopf > 0 ? { knopf_anteil: knopf } : {}),
        };
        zaehle(`controltyp ${controltyp}: Reglermodus (var1) nicht in der Spec — Standard angenommen`);
      } else if (controltyp === 15) {
        delete element.preset;
        element.widget = "farbauswahl";
        // var3 Alpha-Schwelle, var5 Cursor-Durchmesser, var6 Cursor-Staerke.
        // var1 nennt den Modus, wieder ohne Werteliste in der Spec.
        const alpha = num(e, "var3");
        const cursor = num(e, "var5");
        const staerke = num(e, "var6");
        element.parameter = {
          ...(alpha > 0 ? { alpha_schwelle: alpha } : {}),
          ...(cursor > 0 ? { cursor } : {}),
          ...(staerke > 0 ? { cursor_staerke: staerke } : {}),
        };
        zaehle("controltyp 15: Farbmodus (var1) nicht in der Spec — Standard angenommen");
      }

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
    // Voreinstellungen der Seite. Das Altsystem gibt jeder Seite eine
    // Grundschrift mit; Elemente ohne eigene Angabe erben sie. Ohne dieses
    // Feld erben sie stattdessen die Typografie der Fachwerk-Oberflaeche —
    // und dann sehen ausgerechnet die schlichten Elemente falsch aus.
    // Gemessen an einer echten Anlage: 46 von 68 Abweichungen auf einer Seite.
    //
    // Die Werte stehen NICHT im Export: sie sind Anlagenkonfiguration. Sie
    // stammen aus der beobachteten Darstellung des Altsystems und sind
    // deshalb hier benannt statt versteckt. Die Schriftfamilie bleibt offen —
    // die Grundschrift des Altsystems liegt dem Export nicht bei, und der
    // Renderer nimmt dann eine neutrale Serifenlose statt unserer eigenen.
    seite.grundstil = { schriftgroesse: GRUNDSCHRIFTGROESSE, text: GRUNDTEXTFARBE };
    // Seitenhintergrund (B1): bgcolorid ueber die Palette. 0/null = keiner.
    const bg = bgFarbe.get(info.bgcolorid);
    if (bg) seite.hintergrund = bg;
    // Include-Verweise (B2): eine Seite mit globalinclude=1 bekommt ALLE
    // globalen Include-Seiten; includeid ist der Einzelverweis. Include-Seiten
    // selbst binden nichts ein (sonst enthielte der Header sich selbst).
    if (info.typ !== "include") {
      const ziele = new Set<string>();
      if (info.globalinclude) for (const s of globaleIncludes) ziele.add(s);
      const einzeln = seiteInfo.get(info.includeid);
      if (einzeln && einzeln.typ === "include") ziele.add(einzeln.slug);
      if (ziele.size > 0) seite.includes = [...ziele].sort();
    }
    if (seitenNotizen.length > 0) seite.notizen = seitenNotizen.join("\n");
    seiten.set(info.slug, seite);
  }

  // Leinwandgroesse (B3, kalibriert am DEV-DOM): Das Altsystem entwirft eine
  // Visu auf EINER Breite (viewport width=1170) und laesst das Geraet die ganze
  // Seite darauf skalieren. Die Breite ist deshalb einheitlich.
  //
  // Die HOEHE kommt nicht aus den eigenen Elementen allein: die EDOMI-Seite ist
  // so hoch wie ihr Inhalt EINSCHLIESSLICH der eingebundenen Seiten. Im
  // Referenz-Panel spannt der Header-Hintergrund (bgSeite, 1170x2141 bei y=250)
  // jede Seite auf 2391 auf — deshalb sind dort alle Seiten gleich hoch und es
  // springt nichts. Wer nur die eigene Bounding-Box nimmt, bekommt je Seite eine
  // andere Hoehe (Befund „Seiten springen") UND schneidet den eingebundenen
  // Header ab. Also: Hoehe = max(eigene, Hoehe jeder eingebundenen Seite).
  const eigeneHoehe = new Map<string, number>();
  for (const [slug, s] of seiten) eigeneHoehe.set(slug, s.groessen["panel"]?.h ?? 1);
  const breiten = [...seiten.values()].map((s) => s.groessen["panel"]?.w ?? 1);
  const leinwandBreite = breiten.length > 0 ? Math.max(...breiten) : 1;
  for (const s of seiten.values()) {
    const g = s.groessen["panel"];
    if (!g) continue;
    g.w = leinwandBreite;
    const inklHoehen = (s.includes ?? []).map((k) => eigeneHoehe.get(k) ?? 0);
    g.h = Math.max(g.h, ...inklHoehen);
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
  seiteInfo: Map<number, Readonly<{ slug: string; typ: VisuSeitenTyp; name: string }>>,
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

  // „Befehle" (var3-Bit 2): die eigentliche Aktion der Symbol-Tasten. Immer
  // gilt: cmdid1 = Ziel-KO, cmdvalue1 = Wert. Hier bekommen Rollladen-Auf/Ab/
  // Stopp und die Umschalter erst ihre Funktion.
  //
  //   cmd 2  festen Wert schreiben
  //   cmd 4  umschalten; Ein-Wert aus cmdvalue1, Zustand am Ziel-KO selbst
  //   cmd 6  umschalten; Zustand aber an einem ANDEREN KO (cmdid2) ablesen —
  //          auf dem Bus die Regel: Stellen und Melden liegen getrennt.
  for (const c of cmds) {
    const cmd = num(c, "cmd");
    const key = cmd === 2 || cmd === 4 || cmd === 6 ? aufloese(num(c, "cmdid1")) : undefined;
    if (key === undefined) {
      if (cmd !== 2 && cmd !== 4 && cmd !== 6) {
        zaehle(`Element-Befehl cmd ${cmd} nicht abgebildet`);
        notizen.push(`Klick-Befehl cmd ${cmd} noch nicht abgebildet`);
      }
      continue;
    }
    if (aktionen.kurz !== undefined) continue;
    setKey = key;
    bindungen.set = key;
    if (cmd === 2) {
      aktionen.kurz = { setze: alsWert(str(c, "cmdvalue1")) };
      continue;
    }
    const ein = alsWert(str(c, "cmdvalue1"));
    // Woran wird der Zustand abgelesen? cmd 6 nennt ein eigenes KO, cmd 4
    // meint das Ziel selbst. Bei cmd 4 muss das AUSDRUECKLICH dastehen: das
    // Element traegt oft schon eine status-Bindung fuer die Anzeige (aus
    // gaid3), und die Rueckfallkette des Renderers wuerde die nehmen. Dann
    // liest der Umschalter einen anderen Datenpunkt als den, auf den er
    // schreibt — und schaltet nie zurueck.
    const statusKo = cmd === 6 ? aufloese(num(c, "cmdid2")) : key;
    aktionen.kurz = {
      art: "umschalten",
      // Ein Ein-Wert von „wahr" ist der Normalfall und braucht keine Angabe;
      // ein Dimmer, der auf 20 Prozent geht, sehr wohl.
      ...(ein === true ? {} : { ein }),
      ...(statusKo ? { status: statusKo } : {}),
    };
    if (cmd === 6 && !statusKo) {
      notizen.push("Umschalter: Status-KO nicht aufloesbar — schaltet am Ziel-KO selbst");
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
  } else if (controltyp === 12 || controltyp === 15) {
    // Dimmer/RGB bzw. Colorpicker — kein direktes Fachwerk-Preset. Diese
    // Pruefung steht VOR den allgemeinen Klick- und Anzeigeregeln: ein Regler
    // bleibt ein Regler, auch wenn seine KOs aufloesbar sind. Sonst verschwaende
    // er als scheinbar fertiger Taster oder als Statusanzeige mit rohem Wert —
    // und der Betreiber verlaere den Hinweis, dass hier etwas nachzubauen ist.
    // Regler und Farbauswahl bekommen im Element-Durchgang ihr Widget; hier
    // wird nur die Bindung gesichert und das Preset vorbelegt, falls die
    // Widget-Zuweisung mangels Daten unterbleibt.
    preset = "label";
    if (statusKey) bindungen.status = statusKey;
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
  // Der Rohwert ohne Umrechnung: "{#} °C" zeigt schlicht den Wert mit Einheit.
  // Das ist kein Raten — `#` IST laut Spec der Rohwert. Ohne diesen Fall steht
  // die Vorlage woertlich auf dem Panel: "{#} °C" statt "26.3 °C".
  const roh = /^(.*?)\{\s*#\s*\}(.*)$/s.exec(text);
  if (roh) {
    const praefix = roh[1] ?? "";
    const suffix = roh[2] ?? "";
    if (praefix.trim() === "" && suffix.trim() === "") return undefined;
    return {
      ...(praefix.trim() ? { praefix } : {}),
      ...(suffix.trim() ? { suffix } : {}),
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

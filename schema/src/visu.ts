import { Ajv2020 } from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv";
import visuSeiteSchema from "../schemas/visu-seite.schema.json" with { type: "json" };
import visuDesignsSchema from "../schemas/visu-designs.schema.json" with { type: "json" };

export interface WertFormat {
  einheit?: string;
  praefix?: string;
  suffix?: string;
  dezimalstellen?: number;
  skalierung?: number;
  offset?: number;
  tausendertrenner?: boolean;
  enum_map?: Record<string, string>;
  bool_map?: { wahr: string; falsch: string };
  fallback?: string;
  leerwert?: string;
  max_laenge?: number;
  ellipsis?: string;
  muster?: string;
  modus?: "absolut" | "relativ";
  template?: string;
}

export type VisuSeitenTyp = "seite" | "popup" | "include";
export type VisuPreset =
  | "taster"
  | "schalter"
  | "statusanzeige"
  | "wertanzeige"
  | "label"
  | "symbol"
  | "navigation";
export type VisuWidget =
  | "slider"
  | "diagramm"
  /** Schiebeschalter: zwei Zustandsdesigns mit Uebergang dazwischen. */
  | "schiebeschalter"
  /** Dreh- oder Inkrementalregler fuer einen Zahlenwert. */
  | "regler"
  /** Farbe oder Helligkeit aus einem Bild greifen. */
  | "farbauswahl";
export type VisuSymbolName =
  | "alarm"
  | "anwesenheit"
  | "diagramm"
  | "einstellungen"
  | "etage"
  | "fenster_gekippt"
  | "fenster_offen"
  | "fenster_zu"
  | "glocke"
  | "haus"
  | "heizung"
  | "info"
  | "jalousie"
  | "licht_an"
  | "licht_aus"
  | "licht_dimmer"
  | "luftfeuchte"
  | "luefter"
  | "minus"
  | "mond"
  | "pfeil_hoch"
  | "pfeil_links"
  | "pfeil_rechts"
  | "pfeil_runter"
  | "plus"
  | "regen"
  | "rollo_ab"
  | "rollo_auf"
  | "rollo_position"
  | "rollo_stopp"
  | "raum"
  | "schloss_offen"
  | "schloss_zu"
  | "szene"
  | "sonne"
  | "steckdose"
  | "temperatur"
  | "thermostat"
  | "timer"
  | "tuer_offen"
  | "tuer_zu"
  | "uhr"
  | "wind"
  | "wolken";

export interface VisuGroesse { w: number; h: number }
export interface VisuPlacement {
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  sichtbar?: boolean;
  format?: WertFormat;
}
export type VisuAktion =
  | {
      art: "umschalten";
      /**
       * Wert fuer den EIN-Zustand. Fehlt er, wird schlicht zwischen wahr und
       * falsch gewechselt. Gesetzt wird er gebraucht, wenn „ein" nicht 1 heisst
       * — ein Dimmer, der auf 20 % geht, ist kein bool.
       */
      ein?: string | number | boolean;
      /**
       * Datenpunkt, dessen Wert ueber ein/aus entscheidet. Fehlt er, gilt der
       * Datenpunkt, auf den geschrieben wird. Getrennt noetig, wenn Stellen und
       * Melden auf verschiedenen Adressen liegen — auf dem Bus die Regel, nicht
       * die Ausnahme.
       */
      status?: string;
    }
  | { setze: string | number | boolean | null }
  | { seite: string }
  | { popup: string };
export interface VisuElement {
  preset?: VisuPreset;
  widget?: VisuWidget;
  /**
   * Statischer Anzeigetext des Elements (B-8): Beschriftung eines Labels/
   * Tasters oder ein Symbol-Glyph. Rein deklarativ, kein Wertbezug — dynamische
   * Werte laufen weiter ueber bindungen + format.
   */
  text?: string;
  /** Eingebauter Fachwerk-SVG-Symbolname (B-9), renderer-seitig currentColor. */
  symbol?: VisuSymbolName;
  parameter?: Record<string, unknown>;
  bindungen?: Record<string, string>;
  gruppe?: string;
  ebene?: number;
  design?: string;
  design_je_wert?: Array<{ wenn: string | number | boolean | null; design: string }>;
  aktionen?: Record<string, VisuAktion>;
  format?: WertFormat;
  placements?: Record<string, VisuPlacement>;
}
/** Vererbbare Voreinstellungen einer Seite. */
export interface VisuGrundstil {
  /** Schriftfamilie aus visu/dateien/. Fehlt sie, gilt eine neutrale Serifenlose. */
  schriftart?: string;
  schriftgroesse?: number;
  /** Schriftfarbe — heisst wie im Design `text`. */
  text?: string;
  textausrichtung?: "links" | "zentriert" | "rechts" | "blocksatz";
}

export interface VisuSeite {
  typ: VisuSeitenTyp;
  name: string;
  basis: string;
  groessen: Record<string, VisuGroesse>;
  /**
   * Hintergrund der Seite (Farbe oder CSS-Verlauf). Bewusst ein eigenes Feld
   * statt eines Design-Verweises: die Seite traegt genau diese eine Eigenschaft,
   * und `hintergrund: "#05395E"` ist im Diff sofort lesbar, waehrend
   * `design: d12` einen Nachschlag erzwingt (ADR-0004: Gewerk = lesbarer Text).
   */
  hintergrund?: string;
  /**
   * Voreinstellungen der Seite, die JEDES Element ohne eigene Angabe erbt.
   *
   * Ein importiertes Altsystem bringt eigene Vorgaben mit — andere Schrift,
   * andere Groesse, andere Textfarbe. Ohne dieses Feld erben die Elemente
   * stattdessen die Vorgaben der Fachwerk-Oberflaeche, und dann sehen genau
   * die Elemente falsch aus, die im Original nichts eigenes mitbringen: die
   * schlichten. Gemessen an einer echten Anlage waren das 46 von 68
   * Abweichungen — eine Ursache, vielfach sichtbar.
   *
   * Nur vererbbare Angaben: was nicht vererbt wird, gehoert ins Design.
   */
  grundstil?: VisuGrundstil;
  /**
   * Seiten vom Typ `include`, die VOR dem eigenen Inhalt gerendert werden
   * (z. B. ein Kopfbereich auf jeder Seite). Referenziert wird der Seiten-
   * schluessel, nie ein Pfad.
   */
  includes?: string[];
  gruppen?: Record<string, { name: string; ebene?: number }>;
  elemente: Record<string, VisuElement>;
  notizen?: string;
}
export interface VisuRand {
  staerke?: number;
  farbe?: string;
  radius?: number;
  /**
   * Farbe je Seite. Bewusst NEBEN `farbe` statt als Vereinigungstyp: der
   * Renderer darf `farbe` weiter als schlichte Zeichenkette lesen. Ist
   * `farben` gesetzt, gewinnt es.
   */
  farben?: { links?: string; oben?: string; rechts?: string; unten?: string };
  /** Radius je Ecke (ab oben links im Uhrzeigersinn); gewinnt gegen `radius`. */
  radien?: { ol?: number; or?: number; ur?: number; ul?: number };
  muster?: "linie" | "punkte" | "striche";
}

/** Schlagschatten. `innen` macht daraus einen nach innen geworfenen Schatten. */
export interface VisuSchatten {
  x?: number;
  y?: number;
  unschaerfe?: number;
  ueberstand?: number;
  farbe?: string;
  innen?: boolean;
}
export interface VisuDesign {
  hintergrund?: string;
  text?: string;
  /** Schriftfamilie aus visu/dateien/ (ADR-0015 D-2: Name, nie ein Pfad). */
  schriftart?: string;
  /** Horizontale Textausrichtung. Fehlt sie, entscheidet der Renderer. */
  textausrichtung?: "links" | "zentriert" | "rechts" | "blocksatz";
  icon?: string;
  /** Hintergrundbild aus visu/dateien/ (ADR-0015 D-2: Name, nie ein Pfad). */
  bild?: string;
  /**
   * Skalierung des Hintergrundbilds. "flaeche" fuellt das Element (verzerrt),
   * "decken"/"einpassen" wahren das Seitenverhaeltnis, "original" laesst es
   * unskaliert, "masse" nimmt bildMasse. Fehlt die Angabe, gilt "flaeche" —
   * das ist der Standard des Altsystems, und ein unskaliert gekacheltes Bild
   * ist praktisch immer falsch.
   */
  bildGroesse?: "original" | "masse" | "flaeche" | "decken" | "einpassen";
  bildMasse?: { b: number; h: number };
  /**
   * Beschriftung, die den `text` des Elements ERSETZT, solange dieses Design
   * gilt. Gedacht fuer wertabhaengige Designs (`design_je_wert`): ein Schalter
   * zeigt „Aus", im Zustand An aber „An". Entweder-oder, nie beides — ist sie
   * gesetzt, kommt der Elementtext nicht zur Anzeige.
   */
  beschriftung?: string;
  schriftgroesse?: number;
  schriftstil?: "normal" | "kursiv";
  schriftstaerke?: "normal" | "fett";
  deckkraft?: number;
  /** Innenabstand in Pixeln. */
  polsterung?: number;
  /** Verschiebung gegenueber der Platzierung, in Pixeln. */
  versatz?: { x?: number; y?: number };
  rand?: VisuRand;
  schatten?: VisuSchatten;
  textschatten?: Omit<VisuSchatten, "ueberstand" | "innen">;
}
export type VisuDesigns = Record<string, VisuDesign>;

const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true });
export const validateVisuSeite: ValidateFunction<VisuSeite> =
  ajv.compile<VisuSeite>(visuSeiteSchema);
export const validateVisuDesigns: ValidateFunction<VisuDesigns> =
  ajv.compile<VisuDesigns>(visuDesignsSchema);

export { visuSeiteSchema, visuDesignsSchema };

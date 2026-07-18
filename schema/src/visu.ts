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
export type VisuWidget = "slider" | "diagramm";

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
  | { art: "umschalten" }
  | { setze: string | number | boolean | null }
  | { seite: string }
  | { popup: string };
export interface VisuElement {
  preset?: VisuPreset;
  widget?: VisuWidget;
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
export interface VisuSeite {
  typ: VisuSeitenTyp;
  name: string;
  basis: string;
  groessen: Record<string, VisuGroesse>;
  gruppen?: Record<string, { name: string; ebene?: number }>;
  elemente: Record<string, VisuElement>;
  notizen?: string;
}
export interface VisuRand {
  staerke?: number;
  farbe?: string;
  radius?: number;
}
export interface VisuDesign {
  hintergrund?: string;
  text?: string;
  icon?: string;
  schriftgroesse?: number;
  deckkraft?: number;
  rand?: VisuRand;
}
export type VisuDesigns = Record<string, VisuDesign>;

const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true });
export const validateVisuSeite: ValidateFunction<VisuSeite> =
  ajv.compile<VisuSeite>(visuSeiteSchema);
export const validateVisuDesigns: ValidateFunction<VisuDesigns> =
  ajv.compile<VisuDesigns>(visuDesignsSchema);

export { visuSeiteSchema, visuDesignsSchema };

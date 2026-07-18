import type { WertFormat } from "@fachwerk/schema";
import { kompiliereTemplate, type WertLookup } from "./ausdruck.ts";

/** Löst die Kaskade feldweise auf; Eingaben werden nicht verändert. */
export function effektivesFormat(
  datenpunkt?: WertFormat,
  element?: WertFormat,
  placement?: WertFormat,
): WertFormat {
  return { ...datenpunkt, ...element, ...placement };
}

function gruppiere(ganz: string): string {
  const vorzeichen = ganz.startsWith("-") ? "-" : "";
  const ziffern = vorzeichen ? ganz.slice(1) : ganz;
  return vorzeichen + ziffern.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function kuerze(text: string, max: number, ellipsis: string): string {
  if (text.length <= max) return text;
  if (ellipsis.length >= max) return ellipsis.slice(0, max);
  return text.slice(0, max - ellipsis.length) + ellipsis;
}

/** Formatiert ausschließlich für die Anzeige; der übergebene Wert bleibt unangetastet. */
export function formatiereWert(wert: unknown, format: WertFormat = {}, lookup?: WertLookup): string {
  if (format.template !== undefined) return kompiliereTemplate(format.template).auswerten(wert, lookup).text;
  if (wert === null || wert === undefined) return format.leerwert ?? "";

  let text: string;
  if (typeof wert === "boolean" && format.bool_map) {
    text = wert ? format.bool_map.wahr : format.bool_map.falsch;
  } else if (format.enum_map) {
    text = format.enum_map[String(wert)] ?? format.fallback ?? String(wert);
  } else if (typeof wert === "number") {
    const anzeige = wert * (format.skalierung ?? 1) + (format.offset ?? 0);
    const stellen = format.dezimalstellen;
    text = stellen === undefined ? String(anzeige) : anzeige.toFixed(stellen);
    const [ganz = "", nachkomma] = text.split(".");
    if (format.tausendertrenner) text = gruppiere(ganz) + (nachkomma === undefined ? "" : `,${nachkomma}`);
  } else {
    text = String(wert);
  }

  if (format.max_laenge !== undefined) text = kuerze(text, format.max_laenge, format.ellipsis ?? "...");
  return `${format.praefix ?? ""}${text}${format.suffix ?? ""}${format.einheit ? ` ${format.einheit}` : ""}`;
}

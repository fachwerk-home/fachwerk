/**
 * Payload ↔ Datenpunkt-Wert. MQTT-Payloads sind Text; die Interpretation
 * bestimmt der Datenpunkt-Typ. Unverständliches wird abgelehnt (null) —
 * nie stilles Verbiegen (SPEC-001). Für JSON-Payloads (zigbee2mqtt & Co.)
 * ist der EXTRACT-Baustein zuständig, nicht der Treiber.
 */
import type { Wert } from "@fachwerk/core";

const WAHR = new Set(["1", "true", "on", "ein", "an"]);
const FALSCH = new Set(["0", "false", "off", "aus"]);

export function textZuWert(typ: "bool" | "zahl" | "text", text: string): Wert | null {
  if (typ === "text") return text;
  const t = text.trim().toLowerCase();
  if (typ === "bool") {
    if (WAHR.has(t)) return true;
    if (FALSCH.has(t)) return false;
    return null;
  }
  const n = Number(t);
  return t !== "" && Number.isFinite(n) ? n : null;
}

export function wertZuText(wert: Wert): string {
  if (typeof wert === "boolean") return wert ? "1" : "0";
  return String(wert);
}

import type { VisuAktion, VisuElement } from "../../../schema/src/visu.ts";
import type { DatenpunktSicht, Wert } from "../lib/api.ts";

export type BedienAktion =
  | { art: "setzen"; wert: Wert }
  | { art: "nicht_moeglich"; grund: string };

export function schreibAktion(element: VisuElement): VisuAktion | undefined {
  return Object.values(element.aktionen ?? {}).find(
    (aktion) => "setze" in aktion || ("art" in aktion && aktion.art === "umschalten"),
  );
}

export function wertAusAktion(
  element: VisuElement,
  datenpunkt: DatenpunktSicht | undefined,
  statusWert: unknown,
): BedienAktion {
  if (!datenpunkt) return { art: "nicht_moeglich", grund: "Datenpunkt nicht geladen" };
  if (datenpunkt.protected) return { art: "nicht_moeglich", grund: "Geschützter Datenpunkt" };

  const aktion = schreibAktion(element);
  if (aktion && "setze" in aktion) {
    if (aktion.setze === null) return { art: "nicht_moeglich", grund: "Null-Werte sind im Schreibpfad nicht erlaubt" };
    return { art: "setzen", wert: aktion.setze };
  }

  if (aktion && "art" in aktion && aktion.art === "umschalten") {
    if (datenpunkt.typ === "bool") return { art: "setzen", wert: statusWert !== true };
    if (datenpunkt.typ === "zahl") return { art: "setzen", wert: statusWert === 0 ? 1 : 0 };
    return { art: "nicht_moeglich", grund: "Text-Datenpunkte können nicht umgeschaltet werden" };
  }

  if (element.preset === "schalter") {
    if (datenpunkt.typ === "bool") return { art: "setzen", wert: statusWert !== true };
    if (datenpunkt.typ === "zahl") return { art: "setzen", wert: statusWert === 0 ? 1 : 0 };
  }

  if (element.preset === "taster") {
    if (datenpunkt.typ === "bool") return { art: "setzen", wert: true };
    if (datenpunkt.typ === "zahl") return { art: "setzen", wert: 1 };
    return { art: "setzen", wert: "1" };
  }

  return { art: "nicht_moeglich", grund: "Keine Schreibaktion definiert" };
}

export function wertPasstZumDatenpunkt(wert: Wert, datenpunkt: DatenpunktSicht): boolean {
  return (datenpunkt.typ === "bool" && typeof wert === "boolean")
    || (datenpunkt.typ === "zahl" && typeof wert === "number" && Number.isFinite(wert))
    || (datenpunkt.typ === "text" && typeof wert === "string");
}

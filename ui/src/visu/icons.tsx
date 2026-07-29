import type { ComponentChildren } from "preact";
import type { VisuSymbolName } from "../../../schema/src/visu.ts";

export const VISU_SYMBOL_NAMEN = [
  "alarm",
  "anwesenheit",
  "diagramm",
  "einstellungen",
  "etage",
  "fenster_gekippt",
  "fenster_offen",
  "fenster_zu",
  "glocke",
  "haus",
  "heizung",
  "info",
  "jalousie",
  "licht_an",
  "licht_aus",
  "licht_dimmer",
  "luftfeuchte",
  "luefter",
  "minus",
  "mond",
  "pfeil_hoch",
  "pfeil_links",
  "pfeil_rechts",
  "pfeil_runter",
  "plus",
  "regen",
  "rollo_ab",
  "rollo_auf",
  "rollo_position",
  "rollo_stopp",
  "raum",
  "schloss_offen",
  "schloss_zu",
  "szene",
  "sonne",
  "steckdose",
  "temperatur",
  "thermostat",
  "timer",
  "tuer_offen",
  "tuer_zu",
  "uhr",
  "wind",
  "wolken",
] as const satisfies readonly VisuSymbolName[];

export const VISU_SYMBOL_LABELS: Record<VisuSymbolName, string> = {
  alarm: "Alarm",
  anwesenheit: "Anwesenheit",
  diagramm: "Diagramm",
  einstellungen: "Einstellungen",
  etage: "Etage",
  fenster_gekippt: "Fenster gekippt",
  fenster_offen: "Fenster offen",
  fenster_zu: "Fenster zu",
  glocke: "Glocke",
  haus: "Haus",
  heizung: "Heizung",
  info: "Info",
  jalousie: "Jalousie",
  licht_an: "Licht an",
  licht_aus: "Licht aus",
  licht_dimmer: "Licht dimmen",
  luftfeuchte: "Luftfeuchte",
  luefter: "Lüfter",
  minus: "Minus",
  mond: "Mond",
  pfeil_hoch: "Pfeil hoch",
  pfeil_links: "Pfeil links",
  pfeil_rechts: "Pfeil rechts",
  pfeil_runter: "Pfeil runter",
  plus: "Plus",
  regen: "Regen",
  rollo_ab: "Rollo ab",
  rollo_auf: "Rollo auf",
  rollo_position: "Rollo Position",
  rollo_stopp: "Rollo stopp",
  raum: "Raum",
  schloss_offen: "Schloss offen",
  schloss_zu: "Schloss zu",
  szene: "Szene",
  sonne: "Sonne",
  steckdose: "Steckdose",
  temperatur: "Temperatur",
  thermostat: "Thermostat",
  timer: "Timer",
  tuer_offen: "Tür offen",
  tuer_zu: "Tür zu",
  uhr: "Uhr",
  wind: "Wind",
  wolken: "Wolken",
};

const P: Record<VisuSymbolName, string[]> = {
  alarm: ["M12 3 3 21h18L12 3Z", "M12 9v5", "M12 18h.01"],
  anwesenheit: ["M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M4 21a8 8 0 0 1 16 0"],
  diagramm: ["M4 20V4", "M4 20h16", "M8 16v-5", "M12 16V8", "M16 16v-9"],
  einstellungen: ["M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z", "M12 2v3", "M12 19v3", "M4.9 4.9l2.1 2.1", "M17 17l2.1 2.1", "M2 12h3", "M19 12h3", "M4.9 19.1 7 17", "M17 7l2.1-2.1"],
  etage: ["M5 21V3h14v18", "M8 7h3", "M13 7h3", "M8 11h3", "M13 11h3", "M8 15h3", "M13 15h3"],
  fenster_gekippt: ["M5 4h14v16H5V4Z", "M8 7l8 2v8l-8-2V7Z"],
  fenster_offen: ["M5 4h14v16H5V4Z", "M9 7l7-3v16l-7-3V7Z"],
  fenster_zu: ["M5 4h14v16H5V4Z", "M12 4v16", "M5 12h14"],
  glocke: ["M6 17h12", "M8 17V10a4 4 0 0 1 8 0v7", "M10 20h4"],
  haus: ["M3 11l9-8 9 8", "M5 10v10h14V10", "M9 20v-6h6v6"],
  heizung: ["M7 4v16", "M12 4v16", "M17 4v16", "M5 7h14", "M5 12h14", "M5 17h14"],
  info: ["M12 11v6", "M12 7h.01", "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z"],
  jalousie: ["M4 5h16", "M5 9h14", "M6 13h12", "M7 17h10", "M12 5v14"],
  licht_an: ["M9 18h6", "M10 21h4", "M8 10a4 4 0 1 1 8 0c0 2-2 3-2 6h-4c0-3-2-4-2-6Z", "M12 1v3", "M4 10H1", "M23 10h-3", "M5 3l2 2", "M19 3l-2 2"],
  licht_aus: ["M9 18h6", "M10 21h4", "M8 10a4 4 0 0 1 6.8-2.8", "M16 10c0 2-2 3-2 6h-4c0-1.6-.6-2.7-1.2-3.6", "M3 3l18 18"],
  licht_dimmer: ["M9 18h6", "M10 21h4", "M8 10a4 4 0 1 1 8 0c0 2-2 3-2 6h-4c0-3-2-4-2-6Z", "M3 14h3", "M18 14h3", "M4 19l2-2", "M18 17l2 2"],
  luftfeuchte: ["M12 3C8 8 6 11 6 14a6 6 0 0 0 12 0c0-3-2-6-6-11Z", "M9 14a3 3 0 0 0 3 3"],
  luefter: ["M12 12m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0", "M12 10c1-5 7-5 7-1 0 2-2 3-5 3", "M14 13c4 3 1 8-3 6-2-1-2-4 0-6", "M10 13c-5 2-8-3-5-6 2-2 5-1 7 3"],
  minus: ["M5 12h14"],
  mond: ["M20 15.5A8 8 0 0 1 8.5 4 7 7 0 1 0 20 15.5Z"],
  pfeil_hoch: ["M12 20V4", "M5 11l7-7 7 7"],
  pfeil_links: ["M20 12H4", "M11 5l-7 7 7 7"],
  pfeil_rechts: ["M4 12h16", "M13 5l7 7-7 7"],
  pfeil_runter: ["M12 4v16", "M5 13l7 7 7-7"],
  plus: ["M12 5v14", "M5 12h14"],
  regen: ["M8 19l-1 2", "M13 19l-1 2", "M18 19l-1 2", "M7 16h11a4 4 0 0 0 0-8 6 6 0 0 0-11-2 5 5 0 0 0 0 10Z"],
  rollo_ab: ["M5 4h14", "M7 7h10v8H7V7Z", "M12 15v6", "M9 18l3 3 3-3"],
  rollo_auf: ["M5 4h14", "M7 7h10v8H7V7Z", "M12 21v-6", "M9 18l3-3 3 3"],
  rollo_position: ["M5 4h14", "M7 7h10v10H7V7Z", "M7 12h10", "M20 8v8", "M18 10l2-2 2 2", "M18 14l2 2 2-2"],
  rollo_stopp: ["M5 4h14", "M7 7h10v10H7V7Z", "M10 10h4v4h-4z"],
  raum: ["M4 5h16v14H4V5Z", "M8 9h8v6H8V9Z"],
  schloss_offen: ["M7 11h11v10H7V11Z", "M10 11V8a4 4 0 0 1 7-2"],
  schloss_zu: ["M7 11h10v10H7V11Z", "M9 11V8a3 3 0 0 1 6 0v3"],
  szene: ["M4 6h16", "M7 6v12", "M17 6v12", "M9 12h6", "M5 18h14"],
  sonne: ["M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z", "M12 1v3", "M12 20v3", "M4.2 4.2l2.1 2.1", "M17.7 17.7l2.1 2.1", "M1 12h3", "M20 12h3", "M4.2 19.8l2.1-2.1", "M17.7 6.3l2.1-2.1"],
  steckdose: ["M8 11h8", "M9 11v3a3 3 0 0 0 6 0v-3", "M10 7v4", "M14 7v4", "M12 17v4"],
  temperatur: ["M10 14.5V5a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0Z", "M12 15v-5"],
  thermostat: ["M4 12a8 8 0 1 1 16 0", "M12 12l4-4", "M8 18h8"],
  timer: ["M12 8v5l3 2", "M9 2h6", "M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z"],
  tuer_offen: ["M6 4h10v16H6V4Z", "M10 6l8 2v12l-8-2V6Z", "M14 13h.01"],
  tuer_zu: ["M7 4h10v16H7V4Z", "M14 12h.01"],
  uhr: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z", "M12 6v6l4 2"],
  wind: ["M3 8h12a3 3 0 1 0-3-3", "M3 12h17", "M3 16h10a3 3 0 1 1-3 3"],
  wolken: ["M7 17h11a4 4 0 0 0 0-8 6 6 0 0 0-11-2 5 5 0 0 0 0 10Z"],
};

export function visuSymbolVorhanden(name: string | undefined): name is VisuSymbolName {
  return Boolean(name && (VISU_SYMBOL_NAMEN as readonly string[]).includes(name));
}

export function VisuIcon({ name, dekorativ = false }: { name: VisuSymbolName; dekorativ?: boolean }) {
  const label = VISU_SYMBOL_LABELS[name];
  return (
    <svg
      class="visu-svg-icon"
      viewBox="0 0 24 24"
      aria-hidden={dekorativ ? "true" : undefined}
      role={dekorativ ? undefined : "img"}
      aria-label={dekorativ ? undefined : label}
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      {P[name].map((d) => <path key={d} d={d} />) as ComponentChildren}
    </svg>
  );
}

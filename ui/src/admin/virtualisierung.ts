export interface FensterEingabe {
  anzahl: number;
  scrollTop: number;
  viewportHoehe: number;
  zeilenHoehe: number;
  puffer?: number;
}

export interface Fenster {
  start: number;
  ende: number;
  oben: number;
  unten: number;
}

/** Berechnet den sichtbaren Ausschnitt einer Liste mit fester Zeilenhöhe. */
export function berechneFenster({
  anzahl,
  scrollTop,
  viewportHoehe,
  zeilenHoehe,
  puffer = 8,
}: FensterEingabe): Fenster {
  if (anzahl <= 0 || zeilenHoehe <= 0 || viewportHoehe <= 0) {
    return { start: 0, ende: 0, oben: 0, unten: 0 };
  }
  const erster = Math.floor(Math.max(0, scrollTop) / zeilenHoehe);
  const start = Math.max(0, erster - puffer);
  const sichtbar = Math.ceil(viewportHoehe / zeilenHoehe);
  const ende = Math.min(anzahl, erster + sichtbar + puffer);
  return {
    start,
    ende,
    oben: start * zeilenHoehe,
    unten: Math.max(0, (anzahl - ende) * zeilenHoehe),
  };
}

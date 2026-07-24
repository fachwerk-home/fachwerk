/**
 * Minimaler Tar-Leser (POSIX ustar) — nur so viel, wie der Visu-Import
 * braucht: Dateien aus einem unkomprimierten Archiv holen.
 *
 * Eigenimplementierung statt Abhaengigkeit: Node bringt kein Tar mit, das
 * Format ist aber trivial (512-Byte-Kopf, 512-Byte-Bloecke), und der Kern
 * haelt seine Null-Dependency-Linie auch bei KNX, MQTT und WebSocket.
 *
 * Bewusst NICHT unterstuetzt: gzip (.tar.gz), Long-Name-Erweiterungen ueber
 * 100 Zeichen, Hardlinks. Taucht so etwas auf, wird die Datei uebersprungen —
 * geraten wird nicht.
 */

export interface TarEintrag {
  name: string;
  inhalt: Buffer;
}

/** Oktale Kopfzahl lesen; tolerant gegenueber Leerzeichen und NUL. */
function oktal(b: Buffer, offset: number, laenge: number): number {
  const roh = b.toString("ascii", offset, offset + laenge).replace(/\0.*$/, "").trim();
  if (roh === "") return 0;
  const n = parseInt(roh, 8);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Liest alle regulaeren Dateien aus einem Tar-Puffer. Verzeichnisse und
 * Sondereintraege werden uebergangen; Pfade werden auf ihren Basisnamen
 * reduziert (ein Archiv soll nie ausserhalb des Ziels schreiben koennen).
 */
export function leseTar(daten: Buffer): TarEintrag[] {
  const eintraege: TarEintrag[] = [];
  let pos = 0;
  while (pos + 512 <= daten.length) {
    const kopf = daten.subarray(pos, pos + 512);
    // Zwei Nullbloecke markieren das Ende; ein einzelner leerer Kopf reicht uns.
    if (kopf.every((b) => b === 0)) break;

    const name = kopf.toString("utf8", 0, 100).replace(/\0.*$/, "").trim();
    const groesse = oktal(kopf, 124, 12);
    const typ = String.fromCharCode(kopf[156] ?? 0);
    pos += 512;

    // Typ "0" bzw. NUL = regulaere Datei. Alles andere ueberspringen.
    if ((typ === "0" || typ === "\0") && name !== "") {
      // Pfadanteile verwerfen: nur der Dateiname zaehlt (kein Ausbruch).
      const basis = name.split(/[/\\]/).pop() ?? name;
      if (basis !== "" && !basis.startsWith(".")) {
        eintraege.push({ name: basis, inhalt: daten.subarray(pos, pos + groesse) });
      }
    }
    // Nutzdaten sind auf volle 512er-Bloecke aufgefuellt.
    pos += Math.ceil(groesse / 512) * 512;
  }
  return eintraege;
}

/** Sieht der Puffer nach einem Tar aus? (ustar-Kennung im ersten Kopf) */
export function istTar(daten: Buffer): boolean {
  if (daten.length < 512) return false;
  return daten.toString("ascii", 257, 262) === "ustar";
}

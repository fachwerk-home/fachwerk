/** KNX-Gruppenadressen: dreistufige Notation a/b/c ↔ 16-Bit-Wert. */

export function gaZuZahl(ga: string): number {
  const teile = ga.split("/");
  if (teile.length !== 3) throw new Error(`ungültige Gruppenadresse „${ga}"`);
  const [h, m, u] = teile.map(Number) as [number, number, number];
  if (
    !Number.isInteger(h) || h < 0 || h > 31 ||
    !Number.isInteger(m) || m < 0 || m > 7 ||
    !Number.isInteger(u) || u < 0 || u > 255
  ) {
    throw new Error(`ungültige Gruppenadresse „${ga}"`);
  }
  return (h << 11) | (m << 8) | u;
}

export function zahlZuGa(n: number): string {
  return `${(n >> 11) & 0x1f}/${(n >> 8) & 0x07}/${n & 0xff}`;
}

/**
 * Individualadresse (physikalische Adresse) als Text: Bereich.Linie.Gerät.
 * Der Router weist jedem Tunnel eine eigene IA aus seinem Pool zu.
 */
export function zahlZuIa(n: number): string {
  return `${(n >> 12) & 0x0f}.${(n >> 8) & 0x0f}.${n & 0xff}`;
}

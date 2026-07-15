/**
 * DPT-Codecs (P4-4): Übersetzen zwischen Fachwerk-Werten und KNX-APDUs.
 * Skeleton-Auswahl der drei häufigsten Transporttypen:
 *   1.001 Schalten (Bool, 6-Bit im APCI-Byte)
 *   5.001 Prozent  (1 Byte, 0..255 ≙ 0..100 %)
 *   9.001 Temperatur (2-Byte-KNX-Float: 0,01 · M · 2^E)
 */
export type Dpt = "1.001" | "5.001" | "9.001";

export type Apdu =
  | { art: "klein"; wert: number } // 6 Bit, im APCI-Byte kodiert
  | { art: "bytes"; bytes: Uint8Array };

export function encodeDpt(dpt: Dpt, wert: boolean | number): Apdu {
  switch (dpt) {
    case "1.001":
      return { art: "klein", wert: wert ? 1 : 0 };
    case "5.001": {
      const prozent = Math.min(100, Math.max(0, Number(wert)));
      return { art: "bytes", bytes: Uint8Array.of(Math.round((prozent * 255) / 100)) };
    }
    case "9.001": {
      let zahl = Math.round(Number(wert) * 100); // Auflösung 0,01
      let exponent = 0;
      while (zahl > 2047 || zahl < -2048) {
        zahl = Math.floor(zahl / 2);
        exponent++;
        if (exponent > 15) throw new Error(`Wert außerhalb DPT 9.001: ${wert}`);
      }
      const mantisse = zahl & 0x7ff;
      const vorzeichen = zahl < 0 ? 0x80 : 0;
      return {
        art: "bytes",
        bytes: Uint8Array.of(vorzeichen | (exponent << 3) | (mantisse >> 8), mantisse & 0xff),
      };
    }
  }
}

export function decodeDpt(dpt: Dpt, apdu: Apdu): boolean | number {
  switch (dpt) {
    case "1.001":
      return apdu.art === "klein" ? apdu.wert !== 0 : apdu.bytes[0] !== 0;
    case "5.001": {
      const roh = apdu.art === "klein" ? apdu.wert : (apdu.bytes[0] ?? 0);
      return (roh * 100) / 255;
    }
    case "9.001": {
      if (apdu.art === "klein" || apdu.bytes.length < 2) {
        throw new Error("DPT 9.001 braucht 2 Byte");
      }
      const [hoch, tief] = [apdu.bytes[0]!, apdu.bytes[1]!];
      const exponent = (hoch >> 3) & 0x0f;
      let mantisse = ((hoch & 0x07) << 8) | tief;
      if (hoch & 0x80) mantisse -= 2048; // Zweierkomplement (11 Bit + Vorzeichen)
      return 0.01 * mantisse * 2 ** exponent;
    }
  }
}

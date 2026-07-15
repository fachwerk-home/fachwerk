import { describe, expect, it } from "vitest";
import { decodeDpt, encodeDpt, type Dpt } from "./dpt.ts";

describe("DPT 1.001 (Schalten)", () => {
  it("kodiert/dekodiert Bool im 6-Bit-Feld", () => {
    expect(encodeDpt("1.001", true)).toEqual({ art: "klein", wert: 1 });
    expect(encodeDpt("1.001", false)).toEqual({ art: "klein", wert: 0 });
    expect(decodeDpt("1.001", { art: "klein", wert: 1 })).toBe(true);
    expect(decodeDpt("1.001", { art: "klein", wert: 0 })).toBe(false);
  });
});

describe("DPT 5.001 (Prozent)", () => {
  it("bekannte Stützpunkte", () => {
    expect(encodeDpt("5.001", 0)).toEqual({ art: "bytes", bytes: Uint8Array.of(0) });
    expect(encodeDpt("5.001", 100)).toEqual({ art: "bytes", bytes: Uint8Array.of(255) });
    expect(decodeDpt("5.001", { art: "bytes", bytes: Uint8Array.of(255) })).toBe(100);
  });

  it("Roundtrip innerhalb der Byte-Auflösung (±0,2 %)", () => {
    for (const p of [1, 25, 50, 63.5, 99]) {
      const enc = encodeDpt("5.001", p);
      const rueck = decodeDpt("5.001", enc) as number;
      expect(Math.abs(rueck - p)).toBeLessThan(0.2);
    }
  });

  it("klemmt außerhalb 0..100", () => {
    expect(encodeDpt("5.001", 140)).toEqual({ art: "bytes", bytes: Uint8Array.of(255) });
    expect(encodeDpt("5.001", -5)).toEqual({ art: "bytes", bytes: Uint8Array.of(0) });
  });
});

describe("DPT 9.001 (Temperatur, KNX-Float16)", () => {
  it("bekannter Vektor: 21,5 °C = 0x0C33", () => {
    expect(encodeDpt("9.001", 21.5)).toEqual({
      art: "bytes",
      bytes: Uint8Array.of(0x0c, 0x33),
    });
    expect(decodeDpt("9.001", { art: "bytes", bytes: Uint8Array.of(0x0c, 0x33) })).toBe(21.5);
  });

  it("Roundtrip über den Wertebereich (Auflösung wächst mit Exponent)", () => {
    for (const t of [0, 0.01, -0.5, 20.48, -30, 100.32, 670_433.28, -671_088.64]) {
      const enc = encodeDpt("9.001", t);
      const rueck = decodeDpt("9.001", enc) as number;
      const aufloesung = Math.max(0.01, Math.abs(t) / 2048);
      expect(Math.abs(rueck - t)).toBeLessThanOrEqual(aufloesung + 1e-9);
    }
  });

  it("negative Werte exakt an der Auflösungsgrenze", () => {
    expect(decodeDpt("9.001", encodeDpt("9.001", -20.48))).toBe(-20.48);
  });

  it("lehnt Überlauf ab", () => {
    expect(() => encodeDpt("9.001", 10_000_000)).toThrow(/außerhalb/);
  });
});

describe("unbekannte GA bleibt roh (Treiber-Vertrag)", () => {
  it("Typ-Sicherheit: alle Dpt-Werte deklariert", () => {
    const alle: Dpt[] = ["1.001", "5.001", "9.001"];
    for (const d of alle) expect(encodeDpt(d, 1)).toBeDefined();
  });
});

import { describe, expect, it } from "vitest";
import { BildPuffer } from "./batching.ts";

describe("BildPuffer", () => {
  it("bündelt Dauerfeuer und behält je Schlüssel den letzten Wert", () => {
    const puffer = new BildPuffer<number>();
    for (let i = 0; i < 5_000; i++) puffer.schreibe(`dp.${i % 1_000}`, i);

    expect(puffer.anzahl).toBe(1_000);
    const bild = puffer.entleere();
    expect(bild.get("dp.0")).toBe(4_000);
    expect(bild.get("dp.999")).toBe(4_999);
    expect(puffer.anzahl).toBe(0);
  });
});

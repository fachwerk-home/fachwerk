import { expect, it } from "vitest";
import { Schreibbremse } from "./schreibbremse.ts";

it("laesst bis zur Grenze durch und bremst danach", () => {
  const bremse = new Schreibbremse({ grenze: 3, fensterMs: 10_000, jetzt: () => 0 });
  expect([bremse.versuche(), bremse.versuche(), bremse.versuche()]).toEqual([true, true, true]);
  expect(bremse.versuche()).toBe(false);
});

it("das Fenster gleitet: nach Ablauf ist wieder Platz", () => {
  let t = 0;
  const bremse = new Schreibbremse({ grenze: 2, fensterMs: 10_000, jetzt: () => t });
  expect(bremse.versuche()).toBe(true); // t=0
  t = 5000;
  expect(bremse.versuche()).toBe(true); // t=5000
  expect(bremse.versuche()).toBe(false); // beide noch im Fenster
  t = 10_001; // der erste Versuch ist jetzt aus dem Fenster gefallen
  expect(bremse.versuche()).toBe(true);
  expect(bremse.versuche()).toBe(false); // der von t=5000 zaehlt noch
});

it("meldet Grenze und Fenster fuer die Fehlermeldung", () => {
  const bremse = new Schreibbremse({ grenze: 30 });
  expect(bremse.grenze).toBe(30);
  expect(bremse.fensterS).toBe(10);
});

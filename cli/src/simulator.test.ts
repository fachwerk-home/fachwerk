/**
 * Der Simulator setzt Werte an einer LAUFENDEN Anlage. Getestet wird deshalb
 * das, was ohne Netz pruefbar ist: die Auswertung der Kommandozeile und die
 * Wertfolge. Beides hat schon Schaden angerichtet.
 */
import { expect, test, vi } from "vitest";
import { naechsterWert, simulator } from "./simulator.ts";

test("unbekannte Option bricht ab, statt stumm etwas anderes zu tun", async () => {
  // Eine aeltere Fassung ohne --setze hat die Option wortlos verschluckt und
  // stattdessen unbegrenzt Werte durchgewandert. Ein Lauf, den niemand
  // bestellt hat, ist schlimmer als eine Fehlermeldung.
  const fehler = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    expect(await simulator(["--setz", "1"])).toBe(2);
    expect(fehler.mock.calls.join(" ")).toContain("--setz");
  } finally {
    fehler.mockRestore();
  }
});

test("Option ohne Wert bricht ab", async () => {
  const fehler = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    expect(await simulator(["--setze", "--trocken"])).toBe(2);
    expect(fehler.mock.calls.join(" ")).toContain("braucht einen Wert");
  } finally {
    fehler.mockRestore();
  }
});

test("--help geht durch, ohne etwas zu schreiben", async () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    expect(await simulator(["--help"])).toBe(0);
  } finally {
    log.mockRestore();
  }
});

test("naechsterWert kippt bool und laeuft die Zahlenstufen hoch", () => {
  expect(naechsterWert({ typ: "bool", wert: false })).toBe(true);
  expect(naechsterWert({ typ: "bool", wert: true })).toBe(false);
  expect(naechsterWert({ typ: "zahl", wert: 0 })).toBe(1);
  expect(naechsterWert({ typ: "zahl", wert: 255 })).toBe(0);
});

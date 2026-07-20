import { expect, it } from "vitest";
import { pruefeGewerkPfad } from "./dateien.ts";

const ok = (p: string): string => {
  const e = pruefeGewerkPfad(p);
  if (!e.ok) throw new Error(`unerwartet abgelehnt: ${p} (${e.grund})`);
  return e.rel;
};
const abgelehnt = (p: unknown): boolean => !pruefeGewerkPfad(p).ok;

it("laesst die erlaubten Gewerk-Dateien durch", () => {
  expect(ok("gewerk.yaml")).toBe("gewerk.yaml");
  expect(ok("datenpunkte/wohnen.yaml")).toBe("datenpunkte/wohnen.yaml");
  expect(ok("logik/flur.yaml")).toBe("logik/flur.yaml");
  expect(ok("archiv/klima.yaml")).toBe("archiv/klima.yaml");
  expect(ok("visu/designs.yaml")).toBe("visu/designs.yaml");
  expect(ok("visu/seiten/wohnzimmer.yaml")).toBe("visu/seiten/wohnzimmer.yaml");
  // Normalisierung: ./ und \ sind zulaessig, das Ergebnis ist einheitlich.
  expect(ok("./logik/flur.yaml")).toBe("logik/flur.yaml");
  expect(ok("visu\\seiten\\a.yaml")).toBe("visu/seiten/a.yaml");
});

it("wehrt Pfad-Traversal in allen ueblichen Schreibweisen ab", () => {
  expect(abgelehnt("../../etc/passwd")).toBe(true);
  expect(abgelehnt("logik/../../../etc/passwd")).toBe(true);
  expect(abgelehnt("logik/..\\..\\..\\windows\\system.ini")).toBe(true);
  expect(abgelehnt("/etc/passwd")).toBe(true);
  expect(abgelehnt("C:/Windows/system.ini")).toBe(true);
  expect(abgelehnt("//server/freigabe/x.yaml")).toBe(true);
  expect(abgelehnt("logik/%2e%2e/%2e%2e/passwd")).toBe(true);
  expect(abgelehnt("logik/flur.yaml\u0000.png")).toBe(true);
});

it("laesst nur bekannte Ordner und .yaml zu", () => {
  expect(abgelehnt("beliebig/x.yaml")).toBe(true);
  expect(abgelehnt("logik/tief/x.yaml")).toBe(true);
  expect(abgelehnt("logik/flur.txt")).toBe(true);
  expect(abgelehnt("logik/.versteckt.yaml")).toBe(true);
  // Im Wurzelverzeichnis nur gewerk.yaml — nicht etwa .env oder Dockerfile.
  expect(abgelehnt("beliebig.yaml")).toBe(true);
  expect(abgelehnt(".env")).toBe(true);
});

it("erlaubt kein Ausliefern von Code ueber die API", () => {
  // Ein baustein.js per POST waere Code-Ausfuehrung aus dem Netz (ADR-0008).
  expect(abgelehnt("bausteine/boese/baustein.js")).toBe(true);
  expect(abgelehnt("logik/flur.js")).toBe(true);
});

it("weist Unfug im Eingabewert ab, statt ihn zu deuten", () => {
  expect(abgelehnt("")).toBe(true);
  expect(abgelehnt(undefined)).toBe(true);
  expect(abgelehnt(null)).toBe(true);
  expect(abgelehnt(42)).toBe(true);
  expect(abgelehnt({ pfad: "logik/a.yaml" })).toBe(true);
  expect(abgelehnt(`logik/${"a".repeat(300)}.yaml`)).toBe(true);
});

/**
 * Tests des Tar-Lesers — mit selbst gebautem Archiv (kein Fremdmaterial).
 */
import { expect, test } from "vitest";
import { istTar, leseTar } from "./tar.ts";

/** Baut einen ustar-Kopf plus Nutzdaten, wie tar es tut. */
function eintrag(name: string, inhalt: string, typ = "0"): Buffer {
  const kopf = Buffer.alloc(512);
  kopf.write(name, 0, "utf8");
  kopf.write("000644 \0", 100);
  kopf.write(`${inhalt.length.toString(8).padStart(11, "0")} `, 124);
  kopf.write(typ, 156);
  kopf.write("ustar\0", 257);
  kopf.write("00", 263);
  // Pruefsumme: Feld erst mit Leerzeichen fuellen, dann summieren.
  kopf.write("        ", 148);
  let summe = 0;
  for (const b of kopf) summe += b;
  kopf.write(`${summe.toString(8).padStart(6, "0")}\0 `, 148);

  const nutz = Buffer.alloc(Math.ceil(inhalt.length / 512) * 512);
  nutz.write(inhalt, 0, "utf8");
  return Buffer.concat([kopf, nutz]);
}

function archiv(...teile: Buffer[]): Buffer {
  return Buffer.concat([...teile, Buffer.alloc(1024)]); // zwei Nullbloecke
}

test("liest mehrere Dateien mit Inhalt", () => {
  const tar = archiv(eintrag("a.json", '{"x":1}'), eintrag("b.txt", "hallo"));
  const e = leseTar(tar);
  expect(e.map((x) => x.name)).toEqual(["a.json", "b.txt"]);
  expect(e[0]!.inhalt.toString("utf8")).toBe('{"x":1}');
  expect(e[1]!.inhalt.toString("utf8")).toBe("hallo");
});

test("Inhalte über eine Blockgrenze hinweg bleiben vollständig", () => {
  const lang = "x".repeat(1500);
  const e = leseTar(archiv(eintrag("gross.bin", lang)));
  expect(e[0]!.inhalt.toString("utf8")).toBe(lang);
});

test("Verzeichnisse und Sondereinträge werden übergangen", () => {
  const tar = archiv(eintrag("ordner/", "", "5"), eintrag("datei.txt", "da"));
  expect(leseTar(tar).map((x) => x.name)).toEqual(["datei.txt"]);
});

test("Pfadanteile werden verworfen — ein Archiv darf nicht ausbrechen", () => {
  const tar = archiv(eintrag("../../etc/passwd", "boese"), eintrag("unter/ordner/gut.ttf", "ok"));
  const namen = leseTar(tar).map((x) => x.name);
  expect(namen).toEqual(["passwd", "gut.ttf"]);
  expect(namen.some((n) => n.includes("/") || n.includes(".."))).toBe(false);
});

test("istTar erkennt die ustar-Kennung", () => {
  expect(istTar(archiv(eintrag("a", "b")))).toBe(true);
  expect(istTar(Buffer.from('{"kein":"tar"}'))).toBe(false);
});

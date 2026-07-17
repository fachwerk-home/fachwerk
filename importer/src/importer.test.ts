/**
 * Importer-Tests (Stufe 1) — mit SYNTHETISCHEM Dump-Fixture (keine echten
 * Anlagendaten im Repo).
 */
import { describe, expect, it } from "vitest";
import { parseDump } from "./sql-dump.ts";
import { konvertiere, slug } from "./konvertiere.ts";

const FIXTURE = `
CREATE TABLE \`editRoot\` (
  \`id\` bigint(20) NOT NULL,
  \`name\` varchar(200) DEFAULT NULL
) ENGINE=MyISAM;
INSERT INTO \`editRoot\` VALUES (10,'Wohnzimmer'),(11,'Außen & Garten');

CREATE TABLE \`editKo\` (
  \`id\` bigint(20) NOT NULL,
  \`name\` varchar(100) DEFAULT NULL,
  \`folderid\` bigint(20) DEFAULT NULL,
  \`ga\` varchar(11) DEFAULT NULL,
  \`gatyp\` tinyint(3) DEFAULT NULL,
  \`valuetyp\` int(10) DEFAULT NULL,
  \`defaultvalue\` varchar(10000) DEFAULT NULL,
  \`remanent\` tinyint(3) DEFAULT NULL
) ENGINE=MyISAM;
INSERT INTO \`editKo\` VALUES
(5,'Systemzeit',10,'5',2,0,'',0),
(100,'Licht Sofa',10,'1/0/1',1,1,'',0),
(101,'Temperatur Süd, gefühlt',11,'2/3/4',1,9,'21.5',1),
(102,'Merker ''intern''\\nZeile2',10,'55',2,5,'',0),
(103,'Licht Sofa',10,'1/0/9',1,1,NULL,0);

CREATE TABLE \`editLogicPage\` (
  \`id\` bigint(20) NOT NULL,
  \`name\` varchar(200) DEFAULT NULL
) ENGINE=MyISAM;
INSERT INTO \`editLogicPage\` VALUES (1,'Beschattung');

CREATE TABLE \`editLogicElementDef\` (
  \`id\` bigint(20) NOT NULL,
  \`name\` varchar(100) DEFAULT NULL,
  \`title\` varchar(100) DEFAULT NULL
) ENGINE=MyISAM;
INSERT INTO \`editLogicElementDef\` VALUES (17000100,'Und-Gatter',''),(19000512,'Beschattungssteuerung','');

CREATE TABLE \`editLogicElement\` (
  \`id\` bigint(20) NOT NULL,
  \`functionid\` bigint(20) DEFAULT NULL,
  \`pageid\` bigint(20) DEFAULT NULL
) ENGINEMYISAM;
INSERT INTO \`editLogicElement\` VALUES (1,19000512,1),(2,19000512,1),(3,17000100,1);
`;

describe("parseDump", () => {
  it("liest Spalten und Zeilen inkl. Escapes, NULL und Umlauten", () => {
    const t = parseDump(FIXTURE);
    expect(t.get("editKo")!.spalten).toContain("valuetyp");
    expect(t.get("editKo")!.zeilen).toHaveLength(5);
    expect(t.get("editKo")!.zeilen[2]!["name"]).toBe("Temperatur Süd, gefühlt");
    expect(t.get("editKo")!.zeilen[3]!["name"]).toBe("Merker 'intern'\nZeile2");
    expect(t.get("editKo")!.zeilen[4]!["defaultvalue"]).toBeNull();
    expect(t.get("editRoot")!.zeilen[1]!["name"]).toBe("Außen & Garten");
  });
});

describe("slug", () => {
  it("macht sprechende stabile Schlüssel", () => {
    expect(slug("Temperatur Süd, gefühlt")).toBe("temperatur_sued_gefuehlt");
    expect(slug("Außen & Garten")).toBe("aussen_garten");
    expect(slug("42 Grad")).toBe("k_42_grad");
  });
});

describe("konvertiere (Stufe 1)", () => {
  const ergebnis = konvertiere(parseDump(FIXTURE));

  it("KOs → Datenpunkte mit Gruppen aus dem Ordnerbaum", () => {
    const wohnzimmer = ergebnis.datenpunkte.get("wohnzimmer")!;
    expect(wohnzimmer["licht_sofa"]).toMatchObject({
      klasse: "bus",
      treiber: "knx",
      adresse: "1/0/1",
      typ: "bool",
      dpt: "1.001",
    });
    // Duplikatname bekommt Id-Suffix:
    expect(wohnzimmer["licht_sofa_103"]).toMatchObject({ adresse: "1/0/9" });
    // interner Merker (gatyp 2):
    expect(wohnzimmer["merker_intern_zeile2"]).toMatchObject({ klasse: "intern" });
  });

  it("Remanenz + Initialwert + 9.001-Mapping", () => {
    const aussen = ergebnis.datenpunkte.get("aussen_garten")!;
    expect(aussen["temperatur_sued_gefuehlt"]).toMatchObject({
      typ: "zahl",
      dpt: "9.001",
      remanent: true,
      initial: 21.5,
    });
  });

  it("KO-Id → Schlüssel-Karte (für Stufe 2)", () => {
    expect(ergebnis.koZuSchluessel.get(100)).toBe("wohnzimmer.licht_sofa");
  });

  it("System-KO 5 (Systemzeit) → system.zeit für den Uhr-Dienst", () => {
    expect(ergebnis.koZuSchluessel.get(5)).toBe("system.zeit");
    expect(ergebnis.datenpunkte.get("system")!["zeit"]).toMatchObject({
      klasse: "system",
      typ: "text",
    });
  });

  it("Baustein-Bedarfsliste nach Verwendungen sortiert", () => {
    expect(ergebnis.bericht.bausteinBedarf).toEqual([
      { id: 19000512, name: "Beschattungssteuerung", verwendungen: 2 },
      { id: 17000100, name: "Und-Gatter", verwendungen: 1 },
    ]);
    expect(ergebnis.bericht.logik).toMatchObject({ seiten: 1, instanzen: 3 });
  });
});

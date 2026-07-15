/**
 * Stufe-2-Tests: Struktur-Extraktion, Bewertung und Konvertierung EINER
 * Seite — mit synthetischem Dump-Fixture (keine echten Anlagendaten).
 */
import { describe, expect, it } from "vitest";
import { parseDump } from "./sql-dump.ts";
import { konvertiere } from "./konvertiere.ts";
import { extrahiereStruktur, bewerte, konvertiereSeite } from "./logik.ts";

/**
 * Fixture: KO 100 (Taster, bus 1/0/1) → SendByChange (elem 20) → NOT (elem 21)
 *          → Ausgangsbox (elem 22) schreibt auf KO 101 (Licht, bus 1/0/2).
 * Zusätzlich Seite mit unbekanntem LBS (99999999) als Lücke.
 */
const FIXTURE = `
CREATE TABLE \`editRoot\` (\`id\` bigint(20),\`name\` varchar(200));
INSERT INTO \`editRoot\` VALUES (1,'IO');

CREATE TABLE \`editKo\` (\`id\` bigint(20),\`name\` varchar(100),\`folderid\` bigint(20),
  \`ga\` varchar(11),\`gatyp\` tinyint(3),\`valuetyp\` int(10),\`defaultvalue\` varchar(10000),
  \`remanent\` tinyint(3));
INSERT INTO \`editKo\` VALUES
(100,'Taster',1,'1/0/1',1,1,'',0),
(101,'Licht',1,'1/0/2',1,1,'',0);

CREATE TABLE \`editLogicPage\` (\`id\` bigint(20),\`name\` varchar(200));
INSERT INTO \`editLogicPage\` VALUES (1,'Flur'),(2,'Exotik');

CREATE TABLE \`editLogicElement\` (\`id\` bigint(20),\`functionid\` bigint(20),
  \`pageid\` bigint(20),\`name\` varchar(10000));
INSERT INTO \`editLogicElement\` VALUES
(20,13000030,1,''),
(21,13000031,1,''),
(22,12000011,1,''),
(30,99999999,2,'');

CREATE TABLE \`editLogicLink\` (\`id\` bigint(20),\`elementid\` bigint(20),\`eingang\` smallint(5),
  \`linktyp\` tinyint(3),\`linkid\` bigint(20),\`ausgang\` smallint(5),\`value\` varchar(10000));
INSERT INTO \`editLogicLink\` VALUES
(1,20,1,0,100,NULL,NULL),
(2,21,1,1,20,1,NULL),
(3,22,1,1,21,1,NULL),
(5,30,1,2,NULL,NULL,'x');

CREATE TABLE \`editLogicCmdList\` (\`id\` bigint(20),\`targetid\` bigint(20),\`cmd\` tinyint(3),
  \`cmdid1\` bigint(20),\`cmdid2\` bigint(20),\`cmdoption1\` int(11),\`cmdoption2\` int(11),
  \`cmdvalue1\` varchar(10000),\`cmdvalue2\` varchar(10000));
INSERT INTO \`editLogicCmdList\` VALUES (1,22,1,101,0,0,0,NULL,NULL);
`;

const tabellen = parseDump(FIXTURE);
const { koZuSchluessel } = konvertiere(tabellen);

describe("extrahiereStruktur", () => {
  it("liefert Seiten mit Elementen und typisierten Kanten", () => {
    const seiten = extrahiereStruktur(tabellen);
    const flur = seiten.find((s) => s.name === "Flur")!;
    expect(flur.elemente.map((e) => e.functionId).sort()).toEqual([
      12000011, 13000030, 13000031,
    ]);
    const koKante = flur.kanten.find((k) => k.elementId === 20)!;
    expect(koKante.quelle).toEqual({ art: "ko", koId: 100 });
    const portKante = flur.kanten.find((k) => k.elementId === 21)!;
    expect(portKante.quelle).toEqual({ art: "port", elementId: 20, ausgang: 1 });
  });
});

describe("bewerte", () => {
  it("erkennt vollständig abbildbare vs. offene Seiten", () => {
    const report = bewerte(extrahiereStruktur(tabellen));
    const flur = report.seiten.find((s) => s.seite === "Flur")!;
    expect(flur.vollstaendig).toBe(true);
    const exotik = report.seiten.find((s) => s.seite === "Exotik")!;
    expect(exotik.vollstaendig).toBe(false);
    expect(report.offen).toEqual([{ functionId: 99999999, anzahl: 1 }]);
  });
});

describe("konvertiereSeite", () => {
  it("kollabiert SendByChange, bildet NOT ab, Ausgangsbox → Datenpunkt-Schreiben", () => {
    const flur = extrahiereStruktur(tabellen).find((s) => s.name === "Flur")!;
    const { ergebnis, fehler } = konvertiereSeite(flur, koZuSchluessel);
    expect(fehler).toEqual([]);
    expect(ergebnis).not.toBeNull();

    // NOT-Knoten vorhanden, SendByChange/Ausgangsbox sind KEINE Knoten
    expect(Object.keys(ergebnis!.logik.knoten)).toEqual(["e21"]);
    expect(ergebnis!.logik.knoten["e21"]!.baustein).toBe("NOT");

    // Kante 1: KO Taster → NOT.in (SendByChange kollabiert, Quelle = KO direkt)
    expect(ergebnis!.logik.kanten).toContainEqual({ von: "dp:io.taster", nach: "e21.in" });
    // Kante 2: NOT.out → Datenpunkt Licht (Ausgangsbox)
    expect(ergebnis!.logik.kanten).toContainEqual({ von: "e21.out", nach: "dp:io.licht" });
  });

  it("JSON Extractor → EXTRACT mit felder-Config (konfig-variabel, ADR-0012)", () => {
    const fixture = `
CREATE TABLE \`editKo\` (\`id\` bigint(20),\`name\` varchar(100),\`folderid\` bigint(20),
  \`ga\` varchar(11),\`gatyp\` tinyint(3),\`valuetyp\` int(10),\`defaultvalue\` varchar(10000),
  \`remanent\` tinyint(3));
INSERT INTO \`editKo\` VALUES (200,'Wetter JSON',0,'',2,16,'',0),(201,'Temp',0,'',2,9,'',0);
CREATE TABLE \`editLogicPage\` (\`id\` bigint(20),\`name\` varchar(200));
INSERT INTO \`editLogicPage\` VALUES (1,'Wetter');
CREATE TABLE \`editLogicElement\` (\`id\` bigint(20),\`functionid\` bigint(20),\`pageid\` bigint(20),\`name\` varchar(100));
INSERT INTO \`editLogicElement\` VALUES (40,19001208,1,''),(41,12000011,1,'');
CREATE TABLE \`editLogicLink\` (\`id\` bigint(20),\`elementid\` bigint(20),\`eingang\` smallint(5),
  \`linktyp\` tinyint(3),\`linkid\` bigint(20),\`ausgang\` smallint(5),\`value\` varchar(10000));
INSERT INTO \`editLogicLink\` VALUES
(1,40,1,0,200,NULL,NULL),
(2,40,2,2,NULL,NULL,'main.temp'),
(3,40,3,2,NULL,NULL,'name'),
(4,41,1,1,40,2,NULL);
CREATE TABLE \`editLogicCmdList\` (\`id\` bigint(20),\`targetid\` bigint(20),\`cmd\` tinyint(3),
  \`cmdid1\` bigint(20),\`cmdid2\` bigint(20),\`cmdoption1\` int(11),\`cmdoption2\` int(11),
  \`cmdvalue1\` varchar(10000),\`cmdvalue2\` varchar(10000));
INSERT INTO \`editLogicCmdList\` VALUES (1,41,1,201,0,0,0,NULL,NULL);
`;
    const tab = parseDump(fixture);
    const { koZuSchluessel } = konvertiere(tab);
    const seite = extrahiereStruktur(tab).find((s) => s.name === "Wetter")!;
    const { ergebnis, fehler } = konvertiereSeite(seite, koZuSchluessel);
    expect(fehler).toEqual([]);
    const knoten = ergebnis!.logik.knoten["e40"]!;
    expect(knoten.baustein).toBe("EXTRACT");
    expect(knoten.parameter).toMatchObject({
      format: "json",
      felder: [
        { name: "wert1", pfad: "main.temp" },
        { name: "wert2", pfad: "name" },
      ],
    });
    // Ausgang „Extracted value 1" (Port 2) → Feldname wert1; Ausgangsbox 41
    // schreibt ihn auf KO 201 (Temp).
    expect(ergebnis!.logik.kanten).toContainEqual({ von: "e40.wert1", nach: "dp:allgemein.temp" });
  });

  it("String zerteilen → SPLIT, Anzahl aus genutzten Ausgängen (ADR-0012)", () => {
    const fixture = `
CREATE TABLE \`editKo\` (\`id\` bigint(20),\`name\` varchar(100),\`folderid\` bigint(20),
  \`ga\` varchar(11),\`gatyp\` tinyint(3),\`valuetyp\` int(10),\`defaultvalue\` varchar(10000),
  \`remanent\` tinyint(3));
INSERT INTO \`editKo\` VALUES (300,'CSV',0,'',2,16,'',0),(301,'A',0,'',2,16,'',0),(302,'B',0,'',2,16,'',0);
CREATE TABLE \`editLogicPage\` (\`id\` bigint(20),\`name\` varchar(200));
INSERT INTO \`editLogicPage\` VALUES (1,'Zerlegen');
CREATE TABLE \`editLogicElement\` (\`id\` bigint(20),\`functionid\` bigint(20),\`pageid\` bigint(20),\`name\` varchar(100));
INSERT INTO \`editLogicElement\` VALUES (50,18000003,1,''),(51,12000011,1,''),(52,12000011,1,'');
CREATE TABLE \`editLogicLink\` (\`id\` bigint(20),\`elementid\` bigint(20),\`eingang\` smallint(5),
  \`linktyp\` tinyint(3),\`linkid\` bigint(20),\`ausgang\` smallint(5),\`value\` varchar(10000));
INSERT INTO \`editLogicLink\` VALUES
(1,50,1,0,300,NULL,NULL),
(2,50,2,2,NULL,NULL,';'),
(3,51,1,1,50,1,NULL),
(4,52,1,1,50,2,NULL);
CREATE TABLE \`editLogicCmdList\` (\`id\` bigint(20),\`targetid\` bigint(20),\`cmd\` tinyint(3),
  \`cmdid1\` bigint(20),\`cmdid2\` bigint(20),\`cmdoption1\` int(11),\`cmdoption2\` int(11),
  \`cmdvalue1\` varchar(10000),\`cmdvalue2\` varchar(10000));
INSERT INTO \`editLogicCmdList\` VALUES (1,51,1,301,0,0,0,NULL,NULL),(2,52,1,302,0,0,0,NULL,NULL);
`;
    const tab = parseDump(fixture);
    const { koZuSchluessel } = konvertiere(tab);
    const seite = extrahiereStruktur(tab).find((s) => s.name === "Zerlegen")!;
    const { ergebnis, fehler } = konvertiereSeite(seite, koZuSchluessel);
    expect(fehler).toEqual([]);
    const knoten = ergebnis!.logik.knoten["e50"]!;
    expect(knoten.baustein).toBe("SPLIT");
    // nur teil1 + teil2 genutzt ⇒ anzahl 2 (nicht fix 10)
    expect(knoten.parameter).toMatchObject({ separator: ";", anzahl: 2 });
    expect(ergebnis!.logik.kanten).toContainEqual({ von: "e50.teil1", nach: "dp:allgemein.a" });
    expect(ergebnis!.logik.kanten).toContainEqual({ von: "e50.teil2", nach: "dp:allgemein.b" });
  });

  it("meldet unvollständige Seite statt zu raten", () => {
    const exotik = extrahiereStruktur(tabellen).find((s) => s.name === "Exotik")!;
    const { ergebnis, fehler } = konvertiereSeite(exotik, koZuSchluessel);
    expect(ergebnis).toBeNull();
    expect(fehler.some((f) => f.meldung.includes("99999999"))).toBe(true);
  });
});

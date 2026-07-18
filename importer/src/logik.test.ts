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
  it("trennt direkt Abbildbares von Stub-Kandidaten", () => {
    const report = bewerte(extrahiereStruktur(tabellen));
    const flur = report.seiten.find((s) => s.seite === "Flur")!;
    expect(flur.stubFunctionIds).toEqual([]);
    const exotik = report.seiten.find((s) => s.seite === "Exotik")!;
    expect(exotik.stubFunctionIds).toEqual([{ functionId: 99999999, anzahl: 1 }]);
    expect(report.stubs).toEqual([{ functionId: 99999999, anzahl: 1 }]);
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

  it("MQTT-Subscribe-LBS wird mqtt-DATENPUNKT (Topic aus Instanz-Config)", () => {
    const fixture = `
CREATE TABLE \`editKo\` (\`id\` bigint(20),\`name\` varchar(100),\`folderid\` bigint(20),
  \`ga\` varchar(11),\`gatyp\` tinyint(3),\`valuetyp\` int(10),\`defaultvalue\` varchar(10000),
  \`remanent\` tinyint(3));
INSERT INTO \`editKo\` VALUES (400,'Ziel',0,'',2,16,'',0);
CREATE TABLE \`editLogicPage\` (\`id\` bigint(20),\`name\` varchar(200));
INSERT INTO \`editLogicPage\` VALUES (1,'Sprachsteuerung');
CREATE TABLE \`editLogicElement\` (\`id\` bigint(20),\`functionid\` bigint(20),\`pageid\` bigint(20),\`name\` varchar(100));
INSERT INTO \`editLogicElement\` VALUES (60,19001054,1,''),(61,12000011,1,'');
CREATE TABLE \`editLogicLink\` (\`id\` bigint(20),\`elementid\` bigint(20),\`eingang\` smallint(5),
  \`linktyp\` tinyint(3),\`linkid\` bigint(20),\`ausgang\` smallint(5),\`value\` varchar(10000));
INSERT INTO \`editLogicLink\` VALUES
(1,60,9,2,NULL,NULL,'hermes/intent/DimLights'),
(2,61,1,1,60,2,NULL);
CREATE TABLE \`editLogicCmdList\` (\`id\` bigint(20),\`targetid\` bigint(20),\`cmd\` tinyint(3),
  \`cmdid1\` bigint(20),\`cmdid2\` bigint(20),\`cmdoption1\` int(11),\`cmdoption2\` int(11),
  \`cmdvalue1\` varchar(10000),\`cmdvalue2\` varchar(10000));
INSERT INTO \`editLogicCmdList\` VALUES (1,61,1,400,0,0,0,NULL,NULL);
`;
    const tab = parseDump(fixture);
    const konv = konvertiere(tab);
    const seite = extrahiereStruktur(tab).find((s) => s.name === "Sprachsteuerung")!;
    const { ergebnis, fehler } = konvertiereSeite(seite, konv.koZuSchluessel);
    expect(fehler).toEqual([]);
    // Der LBS ist KEIN Baustein-Knoten — er wurde zum Datenpunkt:
    expect(ergebnis!.neueDatenpunkte.get("mqtt")).toMatchObject({
      hermes_intent_dimlights: {
        klasse: "bus",
        treiber: "mqtt",
        adresse: "hermes/intent/DimLights",
        typ: "text",
      },
    });
    // dp→dp ist verboten: der Importer setzt automatisch eine KOPIE ein.
    expect(ergebnis!.logik.knoten["kopie_e61"]!.baustein).toBe("KOPIE");
    expect(ergebnis!.logik.kanten).toContainEqual({
      von: "dp:mqtt.hermes_intent_dimlights",
      nach: "kopie_e61.in",
    });
    expect(ergebnis!.logik.kanten).toContainEqual({
      von: "kopie_e61.out",
      nach: "dp:allgemein.ziel",
    });
  });

  it("Fremd-LBS wird STUB: Struktur importiert, Verhalten als TODO markiert", () => {
    const exotik = extrahiereStruktur(tabellen).find((s) => s.name === "Exotik")!;
    const { ergebnis, fehler } = konvertiereSeite(exotik, koZuSchluessel);
    expect(fehler).toEqual([]);
    expect(ergebnis!.logik.knoten["e30"]!.baustein).toBe("lbs99999999");
    expect(ergebnis!.stubs).toEqual([
      { functionId: 99999999, name: "LBS 99999999", eingaenge: 1, ausgaenge: 1 },
    ]);
    expect(ergebnis!.logik.notizen).toContain("Portierungs-TODO");
  });
});

describe("Archiv-Definitionen importieren (cmd 13/40/42/50)", () => {
  const FIXTURE_ARCHIV_OK = `
CREATE TABLE \`editKo\` (\`id\` bigint(20),\`name\` varchar(100),\`folderid\` bigint(20),\`ga\` varchar(11),\`gatyp\` tinyint(3),\`valuetyp\` int(10),\`defaultvalue\` varchar(10000),\`remanent\` tinyint(3));
INSERT INTO \`editKo\` VALUES (10,'Taster',1,'1/0/1',1,1,'',0),(11,'Ziel',1,'1/0/2',1,1,'',0);
CREATE TABLE \`editLogicPage\` (\`id\` bigint(20),\`name\` varchar(200));
INSERT INTO \`editLogicPage\` VALUES (1,'ArchivTest');
CREATE TABLE \`editLogicElement\` (\`id\` bigint(20),\`functionid\` bigint(20),\`pageid\` bigint(20),\`name\` varchar(10000));
INSERT INTO \`editLogicElement\` VALUES
(20,12000011,1,'cmd13-dp'),
(21,12000011,1,'cmd13-port'),
(22,12000011,1,'cmd42'),
(23,12000011,1,'cmd40-50'),
(24,13000031,1,'NOT'),
(25,12000011,1,'cmd13-dp-mehrfach-ok');
CREATE TABLE \`editLogicLink\` (\`id\` bigint(20),\`elementid\` bigint(20),\`eingang\` smallint(5),\`linktyp\` tinyint(3),\`linkid\` bigint(20),\`ausgang\` smallint(5),\`value\` varchar(10000));
INSERT INTO \`editLogicLink\` VALUES
(1,20,1,0,10,NULL,NULL),
(2,24,1,0,10,NULL,NULL),
(3,21,1,1,24,1,NULL),
(4,22,1,0,10,NULL,NULL),
(5,23,1,0,10,NULL,NULL),
(6,25,1,0,10,NULL,NULL);
CREATE TABLE \`editLogicCmdList\` (\`id\` bigint(20),\`targetid\` bigint(20),\`cmd\` tinyint(3),\`cmdid1\` bigint(20),\`cmdid2\` bigint(20),\`cmdoption1\` int(11),\`cmdoption2\` int(11),\`cmdvalue1\` varchar(10000),\`cmdvalue2\` varchar(10000));
INSERT INTO \`editLogicCmdList\` VALUES 
(1,20,13,1001,0,0,0,NULL,NULL),
(2,21,13,1002,0,0,0,NULL,NULL),
(3,22,42,1003,11,0,0,NULL,NULL),
(4,23,40,1005,0,0,0,'123',NULL),
(5,23,50,1005,0,0,0,NULL,NULL),
(6,25,13,1001,0,0,0,NULL,NULL);
`;

  it("extrahiert Archive erfolgreich und meldet Hinweise", () => {
    const tab = parseDump(FIXTURE_ARCHIV_OK);
    const { koZuSchluessel } = konvertiere(tab);
    const seite = extrahiereStruktur(tab).find((s) => s.name === "ArchivTest")!;
    const { ergebnis, fehler, hinweise } = konvertiereSeite(seite, koZuSchluessel);
    
    expect(fehler).toEqual([]);
    
    // 3 Hinweise: cmd 13 an Port, cmd 40, cmd 50
    expect(hinweise.length).toBe(3);
    expect(hinweise[0]!.meldung).toContain("haengt an Port e24.out");
    expect(hinweise[1]!.meldung).toContain("cmd 40");
    expect(hinweise[2]!.meldung).toContain("cmd 50");

    expect(ergebnis).not.toBeNull();
    const archive = ergebnis!.archive;
    
    // archiv_1001: cmd 13 mit dp-Quelle 10 (zweimal gleiche Quelle => ok)
    expect(archive.get("archiv_1001")).toMatchObject({
      name: "Archiv 1001 (aus Import)",
      quelle: "allgemein.taster",
      aufbewahrung_tage: 365,
    });

    // archiv_1002: cmd 13 an Port => keine Definition
    expect(archive.has("archiv_1002")).toBe(false);

    // archiv_1003: cmd 42 KO 11
    expect(archive.get("archiv_1003")).toMatchObject({
      name: "Archiv 1003 (aus Import)",
      quelle: "allgemein.ziel",
    });

    // archiv_1005: cmd 40 / 50 => keine Definition
    expect(archive.has("archiv_1005")).toBe(false);
  });

  const FIXTURE_ARCHIV_ERRORS = `
CREATE TABLE \`editKo\` (\`id\` bigint(20),\`name\` varchar(100),\`folderid\` bigint(20),\`ga\` varchar(11),\`gatyp\` tinyint(3),\`valuetyp\` int(10),\`defaultvalue\` varchar(10000),\`remanent\` tinyint(3));
INSERT INTO \`editKo\` VALUES (10,'Taster',1,'1/0/1',1,1,'',0),(11,'Ziel',1,'1/0/2',1,1,'',0);
CREATE TABLE \`editLogicPage\` (\`id\` bigint(20),\`name\` varchar(200));
INSERT INTO \`editLogicPage\` VALUES (1,'ArchivTestErr');
CREATE TABLE \`editLogicElement\` (\`id\` bigint(20),\`functionid\` bigint(20),\`pageid\` bigint(20),\`name\` varchar(10000));
INSERT INTO \`editLogicElement\` VALUES
(22,12000011,1,'cmd42-err'),
(26,12000011,1,'cmd13-dp-mehrfach-err1'),
(27,12000011,1,'cmd13-dp-mehrfach-err2');
CREATE TABLE \`editLogicLink\` (\`id\` bigint(20),\`elementid\` bigint(20),\`eingang\` smallint(5),\`linktyp\` tinyint(3),\`linkid\` bigint(20),\`ausgang\` smallint(5),\`value\` varchar(10000));
INSERT INTO \`editLogicLink\` VALUES
(4,22,1,0,10,NULL,NULL),
(7,26,1,0,11,NULL,NULL),
(8,27,1,0,10,NULL,NULL);
CREATE TABLE \`editLogicCmdList\` (\`id\` bigint(20),\`targetid\` bigint(20),\`cmd\` tinyint(3),\`cmdid1\` bigint(20),\`cmdid2\` bigint(20),\`cmdoption1\` int(11),\`cmdoption2\` int(11),\`cmdvalue1\` varchar(10000),\`cmdvalue2\` varchar(10000));
INSERT INTO \`editLogicCmdList\` VALUES 
(4,22,42,1004,999,0,0,NULL,NULL),
(8,26,13,1001,0,0,0,NULL,NULL),
(9,27,13,1001,0,0,0,NULL,NULL);
`;

  it("meldet Fehler bei ungültigem Ziel-KO oder widersprüchlichen Quellen", () => {
    const tab = parseDump(FIXTURE_ARCHIV_ERRORS);
    const { koZuSchluessel } = konvertiere(tab);
    const seite = extrahiereStruktur(tab).find((s) => s.name === "ArchivTestErr")!;
    const { ergebnis, fehler } = konvertiereSeite(seite, koZuSchluessel);
    
    // 2 Fehler: cmd 42 mit unbekanntem KO 999, und cmd 13 mehrfach mit anderer Quelle
    expect(fehler.length).toBe(2);
    expect(fehler[0]!.meldung).toContain("Ziel-KO 999 ohne Datenpunkt");
    expect(fehler[1]!.meldung).toContain("abweichende Quellen");
    
    // Bei Fehlern ist ergebnis null
    expect(ergebnis).toBeNull();
  });
});


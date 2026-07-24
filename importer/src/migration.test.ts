import { expect, test } from "vitest";
import {
  ermittleMigrationsBedarf,
  migrationsReportAlsMarkdown,
} from "./migration.ts";
import type { MigrationsEingabe } from "./migration.ts";

test("ermittleMigrationsBedarf aggregiert und sortiert korrekt", () => {
  const eingabe: MigrationsEingabe = {
    stubs: [
      { functionId: 2, name: "Baustein B", eingaenge: 2, ausgaenge: 1, verwendungen: 1, seiten: ["Seite 1"] },
      { functionId: 1, name: "Baustein A", eingaenge: 3, ausgaenge: 2, verwendungen: 5, seiten: ["Seite 2", "Seite 1", "Seite 1"] },
      { functionId: 3, name: "Baustein C", eingaenge: 1, ausgaenge: 1 },
    ],
    vse: [
      { controltyp: 10, verwendungen: 2, seiten: ["Wohnzimmer"] },
      { controltyp: 5, name: "Schalter", verwendungen: 2, seiten: ["Küche", "Bad"] },
    ],
  };

  const report = ermittleMigrationsBedarf(eingabe);

  expect(report.summe.lbs).toBe(3);
  expect(report.summe.vse).toBe(2);

  // LBS: Absteigend nach verwendungen, dann aufsteigend id
  expect(report.lbs[0]!.id).toBe(1); // 5 verwendungen
  expect(report.lbs[0]!.fundstellen).toEqual(["Seite 1", "Seite 2"]); // Alphabetisch, ohne Duplikate

  expect(report.lbs[1]!.id).toBe(2); // 1 verwendung

  expect(report.lbs[2]!.id).toBe(3); // undefined -> 0 verwendungen
  expect(report.lbs[2]!.fundstellen).toEqual([]);

  // VSE: 2 verwendungen bei beiden, also aufsteigend id
  expect(report.vse[0]!.id).toBe(5);
  expect(report.vse[0]!.fundstellen).toEqual(["Bad", "Küche"]);

  expect(report.vse[1]!.id).toBe(10);
});

test("migrationsReportAlsMarkdown liefert erwartetes Format bei leeren Listen", () => {
  const report = ermittleMigrationsBedarf({ stubs: [], vse: [] });
  const md = migrationsReportAlsMarkdown(report);

  expect(md).toContain("0 Logikbausteine, 0 Visuelemente brauchen eine Entscheidung");
  expect(md).toContain("Keine unbekannten Logikbausteine — nichts zu tun.");
  expect(md).toContain("Keine unbekannten Visuelemente — nichts zu tun.");
  expect(md).toContain("## Was jetzt zu tun ist");
});

test("migrationsReportAlsMarkdown liefert deterministische Tabellen", () => {
  const report = ermittleMigrationsBedarf({
    stubs: [
      { functionId: 123, name: "Spezial", eingaenge: 2, ausgaenge: 1, verwendungen: 4, seiten: ["Flur"] },
    ],
    vse: [
      { controltyp: 42, verwendungen: 1, seiten: ["Garten"] },
    ],
  });
  const md = migrationsReportAlsMarkdown(report);

  expect(md).toContain("1 Logikbausteine, 1 Visuelemente brauchen eine Entscheidung");
  expect(md).toContain("| ID | Name | Verwendungen | Ports (Ein/Aus) | Fundstellen |");
  expect(md).toContain("| 123 | Spezial | 4 | 2/1 | Flur |");
  expect(md).toContain("| ID | Name | Verwendungen | Fundstellen |");
  expect(md).toContain("| 42 | - | 1 | Garten |"); // fallback name for VSE
});

test("ein Pipe im Namen zerlegt die Tabelle nicht", () => {
  // Namen kommen aus fremden Nutzdaten — ein | darin wuerde die Spalten
  // verschieben und den Report still verfaelschen.
  const report = ermittleMigrationsBedarf({
    stubs: [{ functionId: 7, name: "A|B", eingaenge: 1, ausgaenge: 1, verwendungen: 1 }],
    vse: [{ controltyp: 8, name: "X|Y", verwendungen: 1, seiten: ["Flur|Diele"] }],
  });
  const md = migrationsReportAlsMarkdown(report);
  expect(md).toContain("| 7 | A\\|B | 1 |");
  expect(md).toContain("| 8 | X\\|Y | 1 | Flur\\|Diele |");
  // Jede Datenzeile hat exakt so viele Spalten wie ihr Kopf.
  for (const zeile of md.split("\n").filter((z) => z.startsWith("| "))) {
    const spalten = zeile.replaceAll("\\|", "").split("|").length;
    expect(spalten === 7 || spalten === 6, zeile).toBe(true);
  }
});

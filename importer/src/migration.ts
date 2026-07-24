/** Ein Posten, den der Betreiber selbst klären muss. */
export interface MigrationsPosten {
  art: "lbs" | "vse";
  /** LBS: functionId · VSE: controltyp */
  id: number;
  /** Name aus den Nutzdaten; leer, wenn nicht ableitbar. */
  name: string;
  verwendungen: number;
  /** Seiten-/Slugnamen, alphabetisch, ohne Duplikate. */
  fundstellen: string[];
  /** nur art="lbs": Portzahlen aus dem Stub. */
  eingaenge?: number;
  ausgaenge?: number;
}

export interface MigrationsReport {
  /** absteigend nach verwendungen, bei Gleichstand aufsteigend nach id. */
  lbs: MigrationsPosten[];
  vse: MigrationsPosten[];
  summe: { lbs: number; vse: number };
}

export interface MigrationsEingabe {
  stubs: ReadonlyArray<{
    functionId: number;
    name: string;
    eingaenge: number;
    ausgaenge: number;
    verwendungen?: number;
    seiten?: readonly string[];
  }>;
  vse: ReadonlyArray<{
    controltyp: number;
    verwendungen: number;
    name?: string;
    seiten?: readonly string[];
  }>;
}

export function ermittleMigrationsBedarf(eingabe: MigrationsEingabe): MigrationsReport {
  const lbs: MigrationsPosten[] = eingabe.stubs.map((stub) => {
    const fundstellen = stub.seiten ? Array.from(new Set(stub.seiten)).sort() : [];
    return {
      art: "lbs",
      id: stub.functionId,
      name: stub.name,
      verwendungen: stub.verwendungen ?? 0,
      fundstellen,
      eingaenge: stub.eingaenge,
      ausgaenge: stub.ausgaenge,
    };
  });

  const vse: MigrationsPosten[] = eingabe.vse.map((v) => {
    const fundstellen = v.seiten ? Array.from(new Set(v.seiten)).sort() : [];
    return {
      art: "vse",
      id: v.controltyp,
      name: v.name ?? "",
      verwendungen: v.verwendungen,
      fundstellen,
    };
  });

  const sortierer = (a: MigrationsPosten, b: MigrationsPosten) => {
    if (a.verwendungen !== b.verwendungen) {
      return b.verwendungen - a.verwendungen;
    }
    return a.id - b.id;
  };

  lbs.sort(sortierer);
  vse.sort(sortierer);

  return {
    lbs,
    vse,
    summe: {
      lbs: lbs.length,
      vse: vse.length,
    },
  };
}

/**
 * Zellinhalt für eine Markdown-Tabelle absichern: ein Pipe im Namen wuerde
 * sonst die Spalten zerlegen und den Report still verfaelschen.
 */
function zelle(text: string): string {
  return text.replaceAll("|", "\\|");
}

export function migrationsReportAlsMarkdown(report: MigrationsReport): string {
  let md = `${report.summe.lbs} Logikbausteine, ${report.summe.vse} Visuelemente brauchen eine Entscheidung\n\n`;

  if (report.summe.lbs === 0) {
    md += `Keine unbekannten Logikbausteine — nichts zu tun.\n\n`;
  } else {
    md += `| ID | Name | Verwendungen | Ports (Ein/Aus) | Fundstellen |\n`;
    md += `|---|---|---|---|---|\n`;
    for (const item of report.lbs) {
      const ports = `${item.eingaenge ?? 0}/${item.ausgaenge ?? 0}`;
      const fundstellen = item.fundstellen.length > 0 ? zelle(item.fundstellen.join(", ")) : "-";
      const name = item.name ? zelle(item.name) : "-";
      md += `| ${item.id} | ${name} | ${item.verwendungen} | ${ports} | ${fundstellen} |\n`;
    }
    md += `\n`;
  }

  if (report.summe.vse === 0) {
    md += `Keine unbekannten Visuelemente — nichts zu tun.\n\n`;
  } else {
    md += `| ID | Name | Verwendungen | Fundstellen |\n`;
    md += `|---|---|---|---|\n`;
    for (const item of report.vse) {
      const fundstellen = item.fundstellen.length > 0 ? zelle(item.fundstellen.join(", ")) : "-";
      const name = item.name ? zelle(item.name) : "-";
      md += `| ${item.id} | ${name} | ${item.verwendungen} | ${fundstellen} |\n`;
    }
    md += `\n`;
  }

  md += `## Was jetzt zu tun ist\n\n`;
  md += `Diese Bausteine/Elemente stammen nicht aus Fachwerk. Die Struktur ist\n`;
  md += `importiert und das Gewerk läuft — die betroffenen Stellen sind aber noch ohne\n`;
  md += `Funktion (Stub). Für jeden Posten gibt es drei Wege:\n\n`;
  md += `1. **Prüfen, ob Fachwerk es schon kann.** Vieles ist eine Variante von etwas,\n`;
  md += `   das es nativ gibt (ein Schiebeschalter ist ein Schalter). Anleitung:\n`;
  md += `   docs/MIGRATION-TRIAGE.md\n`;
  md += `2. **Saubere Umsetzung beitragen.** Der ursprüngliche Autor (oder du) kann die\n`;
  md += `   Funktion für Fachwerk neu implementieren und beisteuern.\n`;
  md += `3. **Feature-Request stellen.** Beschreibe, WAS der Baustein tun soll.\n\n`;
  md += `**Wichtig:** Beschreibe in Issues und Beiträgen immer nur das *Verhalten*.\n`;
  md += `Füge niemals Quellcode des Originalbausteins ein — weder ins Issue noch ins\n`;
  md += `Repository. Fachwerk ist eine Neuentwicklung und muss frei von fremdem Code\n`;
  md += `bleiben; ein eingefügter Schnipsel gefährdet das gesamte Projekt.\n`;

  return md;
}

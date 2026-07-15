/**
 * Generischer mysqldump-Parser (Import-Assistent, Stufe 1): liest aus einem
 * SQL-Dump die CREATE-TABLE-Spaltennamen und alle INSERT-Zeilen und liefert
 * sie als Objekte. Bewusst NUR Daten — keinerlei Code-Interpretation.
 */

export type Zelle = string | number | null;
export type Zeile = Record<string, Zelle>;

export interface Tabelle {
  name: string;
  spalten: string[];
  zeilen: Zeile[];
}

/** Spaltennamen aus einem CREATE-TABLE-Block ziehen. */
function parseSpalten(createBlock: string): string[] {
  const spalten: string[] = [];
  for (const zeile of createBlock.split("\n")) {
    const m = /^\s*`([^`]+)`\s/.exec(zeile);
    if (m) spalten.push(m[1]!);
  }
  return spalten;
}

/** Werte-Tupel eines INSERT parsen: Zahlen, 'Strings' (mit \-Escapes), NULL. */
function parseWerte(text: string, start: number): { werte: Zelle[]; ende: number } {
  const werte: Zelle[] = [];
  let i = start; // zeigt auf '('
  i++;
  for (;;) {
    while (text[i] === " " || text[i] === ",") i++;
    const c = text[i];
    if (c === ")") return { werte, ende: i + 1 };
    if (c === "'") {
      let s = "";
      i++;
      for (;;) {
        const ch = text[i]!;
        if (ch === "\\") {
          const n = text[i + 1]!;
          s +=
            n === "n" ? "\n" : n === "r" ? "\r" : n === "t" ? "\t" : n === "0" ? "\0" : n;
          i += 2;
        } else if (ch === "'") {
          if (text[i + 1] === "'") {
            s += "'";
            i += 2;
          } else {
            i++;
            break;
          }
        } else {
          s += ch;
          i++;
        }
      }
      werte.push(s);
    } else if (text.startsWith("NULL", i)) {
      werte.push(null);
      i += 4;
    } else {
      let t = "";
      while (i < text.length && !",)".includes(text[i]!)) t += text[i++]!;
      const zahl = Number(t);
      werte.push(Number.isFinite(zahl) && t.trim() !== "" ? zahl : t.trim());
    }
  }
}

/** Liest alle Tabellen (CREATE + INSERTs) aus einem mysqldump-Text. */
export function parseDump(sql: string): Map<string, Tabelle> {
  const tabellen = new Map<string, Tabelle>();

  // mysqldump schließt die Spaltenliste mit ")" am Zeilenanfang ab.
  const createRe = /CREATE TABLE `([^`]+)` \(([\s\S]*?)\n\)/g;
  for (let m = createRe.exec(sql); m; m = createRe.exec(sql)) {
    tabellen.set(m[1]!, { name: m[1]!, spalten: parseSpalten(m[2]!), zeilen: [] });
  }

  const insertRe = /INSERT INTO `([^`]+)` VALUES/g;
  for (let m = insertRe.exec(sql); m; m = insertRe.exec(sql)) {
    const tabelle = tabellen.get(m[1]!);
    if (!tabelle) continue;
    let i = insertRe.lastIndex;
    for (;;) {
      while (i < sql.length && /\s/.test(sql[i]!)) i++;
      const { werte, ende } = parseWerte(sql, i);
      tabelle.zeilen.push(
        Object.fromEntries(tabelle.spalten.map((s, idx) => [s, werte[idx] ?? null])),
      );
      i = ende;
      while (i < sql.length && /\s/.test(sql[i]!)) i++;
      if (sql[i] === ",") {
        i++;
        continue;
      }
      break; // ';'
    }
    insertRe.lastIndex = i;
  }
  return tabellen;
}

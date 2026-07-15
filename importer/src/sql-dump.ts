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

/** Spaltennamen aus einem CREATE-TABLE-Block ziehen (zeilen- ODER kommagetrennt). */
function parseSpalten(createBlock: string): string[] {
  const spalten: string[] = [];
  // Auf Paren-Tiefe 0 an Kommas trennen (Typdefs wie „(20)" nicht zerschneiden).
  const teile: string[] = [];
  let tiefe = 0;
  let akt = "";
  for (const ch of createBlock) {
    if (ch === "(") tiefe++;
    else if (ch === ")") tiefe--;
    if (ch === "," && tiefe === 0) {
      teile.push(akt);
      akt = "";
    } else {
      akt += ch;
    }
  }
  teile.push(akt);

  const nichtSpalte = /^(PRIMARY|UNIQUE|KEY|INDEX|CONSTRAINT|FULLTEXT|SPATIAL|CHECK)\b/i;
  for (const teil of teile) {
    const t = teil.trim();
    const m = /^`([^`]+)`/.exec(t);
    if (m && !nichtSpalte.test(t)) spalten.push(m[1]!);
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

  // CREATE TABLE `x` ( … ) — Klammern balancieren, da Typdefs „(20)" enthalten.
  const createRe = /CREATE TABLE `([^`]+)` \(/g;
  for (let m = createRe.exec(sql); m; m = createRe.exec(sql)) {
    let i = createRe.lastIndex;
    let tiefe = 1;
    const start = i;
    for (; i < sql.length && tiefe > 0; i++) {
      if (sql[i] === "(") tiefe++;
      else if (sql[i] === ")") tiefe--;
    }
    tabellen.set(m[1]!, {
      name: m[1]!,
      spalten: parseSpalten(sql.slice(start, i - 1)),
      zeilen: [],
    });
    createRe.lastIndex = i;
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

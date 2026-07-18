export interface AusdruckFehler {
  code: "syntax" | "unbekannte_funktion" | "typ" | "division_durch_null" | "datenpunkt_fehlt";
  meldung: string;
  position?: number;
}

export interface AusdruckErgebnis {
  text: string;
  fehler: AusdruckFehler[];
}

export type WertLookup = (schluessel: string) => unknown;

type TokenArt = "zahl" | "string" | "ref" | "ident" | "operator" | "ende";
interface Token { art: TokenArt; wert: string | number; position: number }
type Knoten =
  | { art: "literal"; wert: string | number }
  | { art: "ref"; schluessel: string | null }
  | { art: "unary"; operator: string; operand: Knoten }
  | { art: "binary"; operator: string; links: Knoten; rechts: Knoten }
  | { art: "ternary"; bedingung: Knoten; dann: Knoten; sonst: Knoten }
  | { art: "funktion"; name: string; argumente: Knoten[] };
type Segment = { text: string } | { ausdruck: Knoten };

class SyntaxFehler extends Error {
  readonly position: number;
  constructor(meldung: string, position: number) { super(meldung); this.position = position; }
}

class LaufzeitFehler extends Error {
  readonly code: AusdruckFehler["code"];
  constructor(code: AusdruckFehler["code"], meldung: string) { super(meldung); this.code = code; }
}

function tokenisiere(text: string): Token[] {
  const token: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i] as string;
    if (/\s/.test(c)) { i++; continue; }
    if (c === "#") {
      const start = i++;
      if (text[i] === "{") {
        const ende = text.indexOf("}", i + 1);
        if (ende < 0) throw new SyntaxFehler("Wertreferenz ist nicht geschlossen", start);
        const key = text.slice(i + 1, ende);
        if (!/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/.test(key)) {
          throw new SyntaxFehler("ungültiger Datenpunkt-Schlüssel", i + 1);
        }
        token.push({ art: "ref", wert: key, position: start });
        i = ende + 1;
      } else {
        token.push({ art: "ref", wert: "", position: start });
      }
      continue;
    }
    if (/[0-9.]/.test(c)) {
      const rest = text.slice(i);
      const treffer = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(rest);
      if (!treffer) throw new SyntaxFehler("ungültige Zahl", i);
      const wert = Number(treffer[0]);
      if (!Number.isFinite(wert)) throw new SyntaxFehler("Zahl ist nicht endlich", i);
      token.push({ art: "zahl", wert, position: i });
      i += treffer[0].length;
      continue;
    }
    if (c === "\"" || c === "'") {
      const start = i;
      const quote = c;
      i++;
      let wert = "";
      let geschlossen = false;
      while (i < text.length) {
        const zeichen = text[i++] as string;
        if (zeichen === quote) { geschlossen = true; break; }
        if (zeichen === "\\") {
          if (i >= text.length) break;
          const escaped = text[i++] as string;
          const escapes: Record<string, string> = { n: "\n", r: "\r", t: "\t", "\\": "\\", "\"": "\"", "'": "'" };
          wert += escapes[escaped] ?? escaped;
        } else {
          wert += zeichen;
        }
      }
      if (!geschlossen) throw new SyntaxFehler("String ist nicht geschlossen", start);
      token.push({ art: "string", wert, position: start });
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const start = i++;
      while (i < text.length && /[A-Za-z0-9_]/.test(text[i] as string)) i++;
      token.push({ art: "ident", wert: text.slice(start, i), position: start });
      continue;
    }
    const zwei = text.slice(i, i + 2);
    if (["||", "&&", "==", "!=", "<=", ">="].includes(zwei)) {
      token.push({ art: "operator", wert: zwei, position: i }); i += 2; continue;
    }
    if (["?", ":", "+", "-", "*", "/", "%", "!", "<", ">", "(", ")", ","].includes(c)) {
      token.push({ art: "operator", wert: c, position: i }); i++; continue;
    }
    throw new SyntaxFehler(`unerwartetes Zeichen ${c}`, i);
  }
  token.push({ art: "ende", wert: "", position: text.length });
  return token;
}

class Parser {
  readonly #token: Token[];
  #index = 0;
  constructor(text: string) { this.#token = tokenisiere(text); }
  #aktuell(): Token { return this.#token[this.#index] as Token; }
  #nimmt(wert: string): boolean {
    if (this.#aktuell().wert !== wert) return false;
    this.#index++; return true;
  }
  #erwarte(wert: string): void {
    if (!this.#nimmt(wert)) throw new SyntaxFehler(`${wert} erwartet`, this.#aktuell().position);
  }
  parse(): Knoten {
    const knoten = this.#ternary();
    if (this.#aktuell().art !== "ende") throw new SyntaxFehler("unerwarteter Ausdrucksteil", this.#aktuell().position);
    return knoten;
  }
  #ternary(): Knoten {
    const bedingung = this.#or();
    if (!this.#nimmt("?")) return bedingung;
    const dann = this.#ternary();
    this.#erwarte(":");
    return { art: "ternary", bedingung, dann, sonst: this.#ternary() };
  }
  #or(): Knoten { return this.#folge(() => this.#and(), ["||"]); }
  #and(): Knoten { return this.#folge(() => this.#cmp(), ["&&"]); }
  #cmp(): Knoten {
    const links = this.#add();
    const op = String(this.#aktuell().wert);
    if (!["==", "!=", "<", "<=", ">", ">="].includes(op)) return links;
    this.#index++;
    return { art: "binary", operator: op, links, rechts: this.#add() };
  }
  #add(): Knoten { return this.#folge(() => this.#mul(), ["+", "-"]); }
  #mul(): Knoten { return this.#folge(() => this.#unary(), ["*", "/", "%"]); }
  #folge(naechstes: () => Knoten, operatoren: string[]): Knoten {
    let links = naechstes();
    while (operatoren.includes(String(this.#aktuell().wert))) {
      const operator = String(this.#aktuell().wert); this.#index++;
      links = { art: "binary", operator, links, rechts: naechstes() };
    }
    return links;
  }
  #unary(): Knoten {
    const op = String(this.#aktuell().wert);
    if (op === "-" || op === "!") { this.#index++; return { art: "unary", operator: op, operand: this.#primary() }; }
    return this.#primary();
  }
  #primary(): Knoten {
    const token = this.#aktuell();
    if (token.art === "zahl" || token.art === "string") { this.#index++; return { art: "literal", wert: token.wert }; }
    if (token.art === "ref") { this.#index++; return { art: "ref", schluessel: token.wert === "" ? null : String(token.wert) }; }
    if (this.#nimmt("(")) { const wert = this.#ternary(); this.#erwarte(")"); return wert; }
    if (token.art === "ident") {
      this.#index++;
      const name = String(token.wert);
      this.#erwarte("(");
      const argumente: Knoten[] = [];
      if (!this.#nimmt(")")) {
        do { argumente.push(this.#ternary()); } while (this.#nimmt(","));
        this.#erwarte(")");
      }
      return { art: "funktion", name, argumente };
    }
    throw new SyntaxFehler("Ausdruck erwartet", token.position);
  }
}

function templateSegmente(template: string): Segment[] {
  const segmente: Segment[] = [];
  let textStart = 0;
  let i = 0;
  while (i < template.length) {
    if (template[i] !== "{") { i++; continue; }
    if (i > textStart) segmente.push({ text: template.slice(textStart, i) });
    const start = i++;
    let quote = "";
    let refTiefe = 0;
    while (i < template.length) {
      const c = template[i] as string;
      if (quote) {
        if (c === "\\") i += 2;
        else { if (c === quote) quote = ""; i++; }
        continue;
      }
      if (c === "\"" || c === "'") { quote = c; i++; continue; }
      if (c === "#" && template[i + 1] === "{") { refTiefe++; i += 2; continue; }
      if (c === "}" && refTiefe > 0) { refTiefe--; i++; continue; }
      if (c === "}") break;
      i++;
    }
    if (i >= template.length) throw new SyntaxFehler("Template-Loch ist nicht geschlossen", start);
    const inhalt = template.slice(start + 1, i);
    if (inhalt.trim() === "") throw new SyntaxFehler("Template-Loch ist leer", start + 1);
    segmente.push({ ausdruck: new Parser(inhalt).parse() });
    i++;
    textStart = i;
  }
  if (textStart < template.length) segmente.push({ text: template.slice(textStart) });
  return segmente;
}

function zahl(wert: unknown): number {
  if (typeof wert !== "number" || !Number.isFinite(wert)) throw new LaufzeitFehler("typ", "endliche Zahl erwartet");
  return wert;
}
function bool(wert: unknown): boolean {
  if (typeof wert !== "boolean") throw new LaufzeitFehler("typ", "Bool-Wert erwartet");
  return wert;
}
function ganzzahl(wert: unknown): number {
  const n = zahl(wert);
  if (!Number.isInteger(n) || n < 0 || n > 100) throw new LaufzeitFehler("typ", "nichtnegative Ganzzahl bis 100 erwartet");
  return n;
}

const FUNKTIONEN = new Set(["round", "fixed", "floor", "ceil", "abs", "min", "max", "clamp", "concat", "upper", "lower", "pad", "map"]);

function funktion(name: string, args: unknown[]): unknown {
  if (!FUNKTIONEN.has(name)) throw new LaufzeitFehler("unbekannte_funktion", `unbekannte Funktion ${name}`);
  const anzahl = (min: number, max = min): void => {
    if (args.length < min || args.length > max) throw new LaufzeitFehler("typ", `${name} erwartet ${min === max ? min : `${min} bis ${max}`} Argumente`);
  };
  switch (name) {
    case "round": { anzahl(1, 2); const n = args.length === 2 ? ganzzahl(args[1]) : 0; const f = 10 ** n; return Math.round(zahl(args[0]) * f) / f; }
    case "fixed": anzahl(2); return zahl(args[0]).toFixed(ganzzahl(args[1]));
    case "floor": anzahl(1); return Math.floor(zahl(args[0]));
    case "ceil": anzahl(1); return Math.ceil(zahl(args[0]));
    case "abs": anzahl(1); return Math.abs(zahl(args[0]));
    case "min": if (args.length === 0) throw new LaufzeitFehler("typ", "min erwartet Argumente"); return Math.min(...args.map(zahl));
    case "max": if (args.length === 0) throw new LaufzeitFehler("typ", "max erwartet Argumente"); return Math.max(...args.map(zahl));
    case "clamp": anzahl(3); return Math.min(Math.max(zahl(args[0]), zahl(args[1])), zahl(args[2]));
    case "concat": return args.map((x) => String(x)).join("");
    case "upper": anzahl(1); if (typeof args[0] !== "string") throw new LaufzeitFehler("typ", "upper erwartet Text"); return args[0].toUpperCase();
    case "lower": anzahl(1); if (typeof args[0] !== "string") throw new LaufzeitFehler("typ", "lower erwartet Text"); return args[0].toLowerCase();
    case "pad": anzahl(2); if (typeof args[0] !== "string") throw new LaufzeitFehler("typ", "pad erwartet Text"); return args[0].padStart(ganzzahl(args[1]));
    case "map": {
      if (args.length < 4 || args.length % 2 !== 0) throw new LaufzeitFehler("typ", "map erwartet Wert, Paare und Default");
      for (let i = 1; i < args.length - 1; i += 2) if (args[0] === args[i]) return args[i + 1];
      return args.at(-1);
    }
  }
}

function auswerten(knoten: Knoten, selbst: unknown, lookup?: WertLookup): unknown {
  switch (knoten.art) {
    case "literal": return knoten.wert;
    case "ref": {
      if (knoten.schluessel === null) return selbst;
      if (!lookup) throw new LaufzeitFehler("datenpunkt_fehlt", `Datenpunkt ${knoten.schluessel} kann nicht aufgelöst werden`);
      let wert: unknown;
      try { wert = lookup(knoten.schluessel); } catch { throw new LaufzeitFehler("datenpunkt_fehlt", `Datenpunkt ${knoten.schluessel} kann nicht aufgelöst werden`); }
      if (wert === undefined) throw new LaufzeitFehler("datenpunkt_fehlt", `Datenpunkt ${knoten.schluessel} fehlt`);
      return wert;
    }
    case "unary": return knoten.operator === "-" ? -zahl(auswerten(knoten.operand, selbst, lookup)) : !bool(auswerten(knoten.operand, selbst, lookup));
    case "ternary": return auswerten(bool(auswerten(knoten.bedingung, selbst, lookup)) ? knoten.dann : knoten.sonst, selbst, lookup);
    case "funktion": return funktion(knoten.name, knoten.argumente.map((a) => auswerten(a, selbst, lookup)));
    case "binary": {
      if (knoten.operator === "&&") { const l = bool(auswerten(knoten.links, selbst, lookup)); return l && bool(auswerten(knoten.rechts, selbst, lookup)); }
      if (knoten.operator === "||") { const l = bool(auswerten(knoten.links, selbst, lookup)); return l || bool(auswerten(knoten.rechts, selbst, lookup)); }
      const links = auswerten(knoten.links, selbst, lookup);
      const rechts = auswerten(knoten.rechts, selbst, lookup);
      switch (knoten.operator) {
        case "+": return zahl(links) + zahl(rechts);
        case "-": return zahl(links) - zahl(rechts);
        case "*": return zahl(links) * zahl(rechts);
        case "/": if (zahl(rechts) === 0) throw new LaufzeitFehler("division_durch_null", "Division durch 0"); return zahl(links) / zahl(rechts);
        case "%": if (zahl(rechts) === 0) throw new LaufzeitFehler("division_durch_null", "Modulo durch 0"); return zahl(links) % zahl(rechts);
        case "==": return typeof links === typeof rechts && links === rechts;
        case "!=": return typeof links !== typeof rechts || links !== rechts;
        case "<": return zahl(links) < zahl(rechts);
        case "<=": return zahl(links) <= zahl(rechts);
        case ">": return zahl(links) > zahl(rechts);
        case ">=": return zahl(links) >= zahl(rechts);
      }
    }
  }
}

export interface KompiliertesTemplate {
  readonly template: string;
  readonly fehler: readonly AusdruckFehler[];
  auswerten(wert: unknown, lookup?: WertLookup): AusdruckErgebnis;
}

export function kompiliereTemplate(template: string): KompiliertesTemplate {
  let segmente: Segment[] = [];
  let parseFehler: AusdruckFehler[] = [];
  try { segmente = templateSegmente(template); }
  catch (e) {
    parseFehler = [{ code: "syntax", meldung: e instanceof Error ? e.message : String(e), ...(e instanceof SyntaxFehler ? { position: e.position } : {}) }];
  }
  return {
    template,
    fehler: parseFehler,
    auswerten(wert: unknown, lookup?: WertLookup): AusdruckErgebnis {
      if (parseFehler.length > 0) return { text: String(wert), fehler: [...parseFehler] };
      try {
        const text = segmente.map((segment) => "text" in segment ? segment.text : String(auswerten(segment.ausdruck, wert, lookup))).join("");
        return { text, fehler: [] };
      } catch (e) {
        const fehler: AusdruckFehler = e instanceof LaufzeitFehler
          ? { code: e.code, meldung: e.message }
          : { code: "typ", meldung: e instanceof Error ? e.message : String(e) };
        return { text: String(wert), fehler: [fehler] };
      }
    },
  };
}

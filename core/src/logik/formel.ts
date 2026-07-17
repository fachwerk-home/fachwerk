/**
 * Kleiner, sicherer Formel-Auswerter für den FORMEL-Baustein: Arithmetik,
 * Klammern, Variablen ($x, $a..$e), feste Funktions-Whitelist. Kein eval,
 * keine Seiteneffekte, nicht Turing-vollständig — bewusst dieselbe Philosophie
 * wie die Visu-Ausdrücke (SPEC-003 Anhang A).
 */

const FUNKTIONEN: Record<string, (...args: number[]) => number> = {
  round: (x, n = 0) => {
    const f = 10 ** n;
    return Math.round(x * f) / f;
  },
  floor: (x) => Math.floor(x),
  ceil: (x) => Math.ceil(x),
  abs: (x) => Math.abs(x),
  sqrt: (x) => Math.sqrt(x),
  min: (...a) => Math.min(...a),
  max: (...a) => Math.max(...a),
  pow: (x, y) => x ** y,
};

export function formelAuswerten(
  formel: string,
  variablen: Readonly<Record<string, number>>,
): number | null {
  let i = 0;
  const text = formel;

  const skip = (): void => {
    while (i < text.length && text[i] === " ") i++;
  };

  function primary(): number {
    skip();
    const c = text[i];
    if (c === "(") {
      i++;
      const v = additiv();
      skip();
      if (text[i] !== ")") throw new Error("fehlende )");
      i++;
      return v;
    }
    if (c === "-") {
      i++;
      return -primary();
    }
    if (c === "$") {
      i++;
      const m = /^[a-z]+/.exec(text.slice(i));
      if (!m) throw new Error("Variable erwartet");
      i += m[0].length;
      const wert = variablen[m[0]];
      if (wert === undefined || !Number.isFinite(wert)) {
        throw new Error(`Variable $${m[0]} unbelegt`);
      }
      return wert;
    }
    if (c !== undefined && /[0-9.]/.test(c)) {
      const m = /^\d+(?:\.\d+)?/.exec(text.slice(i))!;
      i += m[0].length;
      return Number(m[0]);
    }
    if (c !== undefined && /[a-z]/i.test(c)) {
      const m = /^[a-z]+/i.exec(text.slice(i))!;
      const fn = FUNKTIONEN[m[0].toLowerCase()];
      if (!fn) throw new Error(`unbekannte Funktion ${m[0]}`);
      i += m[0].length;
      skip();
      if (text[i] !== "(") throw new Error(`( nach ${m[0]} erwartet`);
      i++;
      const args: number[] = [];
      skip();
      if (text[i] !== ")") {
        args.push(additiv());
        skip();
        while (text[i] === ",") {
          i++;
          args.push(additiv());
          skip();
        }
      }
      if (text[i] !== ")") throw new Error("fehlende )");
      i++;
      return fn(...args);
    }
    throw new Error(`unerwartet: „${c ?? "Ende"}"`);
  }

  function multiplikativ(): number {
    let v = primary();
    for (;;) {
      skip();
      const op = text[i];
      if (op === "*" || op === "/" || op === "%") {
        i++;
        const r = primary();
        v = op === "*" ? v * r : op === "/" ? v / r : v % r;
      } else return v;
    }
  }

  function additiv(): number {
    let v = multiplikativ();
    for (;;) {
      skip();
      const op = text[i];
      if (op === "+" || op === "-") {
        i++;
        const r = multiplikativ();
        v = op === "+" ? v + r : v - r;
      } else return v;
    }
  }

  try {
    const ergebnis = additiv();
    skip();
    if (i < text.length) return null; // Rest nicht geparst → ungültig
    return Number.isFinite(ergebnis) ? ergebnis : null;
  } catch {
    return null;
  }
}

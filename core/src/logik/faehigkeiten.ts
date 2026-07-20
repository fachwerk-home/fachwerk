/**
 * Faehigkeiten von Bausteinen (ADR-0014 V-1/V-2, „capabilities").
 *
 * Ein Baustein aus fremder Hand laeuft im Prozess, der das Haus steuert. Was
 * er darf, steht deshalb im Manifest und wird hier durchgesetzt — nicht im
 * Baustein-Code, wo es sich jeder selbst geben koennte.
 *
 * Schutzziel v1 ist ausdruecklich begrenzt: Unfaelle und triviale Bosheit.
 * Ein entschlossener Angreifer kommt hier durch. Die harte Isolation (eigener
 * Prozess mit Node-Permission-Model oder WASM) ist ADR-0014 V-4 und aendert
 * an dieser Schnittstelle nichts — genau dafuer laeuft I/O ueber ctx-Dienste.
 */

/** Netz-Faehigkeit: ohne Host-Allowlist gibt es keinen Netzzugriff. */
export interface NetzFaehigkeit {
  hosts: string[];
}

export interface Faehigkeiten {
  netz?: NetzFaehigkeit;
  zustand?: boolean;
  timer?: boolean;
}

/**
 * Was ein Baustein tatsaechlich darf. `alt` kennzeichnet Manifeste ohne
 * capabilities-Block: die laufen weiter (Bestandsschutz), bekommen aber
 * niemals Netz. Neue Bausteine deklarieren, was sie brauchen.
 */
export interface AufgeloesteFaehigkeiten {
  netzHosts: readonly string[];
  zustand: boolean;
  timer: boolean;
  alt: boolean;
}

export function loeseFaehigkeitenAuf(f: Faehigkeiten | undefined): AufgeloesteFaehigkeiten {
  if (f === undefined) {
    // Bestandsschutz: Zustand und Timer bleiben erlaubt (beide verlassen den
    // Prozess nicht), Netz ist aus. Netz ist nie implizit.
    return { netzHosts: [], zustand: true, timer: true, alt: true };
  }
  return {
    netzHosts: f.netz?.hosts ?? [],
    zustand: f.zustand !== false,
    timer: f.timer !== false,
    alt: false,
  };
}

/**
 * Darf dieser Baustein diese URL abrufen? Nur https, nur exakte Hosts aus der
 * Allowlist. Kein Suffix-Vergleich: „api.telegram.org" wuerde sonst auch
 * „boese-api.telegram.org.angreifer.de" erlauben.
 */
export function netzZielErlaubt(
  url: string,
  hosts: readonly string[],
): { ok: true; ziel: URL } | { ok: false; grund: string } {
  if (hosts.length === 0) {
    return { ok: false, grund: "Baustein hat keine netz-Faehigkeit im Manifest" };
  }
  let ziel: URL;
  try {
    ziel = new URL(url);
  } catch {
    return { ok: false, grund: `keine gueltige URL: ${url}` };
  }
  if (ziel.protocol !== "https:" && ziel.hostname !== "127.0.0.1" && ziel.hostname !== "localhost") {
    return { ok: false, grund: `nur https erlaubt (war ${ziel.protocol})` };
  }
  if (!hosts.includes(ziel.hostname)) {
    return {
      ok: false,
      grund: `Host ${ziel.hostname} steht nicht in der Allowlist (${hosts.join(", ")})`,
    };
  }
  return { ok: true, ziel };
}

/**
 * Statischer Check des Baustein-Quelltexts (ADR-0014 V-2). Ein Baustein, der
 * sich Node-Module holt, umgeht jede Faehigkeitspruefung — solcher Code wird
 * gar nicht erst geladen.
 *
 * Das ist bewusst eine grobe Textpruefung und KEIN Parser: sie faengt
 * Versehen und Offensichtliches. Wer sie umgehen will, schafft das — dafuer
 * ist V-4 da, und genau so steht es in der Doku.
 */
const VERBOTEN: Array<{ muster: RegExp; was: string }> = [
  // Nacktes fetch waere zwar zur Laufzeit gesperrt — aber ein Baustein soll
  // beim Laden scheitern, nicht erst wenn nachts der Alarm rausgehen soll.
  { muster: /\bfetch\s*\(/, was: "fetch()" },
  { muster: /\bimport\s*\(/, was: "dynamisches import()" },
  { muster: /\bimport\s+[^;]*\bfrom\b/, was: "import ... from" },
  { muster: /\brequire\s*\(/, was: "require()" },
  { muster: /\bnode:[a-z_]+/, was: "node:-Modul" },
  { muster: /\bprocess\s*\./, was: "process" },
  { muster: /\bglobalThis\b/, was: "globalThis" },
  { muster: /\beval\s*\(/, was: "eval()" },
  { muster: /\bFunction\s*\(/, was: "Function-Konstruktor" },
];

export function pruefeBausteinCode(quelltext: string): string[] {
  // Kommentare und Zeichenketten entfernen, sonst meldet jeder Kommentar, der
  // „require()" erwaehnt, einen Fehler. Grob, aber fuer den Zweck ausreichend.
  const ohneKommentare = quelltext
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``");

  const funde: string[] = [];
  for (const { muster, was } of VERBOTEN) {
    if (muster.test(ohneKommentare)) {
      funde.push(
        `${was} ist in Bausteinen nicht erlaubt (ADR-0014 V-2) — I/O laeuft ueber ctx-Dienste`,
      );
    }
  }
  return funde;
}

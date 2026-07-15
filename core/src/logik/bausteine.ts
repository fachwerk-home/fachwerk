/**
 * Stdlib-Bausteine: reine, synchrone Rechenfunktionen (ADR-0008 „compute").
 * Seiteneffekte laufen ausschließlich über den Kontext (Timer, Zustand) —
 * die Engine sammelt sie ein; Bausteine berühren nie selbst die Außenwelt.
 * Die volle Sandbox für Fremd-Bausteine (Worker/WASM) kommt in P4-5.
 */
import type { Wert } from "../datenpunkte/registry.ts";
import { extrahiere, introspizieren, type ExtractFormat, type Feld } from "./extract.ts";

export type Eingaenge = Record<string, Wert | undefined>;
export type Ausgaenge = Record<string, Wert>;

/** Warum ein Baustein gerade läuft. */
export type Ausloeser =
  | { art: "eingang" }
  | { art: "timer"; id: string; nachgeholt: boolean };

export interface BausteinKontext {
  parameter: Readonly<Record<string, unknown>>;
  /** Knoten-lokaler Zustand; wird persistiert (SPEC-002 T-6). */
  zustand: Record<string, Wert>;
  ausloeser: Ausloeser;
  /**
   * Portnamen der Eingänge, deren Quelle in DIESER Kaskade einen frischen Wert
   * bekommen hat (das auslösende Ereignis + alles, was daraus geschrieben
   * wurde). Für flankengetriebene Bausteine (Wertauslöser, Impuls, Klemme).
   */
  frischeEingaenge: ReadonlySet<string>;
  /** Plant/ersetzt den Timer (knoten, id) — SPEC-002 T-1/T-2. */
  planeTimer(id: string, ms: number): void;
  brichAb(id: string): void;
}

export interface Baustein {
  typ: string;
  /** null = keine Ausgabe (z. B. Eingänge unbelegt oder nur Timer geplant). */
  rechne(eingaenge: Eingaenge, ctx: BausteinKontext): Ausgaenge | null;
  /**
   * Konfig-abgeleitete Ports (ADR-0012 K-1). Fehlt sie, gelten feste Ports
   * (offene Verkabelung). Rein aus der Instanz-Konfiguration berechenbar.
   */
  ports?(parameter: Readonly<Record<string, unknown>>): {
    eingaenge: string[];
    ausgaenge: string[];
  };
  /**
   * Datenintrospektion (ADR-0012 K-3): liest ein Beispiel und liefert die
   * verfügbaren Felder für den Editor-Feldpicker/Agenten. Rein, seiteneffektfrei.
   */
  introspizieren?(beispiel: string, parameter: Readonly<Record<string, unknown>>): Feld[];
}

/** Ein gemapptes Feld eines konfig-variablen Extraktions-Bausteins. */
interface ExtractFeld {
  name: string;
  pfad: string;
}

function extractFelder(parameter: Readonly<Record<string, unknown>>): ExtractFeld[] {
  const roh = parameter["felder"];
  if (!Array.isArray(roh)) return [];
  return roh
    .filter((f): f is ExtractFeld => !!f && typeof f.name === "string" && typeof f.pfad === "string")
    .filter((f) => f.name !== "" && f.pfad !== "");
}

const NOT: Baustein = {
  typ: "NOT",
  rechne(e) {
    if (typeof e["in"] !== "boolean") return null;
    return { out: !e["in"] };
  },
};

const AND: Baustein = {
  typ: "AND",
  rechne(e) {
    if (typeof e["a"] !== "boolean" || typeof e["b"] !== "boolean") return null;
    return { out: e["a"] && e["b"] };
  },
};

/** Verzögerung: reicht den Eingangswert nach `ms` weiter; Retrigger ersetzt. */
const VERZOEGERUNG: Baustein = {
  typ: "VERZOEGERUNG",
  rechne(e, ctx) {
    if (ctx.ausloeser.art === "timer") {
      const wert = ctx.zustand["wert"];
      return wert === undefined ? null : { out: wert };
    }
    if (e["in"] === undefined) return null;
    ctx.zustand["wert"] = e["in"];
    ctx.planeTimer("ablauf", Number(ctx.parameter["ms"] ?? 1000));
    return null;
  },
};

/**
 * Treppenlicht: Ein-Impuls schaltet ein und plant das Aus; Retrigger
 * verlängert; Aus-Impuls schaltet sofort aus und bricht den Timer ab.
 * DER Testfall für die Neustart-Regel (SPEC-002 T-5).
 */
const TREPPENLICHT: Baustein = {
  typ: "TREPPENLICHT",
  rechne(e, ctx) {
    if (ctx.ausloeser.art === "timer") return { out: false };
    if (e["in"] === true) {
      ctx.planeTimer("aus", Number(ctx.parameter["ms"] ?? 60_000));
      return { out: true };
    }
    if (e["in"] === false) {
      ctx.brichAb("aus");
      return { out: false };
    }
    return null;
  },
};

const OR: Baustein = {
  typ: "OR",
  rechne(e) {
    if (typeof e["a"] !== "boolean" || typeof e["b"] !== "boolean") return null;
    return { out: e["a"] || e["b"] };
  },
};

const XOR: Baustein = {
  typ: "XOR",
  rechne(e) {
    if (typeof e["a"] !== "boolean" || typeof e["b"] !== "boolean") return null;
    return { out: e["a"] !== e["b"] };
  },
};

/** ODER über bis zu 8 Eingänge e1..e8; unbelegte Eingänge zählen als false. */
const OR8: Baustein = {
  typ: "OR8",
  rechne(e) {
    let einer = false;
    let irgendein = false;
    for (let i = 1; i <= 8; i++) {
      const v = e[`e${i}`];
      if (typeof v === "boolean") {
        irgendein = true;
        einer = einer || v;
      }
    }
    return irgendein ? { out: einer } : null;
  },
};

/**
 * Toggle: steigende Flanke auf `in` wechselt den Ausgang. Optionaler
 * `status`-Eingang synchronisiert den internen Zustand (z. B. Ist-Zustand
 * vom Bus), ohne selbst zu schalten.
 */
const TOGGLE: Baustein = {
  typ: "TOGGLE",
  rechne(e, ctx) {
    if (typeof e["status"] === "boolean") ctx.zustand["aktuell"] = e["status"];
    const vorher = ctx.zustand["letzterIn"] === true;
    ctx.zustand["letzterIn"] = e["in"] === true;
    if (e["in"] === true && !vorher) {
      const neu = !(ctx.zustand["aktuell"] === true);
      ctx.zustand["aktuell"] = neu;
      return { out: neu };
    }
    return null;
  },
};

/** Vergleich: `a` gegen `b` (Eingang) oder Parameter `wert`. */
const VERGLEICH: Baustein = {
  typ: "VERGLEICH",
  rechne(e, ctx) {
    const a = e["a"];
    const b = e["b"] ?? (ctx.parameter["wert"] as Wert | undefined);
    if (typeof a !== "number" || typeof b !== "number") return null;
    const op = String(ctx.parameter["op"] ?? ">=");
    switch (op) {
      case ">": return { out: a > b };
      case ">=": return { out: a >= b };
      case "<": return { out: a < b };
      case "<=": return { out: a <= b };
      case "==": return { out: a === b };
      case "!=": return { out: a !== b };
      default: return null;
    }
  },
};

/**
 * Hysterese: ein bei `in` ≥ Parameter `ein`, aus bei `in` ≤ Parameter `aus`,
 * dazwischen halten (kein Flattern an der Schwelle).
 */
const HYSTERESE: Baustein = {
  typ: "HYSTERESE",
  rechne(e, ctx) {
    const wert = e["in"];
    if (typeof wert !== "number") return null;
    const ein = Number(ctx.parameter["ein"]);
    const aus = Number(ctx.parameter["aus"]);
    if (!Number.isFinite(ein) || !Number.isFinite(aus)) return null;
    const aktiv = ctx.zustand["aktiv"] === true;
    const neu = wert >= ein ? true : wert <= aus ? false : aktiv;
    ctx.zustand["aktiv"] = neu;
    return neu === aktiv && ctx.zustand["initialisiert"] === true
      ? null // unverändert im Halteband: nichts senden
      : ((ctx.zustand["initialisiert"] = true), { out: neu });
  },
};

/**
 * Sperre (Gate): `sperre`=true hält `in` zurück; beim Entsperren wird der
 * zuletzt gehaltene Wert nachgereicht (Parameter `nachreichen`, Default true).
 */
const SPERRE: Baustein = {
  typ: "SPERRE",
  rechne(e, ctx) {
    const gesperrt = e["sperre"] === true;
    const vorherGesperrt = ctx.zustand["gesperrt"] === true;
    ctx.zustand["gesperrt"] = gesperrt;
    if (e["in"] !== undefined) ctx.zustand["gehalten"] = e["in"];
    if (gesperrt) return null;
    if (vorherGesperrt) {
      // Entsperr-Flanke: gehaltenen Wert nachreichen (wenn gewünscht)
      const nachreichen = ctx.parameter["nachreichen"] !== false;
      const gehalten = ctx.zustand["gehalten"];
      return nachreichen && gehalten !== undefined ? { out: gehalten } : null;
    }
    return e["in"] === undefined ? null : { out: e["in"] };
  },
};

/**
 * Fachbaustein Sperrlicht (kuratiert, Community-★★★): Licht mit Sperre und
 * definiertem Verhalten — Parameter `beimSperren` ("aus"|"an"|"halten",
 * Default "aus") und `beimEntsperren` ("wiederherstellen"|"aus"|"halten",
 * Default "wiederherstellen"). Schaltwünsche während der Sperre werden
 * gemerkt, nie verworfen.
 */
const SPERRLICHT: Baustein = {
  typ: "SPERRLICHT",
  rechne(e, ctx) {
    const gesperrt = e["sperre"] === true;
    const vorherGesperrt = ctx.zustand["gesperrt"] === true;
    ctx.zustand["gesperrt"] = gesperrt;

    if (typeof e["schalten"] === "boolean") ctx.zustand["gewuenscht"] = e["schalten"];

    if (gesperrt && !vorherGesperrt) {
      // Sperr-Flanke
      const modus = String(ctx.parameter["beimSperren"] ?? "aus");
      if (modus === "aus") return { out: false };
      if (modus === "an") return { out: true };
      return null; // halten
    }
    if (!gesperrt && vorherGesperrt) {
      // Entsperr-Flanke
      const modus = String(ctx.parameter["beimEntsperren"] ?? "wiederherstellen");
      if (modus === "wiederherstellen") return { out: ctx.zustand["gewuenscht"] === true };
      if (modus === "aus") return { out: false };
      return null; // halten
    }
    if (gesperrt) return null; // Wünsche nur merken
    return typeof e["schalten"] === "boolean" ? { out: e["schalten"] } : null;
  },
};

/** Wertauslöser: bei Flanke am `trigger`-Eingang den Wert `wert` ausgeben. */
const WERTAUSLOESER: Baustein = {
  typ: "WERTAUSLOESER",
  rechne(e, ctx) {
    if (!ctx.frischeEingaenge.has("trigger")) return null;
    const wert = e["wert"] ?? (ctx.parameter["wert"] as Wert | undefined);
    return wert === undefined ? null : { out: wert };
  },
};

/** Impuls: bei Flanke am `trigger` out=true, nach `dauer` ms wieder false. */
const IMPULS: Baustein = {
  typ: "IMPULS",
  rechne(e, ctx) {
    if (ctx.ausloeser.art === "timer") return { out: false };
    if (!ctx.frischeEingaenge.has("trigger")) return null;
    const dauer = Number(e["dauer"] ?? ctx.parameter["ms"] ?? 1000);
    ctx.planeTimer("aus", dauer);
    return { out: true };
  },
};

/** Multiplikation a·b. */
const MULT: Baustein = {
  typ: "MULT",
  rechne(e) {
    if (typeof e["a"] !== "number" || typeof e["b"] !== "number") return null;
    return { out: e["a"] * e["b"] };
  },
};

/** Klemme: leitet den zuletzt frisch eingetroffenen Eingang (in1/in2) durch. */
const KLEMME: Baustein = {
  typ: "KLEMME",
  rechne(e, ctx) {
    // Bei mehreren frischen Eingängen gewinnt der höher nummerierte (deterministisch).
    for (const port of ["in2", "in1"]) {
      if (ctx.frischeEingaenge.has(port) && e[port] !== undefined) return { out: e[port] as Wert };
    }
    return null;
  },
};

/**
 * Wenn-Dann-Sonst: `eingang` OP `vergleich` ? `dann` : `sonst`.
 * OP als Parameter/Eingang `op` (EQ/NE/GT/GE/LT/LE). Werte per Eingang ODER
 * Parameter. Gibt bei jeder Auswertung die passende Seite aus.
 */
const WENN_DANN_SONST: Baustein = {
  typ: "WENN_DANN_SONST",
  rechne(e, ctx) {
    const p = ctx.parameter;
    const eingang = e["eingang"];
    if (typeof eingang !== "number") return null;
    const vergleich = Number(e["vergleich"] ?? p["vergleich"]);
    if (!Number.isFinite(vergleich)) return null;
    const op = String(e["op"] ?? p["op"] ?? "EQ").toUpperCase();
    let wahr: boolean;
    switch (op) {
      case "EQ": wahr = eingang === vergleich; break;
      case "NE": wahr = eingang !== vergleich; break;
      case "GT": wahr = eingang > vergleich; break;
      case "GE": wahr = eingang >= vergleich; break;
      case "LT": wahr = eingang < vergleich; break;
      case "LE": wahr = eingang <= vergleich; break;
      default: return null; // BT/IN/AB/LS noch nicht unterstützt
    }
    const dann = e["dann"] ?? (p["dann"] as Wert | undefined);
    const sonst = e["sonst"] ?? (p["sonst"] as Wert | undefined);
    const out = wahr ? dann : sonst;
    return out === undefined ? null : { out };
  },
};

/**
 * EXTRACT: extrahiert eine KONFIGURIERBARE Menge benannter Felder aus einem
 * strukturierten Dokument (ADR-0012 — konfig-variable Ports, keine feste
 * „N-fach"-Arität). Ein Baustein, zwei Formate (Parameter `format`: json|xml)
 * mit je passender Pfadsprache (extract.ts). Läuft am `text`-Eingang.
 *
 * Konfiguration: `felder: [{ name, pfad }]`. Ausgänge = die Feld-Namen + status.
 * Introspektion zeigt dem Editor/Agenten die verfügbaren Felder eines Beispiels.
 */
const EXTRACT: Baustein = {
  typ: "EXTRACT",
  rechne(e, ctx) {
    const text = e["text"];
    if (typeof text !== "string") return null;
    const format: ExtractFormat =
      String(ctx.parameter["format"] ?? "json") === "xml" ? "xml" : "json";
    const ausgabe: Ausgaenge = {};
    const fehler: string[] = [];
    for (const feld of extractFelder(ctx.parameter)) {
      const r = extrahiere(format, text, feld.pfad);
      if (r.ok && r.wert !== undefined) ausgabe[feld.name] = r.wert;
      else if (!r.ok) fehler.push(`${feld.name}: ${r.fehler}`);
    }
    ausgabe["status"] = fehler.length === 0 ? "ok" : fehler.join("; ");
    return ausgabe;
  },
  ports(parameter) {
    return {
      eingaenge: ["text"],
      ausgaenge: [...extractFelder(parameter).map((f) => f.name), "status"],
    };
  },
  introspizieren(beispiel, parameter) {
    const format: ExtractFormat =
      String(parameter["format"] ?? "json") === "xml" ? "xml" : "json";
    return introspizieren(format, beispiel);
  },
};

const STDLIB = new Map<string, Baustein>(
  [
    NOT, AND, OR, OR8, XOR, TOGGLE, VERGLEICH, HYSTERESE, SPERRE, VERZOEGERUNG,
    TREPPENLICHT, SPERRLICHT, WERTAUSLOESER, IMPULS, MULT, KLEMME, WENN_DANN_SONST,
    EXTRACT,
  ].map((b) => [b.typ, b]),
);

export function findeBaustein(typ: string): Baustein | undefined {
  return STDLIB.get(typ);
}

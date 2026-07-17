/**
 * Stdlib-Bausteine: reine, synchrone Rechenfunktionen (ADR-0008 „compute").
 * Seiteneffekte laufen ausschließlich über den Kontext (Timer, Zustand) —
 * die Engine sammelt sie ein; Bausteine berühren nie selbst die Außenwelt.
 * Die volle Sandbox für Fremd-Bausteine (Worker/WASM) kommt in P4-5.
 */
import type { Wert } from "../datenpunkte/registry.ts";
import { extrahiere, introspizieren, type ExtractFormat, type Feld } from "./extract.ts";
import { formelAuswerten } from "./formel.ts";

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
   * Zeitentkoppelt (ADR-0005 E-6): die Ausgänge entstehen NIE in der
   * auslösenden Kaskade, sondern ausschließlich über Timer. Solche Kanten
   * sind keine statischen Ordnungs-Constraints — genau damit bricht ein
   * Verzögerungs-Baustein Rückkopplungen legal.
   */
  entkoppelt?: boolean;
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

/** Kopie: reicht `in` unverändert durch — für Datenpunkt→Datenpunkt-Routen. */
const KOPIE: Baustein = {
  typ: "KOPIE",
  rechne(e) {
    return e["in"] === undefined ? null : { out: e["in"] };
  },
};

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
  entkoppelt: true, // Ausgang kommt IMMER per Timer — legaler Zyklusbrecher (E-6)
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
 * Parameter `modus: "freigabe"` invertiert den Steuereingang: durchlassen,
 * wenn `sperre`=true („Entsperrt"-Logik des Referenzsystems).
 */
const SPERRE: Baustein = {
  typ: "SPERRE",
  rechne(e, ctx) {
    const freigabe = String(ctx.parameter["modus"] ?? "") === "freigabe";
    const gesperrt = freigabe ? e["sperre"] !== true : e["sperre"] === true;
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

/** Anzahl konfig-variabler Ports (default 2), begrenzt auf sinnvolle Grenze. */
function portAnzahl(parameter: Readonly<Record<string, unknown>>): number {
  const n = Number(parameter["anzahl"] ?? 2);
  return Number.isFinite(n) ? Math.max(1, Math.min(100, Math.trunc(n))) : 2;
}

/**
 * SPLIT: zerlegt `text` am `separator` in konfigurierbar viele benannte Teile
 * (ADR-0012 — Anzahl aus Config, nicht fix „10-fach"). Ports: text (Eingang);
 * out teil1..teilN + optional rest (übrige Teile, wieder mit Separator verbunden).
 */
const SPLIT: Baustein = {
  typ: "SPLIT",
  rechne(e, ctx) {
    const text = e["text"];
    if (typeof text !== "string") return null;
    const sep = String(e["separator"] ?? ctx.parameter["separator"] ?? "");
    const teile = sep === "" ? [...text] : text.split(sep);
    const n = portAnzahl(ctx.parameter);
    const ausgabe: Ausgaenge = {};
    for (let i = 1; i <= n; i++) ausgabe[`teil${i}`] = teile[i - 1] ?? "";
    if (ctx.parameter["rest"] !== false) ausgabe["rest"] = teile.slice(n).join(sep);
    return ausgabe;
  },
  ports(parameter) {
    const n = portAnzahl(parameter);
    const ausgaenge: string[] = [];
    for (let i = 1; i <= n; i++) ausgaenge.push(`teil${i}`);
    if (parameter["rest"] !== false) ausgaenge.push("rest");
    return { eingaenge: ["text"], ausgaenge };
  },
};

/**
 * JOIN: verbindet konfigurierbar viele Eingänge teil1..teilN mit `separator`
 * zu einem String (ADR-0012). Parameter `modus`: „ohne_leere" überspringt leere
 * Eingänge (Default: alle verbinden). Ports: teil1..teilN (Eingang) → out text.
 */
const JOIN: Baustein = {
  typ: "JOIN",
  rechne(e, ctx) {
    const n = portAnzahl(ctx.parameter);
    const sep = String(ctx.parameter["separator"] ?? "");
    const ohneLeere = String(ctx.parameter["modus"] ?? "") === "ohne_leere";
    const teile: string[] = [];
    for (let i = 1; i <= n; i++) {
      const v = e[`teil${i}`];
      if (v === undefined) continue;
      const s = String(v);
      if (ohneLeere && s === "") continue;
      teile.push(s);
    }
    if (teile.length === 0) return null;
    return { text: teile.join(sep) };
  },
  ports(parameter) {
    const n = portAnzahl(parameter);
    const eingaenge: string[] = [];
    for (let i = 1; i <= n; i++) eingaenge.push(`teil${i}`);
    return { eingaenge, ausgaenge: ["text"] };
  },
};

/**
 * Formelberechnung: wertet `formel` (Parameter oder Eingang) über den
 * Variablen $x, $a..$e aus — Arithmetik + Funktions-Whitelist (formel.ts).
 * Ungültige Formel oder unbelegte Variable ⇒ keine Ausgabe (nie raten).
 */
const FORMEL: Baustein = {
  typ: "FORMEL",
  rechne(e, ctx) {
    const formel = String(e["formel"] ?? ctx.parameter["formel"] ?? "");
    if (formel === "") return null;
    const variablen: Record<string, number> = {};
    for (const name of ["x", "a", "b", "c", "d", "e"]) {
      const wert = e[name];
      if (typeof wert === "number") variablen[name] = wert;
      else if (typeof wert === "string" && wert !== "" && Number.isFinite(Number(wert))) {
        variablen[name] = Number(wert);
      }
    }
    const ergebnis = formelAuswerten(formel, variablen);
    return ergebnis === null ? null : { out: ergebnis };
  },
};

/** 8 Bool-Eingänge bit0..bit7 → Byte (unbelegt = 0). */
const BITS_ZU_BYTE: Baustein = {
  typ: "BITS_ZU_BYTE",
  rechne(e) {
    let byte = 0;
    let irgendein = false;
    for (let i = 0; i < 8; i++) {
      const v = e[`bit${i}`];
      if (typeof v === "boolean") {
        irgendein = true;
        if (v) byte |= 1 << i;
      }
    }
    return irgendein ? { out: byte } : null;
  },
};

/**
 * Vergleichsliste (konfig-variabel, ADR-0012): vergleicht `in` mit den
 * Parametern w1..wN — Ausgänge eq1..eqN + `ne` (keiner passt). Ersetzt die
 * „=Konstante N-fach"-Familie.
 */
const VERGLEICH_LISTE: Baustein = {
  typ: "VERGLEICH_LISTE",
  rechne(e, ctx) {
    const wert = e["in"];
    if (wert === undefined) return null;
    const n = portAnzahl(ctx.parameter);
    const ausgabe: Ausgaenge = {};
    let getroffen = false;
    for (let i = 1; i <= n; i++) {
      const k = ctx.parameter[`w${i}`];
      const gleich = k !== undefined && String(wert) === String(k);
      ausgabe[`eq${i}`] = gleich;
      getroffen ||= gleich;
    }
    ausgabe["ne"] = !getroffen;
    return ausgabe;
  },
  ports(parameter) {
    const n = portAnzahl(parameter);
    const ausgaenge: string[] = [];
    for (let i = 1; i <= n; i++) ausgaenge.push(`eq${i}`);
    ausgaenge.push("ne");
    return { eingaenge: ["in"], ausgaenge };
  },
};

/**
 * Wenn-Dann-Liste (konfig-variabel): erster passender Vergleich gewinnt —
 * `in` == vergl_i (Eingang oder Parameter) ⇒ Ausgabe = wert_i. Stringvergleich
 * wie im Vorbild („Wenn-Dann-Vergleich N-fach").
 */
const WENN_LISTE: Baustein = {
  typ: "WENN_LISTE",
  rechne(e, ctx) {
    const wert = e["in"];
    if (wert === undefined) return null;
    const n = portAnzahl(ctx.parameter);
    for (let i = 1; i <= n; i++) {
      const vergl = e[`vergl${i}`] ?? (ctx.parameter[`vergl${i}`] as Wert | undefined);
      if (vergl === undefined) continue;
      if (String(wert) === String(vergl)) {
        const aus = e[`wert${i}`] ?? (ctx.parameter[`wert${i}`] as Wert | undefined);
        return aus === undefined ? null : { out: aus };
      }
    }
    return null;
  },
  ports(parameter) {
    const n = portAnzahl(parameter);
    const eingaenge = ["in"];
    for (let i = 1; i <= n; i++) eingaenge.push(`vergl${i}`, `wert${i}`);
    return { eingaenge, ausgaenge: ["out"] };
  },
};

/**
 * Matrix (konfig-variabel): routet den Wert von Eingang Nr. `wahl_eingang`
 * auf Ausgang Nr. `wahl_ausgang` (e1..eN → a1..aN).
 */
const MATRIX: Baustein = {
  typ: "MATRIX",
  rechne(e, ctx) {
    const n = portAnzahl(ctx.parameter);
    const ein = Number(e["wahl_eingang"] ?? ctx.parameter["wahl_eingang"]);
    const aus = Number(e["wahl_ausgang"] ?? ctx.parameter["wahl_ausgang"]);
    if (!Number.isInteger(ein) || ein < 1 || ein > n) return null;
    if (!Number.isInteger(aus) || aus < 1 || aus > n) return null;
    const wert = e[`e${ein}`];
    return wert === undefined ? null : { [`a${aus}`]: wert };
  },
  ports(parameter) {
    const n = portAnzahl(parameter);
    const eingaenge: string[] = [];
    const ausgaenge: string[] = [];
    for (let i = 1; i <= n; i++) {
      eingaenge.push(`e${i}`);
      ausgaenge.push(`a${i}`);
    }
    eingaenge.push("wahl_eingang", "wahl_ausgang");
    return { eingaenge, ausgaenge };
  },
};

// ---- Zeit-Gruppe -------------------------------------------------------------
// Alle Zeit-Bausteine sind PUR: die Uhrzeit kommt als normaler Eingang (vom
// Uhr-Dienst über einen System-Datenpunkt) — deterministisch und testbar.
// Kein Baustein liest die Wanduhr.

/** "HH:MM" oder "HH:MM:SS" → Sekunden seit Mitternacht; null bei Unsinn. */
function parseUhrzeit(wert: Wert | undefined): number | null {
  if (typeof wert !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(wert.trim());
  if (!m) return null;
  const [h, min, s] = [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)];
  if (h > 23 || min > 59 || s > 59) return null;
  return h * 3600 + min * 60 + s;
}

/**
 * Zeitbereich: liegt `zeit` zwischen `von` und `bis`? Mit Mitternachts-
 * Überlauf: von 20:00 bis 06:00 heißt „abends ODER früh morgens".
 * Zeiten als "HH:MM[:SS]" — Eingang oder Parameter.
 */
const ZEITVERGLEICH: Baustein = {
  typ: "ZEITVERGLEICH",
  rechne(e, ctx) {
    const zeit = parseUhrzeit(e["zeit"] ?? (ctx.parameter["zeit"] as Wert | undefined));
    const von = parseUhrzeit(e["von"] ?? (ctx.parameter["von"] as Wert | undefined));
    const bis = parseUhrzeit(e["bis"] ?? (ctx.parameter["bis"] as Wert | undefined));
    if (zeit === null || von === null || bis === null) return null;
    const drin = von <= bis ? zeit >= von && zeit <= bis : zeit >= von || zeit <= bis;
    return { out: drin };
  },
};

/** Zwei Uhrzeiten vergleichen: A>B / A<B / A=B (jeweils eigener Ausgang). */
const ZEITVERGLEICH_AB: Baustein = {
  typ: "ZEITVERGLEICH_AB",
  rechne(e, ctx) {
    const a = parseUhrzeit(e["a"] ?? (ctx.parameter["a"] as Wert | undefined));
    const b = parseUhrzeit(e["b"] ?? (ctx.parameter["b"] as Wert | undefined));
    if (a === null || b === null) return null;
    return { gt: a > b, lt: a < b, eq: a === b };
  },
};

/**
 * Zeitformatierung/-verschiebung: nimmt Unix-Sekunden (zahl) ODER "HH:MM[:SS]"
 * (text), addiert `offset` (Sekunden) und formatiert per strftime-Teilmenge:
 * %H %M %S %d %m %Y %X (=%H:%M:%S). Zeitzone = Prozess-TZ (Container: TZ-Env).
 */
const ZEITFORMAT: Baustein = {
  typ: "ZEITFORMAT",
  rechne(e, ctx) {
    const roh = e["zeit"];
    const offset = Number(e["offset"] ?? ctx.parameter["offset"] ?? 0);
    const format = String(e["format"] ?? ctx.parameter["format"] ?? "%X");
    if (!Number.isFinite(offset)) return null;

    let d: Date;
    if (typeof roh === "number" && Number.isFinite(roh)) {
      d = new Date((roh + offset) * 1000);
    } else {
      const sek = parseUhrzeit(roh);
      if (sek === null) return null;
      // Reine Uhrzeit: Sekundenarithmetik mit Tages-Wrap, kein Kalender nötig.
      const s = ((sek + Math.trunc(offset)) % 86_400 + 86_400) % 86_400;
      d = new Date(2000, 0, 1, Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60);
    }
    if (Number.isNaN(d.getTime())) return null;

    const z2 = (n: number): string => String(n).padStart(2, "0");
    const out = format
      .replaceAll("%X", "%H:%M:%S")
      .replaceAll("%H", z2(d.getHours()))
      .replaceAll("%M", z2(d.getMinutes()))
      .replaceAll("%S", z2(d.getSeconds()))
      .replaceAll("%d", z2(d.getDate()))
      .replaceAll("%m", z2(d.getMonth() + 1))
      .replaceAll("%Y", String(d.getFullYear()));
    return { out };
  },
};

const STDLIB = new Map<string, Baustein>(
  [
    KOPIE, NOT, AND, OR, OR8, XOR, TOGGLE, VERGLEICH, HYSTERESE, SPERRE, VERZOEGERUNG,
    TREPPENLICHT, SPERRLICHT, WERTAUSLOESER, IMPULS, MULT, KLEMME, WENN_DANN_SONST,
    EXTRACT, SPLIT, JOIN, ZEITVERGLEICH, ZEITVERGLEICH_AB, ZEITFORMAT, FORMEL,
    BITS_ZU_BYTE, VERGLEICH_LISTE, WENN_LISTE, MATRIX,
  ].map((b) => [b.typ, b]),
);

export function findeBaustein(typ: string): Baustein | undefined {
  return STDLIB.get(typ);
}

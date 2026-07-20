/**
 * Auth & Scopes (P5-12, ADR-0009 A-3/A-4) — DEV-Niveau, aber ehrlich gebaut.
 *
 * Drei Wege an die API, ein einziger Begriff dahinter (`Identitaet`):
 *   1. Sitzung   — Nutzer meldet sich mit Passwort an, bekommt ein Sitzungs-
 *                  Token (Cookie HttpOnly ODER Bearer; Agenten koennen beides).
 *   2. Statisches Token — FACHWERK_API_TOKEN, Scopes konfigurierbar.
 *                  Agent-first: ein Skript soll ohne Login arbeiten koennen.
 *   3. Anonym    — nur solange NICHTS konfiguriert ist; dann gilt ausschliesslich
 *                  `read`. Ein unkonfiguriertes Fachwerk ist lesbar, nie schreibbar.
 *
 * Passwoerter: scrypt aus `node:crypto`. Bewusst NICHT argon2 — das waere ein
 * natives Paket und damit ein Bruch der Null-Dependency-Linie (und der
 * Zusage, dass ein Container ohne Toolchain baut). scrypt ist speicherhart
 * und Teil der Standardbibliothek; das ist fuer DEV-Niveau der richtige Tausch.
 *
 * Sitzungs-Token werden NUR als SHA-256 gespeichert. Wer die Datei
 * `sitzungen.sqlite` in die Finger bekommt, bekommt damit keine gueltige
 * Sitzung — dasselbe Argument wie bei Passwoertern.
 */
import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parse, stringify } from "yaml";

/** Die vier Rechte des Systems (ADR-0009 A-3). Mehr gibt es bewusst nicht. */
export type Scope = "read" | "operate" | "write:gewerk" | "activate:dev";

export const ALLE_SCOPES: readonly Scope[] = [
  "read",
  "operate",
  "write:gewerk",
  "activate:dev",
];

export function istScope(s: string): s is Scope {
  return (ALLE_SCOPES as readonly string[]).includes(s);
}

/**
 * Wer fragt gerade an. `token` traegt das rohe Sitzungs-Token mit, damit
 * /api/logout genau diese Sitzung beenden kann (und keine fremde).
 */
export interface Identitaet {
  name: string;
  art: "sitzung" | "token" | "anonym";
  scopes: readonly Scope[];
  token?: string;
}

/** Anonyme Identitaet: darf lesen, sonst nichts. */
export const ANONYM: Identitaet = { name: "anonym", art: "anonym", scopes: ["read"] };

export function hatScope(identitaet: Identitaet, scope: Scope): boolean {
  return identitaet.scopes.includes(scope);
}

// ---- Passwoerter -----------------------------------------------------------

const SCRYPT_N = 16384;
const SCRYPT_r = 8;
const SCRYPT_p = 1;
const SCRYPT_LEN = 32;

/**
 * Erzeugt `scrypt$N$r$p$salt$hash` (beides base64). Das Format traegt seine
 * Parameter selbst — steigen die Kosten spaeter, bleiben alte Hashes pruefbar.
 */
export function hashePasswort(passwort: string): string {
  const salz = randomBytes(16);
  const hash = scryptSync(passwort, salz, SCRYPT_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_r,
    p: SCRYPT_p,
    // scrypt braucht bei N=16384 mehr als den Node-Default von 32 MB.
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_r}$${SCRYPT_p}$${salz.toString("base64")}$${hash.toString("base64")}`;
}

/**
 * Prueft ein Passwort gegen einen gespeicherten Hash — zeitkonstant im
 * Vergleich. Ein kaputter oder unbekannter Hash ergibt `false`, nie einen
 * Wurf: eine defekte Zeile in nutzer.yaml darf keinen Login-Endpunkt killen.
 */
export function pruefePasswort(passwort: string, gespeichert: string): boolean {
  const teile = gespeichert.split("$");
  if (teile.length !== 6 || teile[0] !== "scrypt") return false;
  const N = Number(teile[1]);
  const r = Number(teile[2]);
  const p = Number(teile[3]);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  try {
    const salz = Buffer.from(teile[4]!, "base64");
    const soll = Buffer.from(teile[5]!, "base64");
    const ist = scryptSync(passwort, salz, soll.length, {
      N,
      r,
      p,
      maxmem: 256 * 1024 * 1024,
    });
    return ist.length === soll.length && timingSafeEqual(ist, soll);
  } catch {
    return false;
  }
}

/** Zeitkonstanter Textvergleich (statische Tokens). */
export function gleichSicher(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  // Laengen sind ohnehin oeffentlich beobachtbar; gleiche Laenge erzwingen,
  // damit timingSafeEqual nicht wirft.
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

// ---- nutzer.yaml -----------------------------------------------------------

export interface NutzerEintrag {
  hash: string;
  scopes: Scope[];
}

/**
 * Liest `nutzer.yaml`. Die Datei liegt im DATEN-Verzeichnis, NICHT im Gewerk:
 * das Gewerk ist versionierte Definition und wandert in ein oeffentliches Git —
 * Passwort-Hashes haben dort nichts verloren.
 */
export function ladeNutzer(pfad: string): {
  nutzer: Map<string, NutzerEintrag>;
  fehler: string[];
} {
  const nutzer = new Map<string, NutzerEintrag>();
  const fehler: string[] = [];
  if (!existsSync(pfad)) return { nutzer, fehler };
  let roh: unknown;
  try {
    roh = parse(readFileSync(pfad, "utf8"));
  } catch (e) {
    return { nutzer, fehler: [`nicht lesbar: ${e instanceof Error ? e.message : String(e)}`] };
  }
  if (roh === null || roh === undefined) return { nutzer, fehler };
  if (typeof roh !== "object" || Array.isArray(roh)) {
    return { nutzer, fehler: ["Wurzel muss eine Abbildung name -> {hash, scopes} sein"] };
  }
  for (const [name, wert] of Object.entries(roh as Record<string, unknown>)) {
    const eintrag = wert as { hash?: unknown; scopes?: unknown } | null;
    if (typeof eintrag?.hash !== "string" || eintrag.hash === "") {
      fehler.push(`${name}: hash fehlt`);
      continue;
    }
    if (!Array.isArray(eintrag.scopes)) {
      fehler.push(`${name}: scopes fehlt oder ist keine Liste`);
      continue;
    }
    const scopes: Scope[] = [];
    let schlecht = false;
    for (const s of eintrag.scopes) {
      if (typeof s !== "string" || !istScope(s)) {
        fehler.push(`${name}: unbekannter Scope ${String(s)}`);
        schlecht = true;
        break;
      }
      scopes.push(s);
    }
    // Ein Nutzer mit unklaren Rechten wird NICHT teilweise uebernommen —
    // sonst laeuft jemand mit weniger (oder mehr) Rechten herum als gedacht.
    if (!schlecht) nutzer.set(name, { hash: eintrag.hash, scopes });
  }
  return { nutzer, fehler };
}

/** Schreibt `nutzer.yaml` (CLI). Rechte 0600, soweit die Plattform das kennt. */
export function schreibeNutzer(pfad: string, nutzer: Map<string, NutzerEintrag>): void {
  const objekt: Record<string, NutzerEintrag> = {};
  for (const name of [...nutzer.keys()].sort()) objekt[name] = nutzer.get(name)!;
  mkdirSync(dirname(pfad), { recursive: true });
  writeFileSync(pfad, stringify(objekt), { encoding: "utf8", mode: 0o600 });
}

// ---- Sitzungen -------------------------------------------------------------

/**
 * Ablage der Sitzungen. Als Schnittstelle, damit der Auth-Dienst testbar
 * bleibt, ohne SQLite anzufassen (die Umsetzung liegt in sitzungen.ts).
 */
export interface SitzungsSpeicher {
  lege(hash: string, nutzer: string, scopes: readonly Scope[], ablauf: number): void;
  finde(hash: string): { nutzer: string; scopes: Scope[]; ablauf: number } | null;
  loesche(hash: string): void;
  /** Entfernt abgelaufene Sitzungen; gibt die Anzahl zurueck. */
  raeumeAuf(jetzt: number): number;
}

export function tokenHash(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

// ---- Rate-Limit je IP ------------------------------------------------------

/**
 * Gleitendes Fenster je Absender-IP — fuer den Login. Die Schreibbremse (P5-8)
 * ist global und schuetzt das Gewerk; hier geht es um etwas anderes: Passwoerter
 * durchprobieren. Deshalb pro IP und deutlich strenger (Default 5/min).
 */
export class IpBremse {
  readonly #grenze: number;
  readonly #fensterMs: number;
  readonly #jetzt: () => number;
  readonly #zeiten = new Map<string, number[]>();

  constructor(opts: { grenze?: number; fensterMs?: number; jetzt?: () => number } = {}) {
    this.#grenze = opts.grenze ?? 5;
    this.#fensterMs = opts.fensterMs ?? 60_000;
    this.#jetzt = opts.jetzt ?? Date.now;
  }

  /** true = durchgelassen (und verbucht); false = Grenze erreicht. */
  versuche(ip: string): boolean {
    const t = this.#jetzt();
    const frisch = (this.#zeiten.get(ip) ?? []).filter((z) => t - z < this.#fensterMs);
    // Aufraeumen im selben Zug: sonst waechst die Karte bei wechselnden
    // Absender-IPs unbegrenzt (ein Angreifer bestimmt die IP mit).
    for (const [andere, zeiten] of this.#zeiten) {
      if (andere !== ip && zeiten.every((z) => t - z >= this.#fensterMs)) {
        this.#zeiten.delete(andere);
      }
    }
    if (frisch.length >= this.#grenze) {
      this.#zeiten.set(ip, frisch);
      return false;
    }
    frisch.push(t);
    this.#zeiten.set(ip, frisch);
    return true;
  }

  get grenze(): number {
    return this.#grenze;
  }

  get fensterS(): number {
    return Math.round(this.#fensterMs / 1000);
  }
}

// ---- Der Dienst ------------------------------------------------------------

export interface AuthDienstOptionen {
  /** Pfad zu nutzer.yaml (im Daten-, nicht im Gewerk-Verzeichnis). */
  nutzerPfad: string;
  sitzungen: SitzungsSpeicher;
  /** Statisches Token (FACHWERK_API_TOKEN) — Agent-first. */
  statischesToken?: string | undefined;
  /** Scopes des statischen Tokens (Default read + operate). */
  statischeScopes?: readonly Scope[];
  /** Gueltigkeit einer Sitzung (Default 30 Tage). */
  gueltigkeitMs?: number;
  jetzt?: () => number;
  loginBremse?: IpBremse;
  onMeldung?: (m: string) => void;
}

export type AnmeldeErgebnis =
  | { ok: true; token: string; ablauf: number; nutzer: string; scopes: readonly Scope[] }
  | { ok: false; status: number; grund: string };

export class AuthDienst {
  readonly #opts: AuthDienstOptionen;
  readonly #jetzt: () => number;
  readonly #gueltigkeitMs: number;
  readonly #bremse: IpBremse;
  #nutzer: Map<string, NutzerEintrag>;

  constructor(opts: AuthDienstOptionen) {
    this.#opts = opts;
    this.#jetzt = opts.jetzt ?? Date.now;
    this.#gueltigkeitMs = opts.gueltigkeitMs ?? 30 * 24 * 60 * 60 * 1000;
    this.#bremse = opts.loginBremse ?? new IpBremse({ jetzt: this.#jetzt });
    this.#nutzer = new Map();
    this.ladeNutzerNeu();
    opts.sitzungen.raeumeAuf(this.#jetzt());
  }

  /** nutzer.yaml erneut einlesen (CLI legt Nutzer im laufenden Betrieb an). */
  ladeNutzerNeu(): void {
    const { nutzer, fehler } = ladeNutzer(this.#opts.nutzerPfad);
    for (const f of fehler) this.#opts.onMeldung?.(`nutzer.yaml: ${f}`);
    this.#nutzer = nutzer;
  }

  /**
   * Ist Auth ueberhaupt scharf? Genau dann, wenn es etwas zu pruefen gibt:
   * mindestens ein Nutzer oder ein statisches Token. Sonst laeuft die API
   * anonym-lesend weiter (unveraendertes Verhalten vor P5-12).
   */
  get aktiv(): boolean {
    return this.#nutzer.size > 0 || !!this.#opts.statischesToken;
  }

  get anzahlNutzer(): number {
    return this.#nutzer.size;
  }

  get statischeScopes(): readonly Scope[] {
    return this.#opts.statischeScopes ?? ["read", "operate"];
  }

  /**
   * Ordnet einem rohen Token (Bearer oder Cookie) eine Identitaet zu.
   * null = kein oder ungueltiges Token.
   */
  identifiziere(roh: string | undefined): Identitaet | null {
    if (roh === undefined || roh === "") return null;
    const statisch = this.#opts.statischesToken;
    if (statisch !== undefined && statisch !== "" && gleichSicher(roh, statisch)) {
      return { name: "token", art: "token", scopes: this.statischeScopes };
    }
    const sitzung = this.#opts.sitzungen.finde(tokenHash(roh));
    if (!sitzung) return null;
    if (sitzung.ablauf <= this.#jetzt()) {
      this.#opts.sitzungen.loesche(tokenHash(roh));
      return null;
    }
    return { name: sitzung.nutzer, art: "sitzung", scopes: sitzung.scopes, token: roh };
  }

  /**
   * Anmeldung. Fehlerhafte Angaben liefern IMMER dieselbe Meldung — ob ein
   * Nutzername existiert, geht den Anfragenden nichts an.
   */
  anmelden(name: unknown, passwort: unknown, ip: string): AnmeldeErgebnis {
    if (!this.#bremse.versuche(ip)) {
      return {
        ok: false,
        status: 429,
        grund: `zu viele Anmeldeversuche (max. ${this.#bremse.grenze} in ${this.#bremse.fensterS} s)`,
      };
    }
    if (typeof name !== "string" || typeof passwort !== "string") {
      return { ok: false, status: 400, grund: "name und passwort muessen Text sein" };
    }
    const eintrag = this.#nutzer.get(name);
    // Auch ohne Treffer rechnen: sonst verraet die Antwortzeit, welche
    // Nutzernamen es gibt. Der Dummy-Hash kostet dasselbe wie ein echter.
    const hash = eintrag?.hash ?? DUMMY_HASH;
    const passt = pruefePasswort(passwort, hash);
    if (!eintrag || !passt) {
      return { ok: false, status: 401, grund: "Anmeldung fehlgeschlagen" };
    }
    const token = randomBytes(32).toString("base64url");
    const ablauf = this.#jetzt() + this.#gueltigkeitMs;
    this.#opts.sitzungen.lege(tokenHash(token), name, eintrag.scopes, ablauf);
    return { ok: true, token, ablauf, nutzer: name, scopes: eintrag.scopes };
  }

  abmelden(token: string): void {
    this.#opts.sitzungen.loesche(tokenHash(token));
  }
}

/**
 * Hash eines Zufallspassworts, gegen den bei unbekanntem Nutzernamen gerechnet
 * wird (siehe `anmelden`). Einmal beim Laden des Moduls erzeugt.
 */
const DUMMY_HASH = hashePasswort(randomBytes(24).toString("base64"));

/**
 * Tests des Auth-Kerns (P5-12): Passwort-Hash, Nutzerdatei, Sitzungen,
 * Rate-Limit. Der Sitzungs-Speicher wird hier durch eine Karte ersetzt —
 * die SQLite-Variante ist eine reine Umsetzung derselben Schnittstelle.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import {
  AuthDienst,
  IpBremse,
  hashePasswort,
  istScope,
  ladeNutzer,
  pruefePasswort,
  schreibeNutzer,
  tokenHash,
  type Scope,
  type SitzungsSpeicher,
} from "./auth.ts";

function tempDatei(name: string, inhalt?: string): string {
  const dir = mkdtempSync(join(tmpdir(), "fachwerk-auth-"));
  const pfad = join(dir, name);
  if (inhalt !== undefined) writeFileSync(pfad, inhalt, "utf8");
  return pfad;
}

/** Sitzungen im Speicher — genau die Schnittstelle, die der Dienst braucht. */
function karteSpeicher(): SitzungsSpeicher & { groesse: () => number } {
  const karte = new Map<string, { nutzer: string; scopes: Scope[]; ablauf: number }>();
  return {
    lege: (hash, nutzer, scopes, ablauf) =>
      void karte.set(hash, { nutzer, scopes: [...scopes], ablauf }),
    finde: (hash) => karte.get(hash) ?? null,
    loesche: (hash) => void karte.delete(hash),
    raeumeAuf: (jetzt) => {
      let n = 0;
      for (const [h, s] of karte) {
        if (s.ablauf <= jetzt) {
          karte.delete(h);
          n++;
        }
      }
      return n;
    },
    groesse: () => karte.size,
  };
}

// ---- Passwoerter -----------------------------------------------------------

test("Hash prueft das richtige Passwort und lehnt das falsche ab", () => {
  const hash = hashePasswort("richtig-geraten-42");
  expect(pruefePasswort("richtig-geraten-42", hash)).toBe(true);
  expect(pruefePasswort("falsch", hash)).toBe(false);
});

test("gleiches Passwort ergibt verschiedene Hashes (Salz)", () => {
  expect(hashePasswort("gleich")).not.toBe(hashePasswort("gleich"));
});

test("kaputter Hash wirft nicht, sondern sagt nein", () => {
  for (const murks of ["", "argon2$x", "scrypt$a$b$c$d$e", "scrypt$16384$8$1$@@@"]) {
    expect(pruefePasswort("egal", murks)).toBe(false);
  }
});

// ---- nutzer.yaml -----------------------------------------------------------

test("Nutzerdatei: Runde durch Schreiben und Lesen", () => {
  const pfad = tempDatei("nutzer.yaml");
  const karte = new Map([
    ["anna", { hash: hashePasswort("passwort-anna"), scopes: ["read", "operate"] as Scope[] }],
    ["bert", { hash: hashePasswort("passwort-bert"), scopes: ["read"] as Scope[] }],
  ]);
  schreibeNutzer(pfad, karte);
  const gelesen = ladeNutzer(pfad);
  expect(gelesen.fehler).toEqual([]);
  expect([...gelesen.nutzer.keys()]).toEqual(["anna", "bert"]);
  expect(pruefePasswort("passwort-anna", gelesen.nutzer.get("anna")!.hash)).toBe(true);
});

test("fehlende Datei ist kein Fehler, nur leer", () => {
  const erg = ladeNutzer(join(tmpdir(), "gibt-es-nicht-4711", "nutzer.yaml"));
  expect(erg.nutzer.size).toBe(0);
  expect(erg.fehler).toEqual([]);
});

test("Nutzer mit unbekanntem Scope wird verworfen, nicht halb uebernommen", () => {
  const pfad = tempDatei(
    "nutzer.yaml",
    "anna:\n  hash: scrypt$1$1$1$aa$bb\n  scopes: [read, allmacht]\n" +
      "bert:\n  hash: scrypt$1$1$1$aa$bb\n  scopes: [read]\n",
  );
  const erg = ladeNutzer(pfad);
  expect(erg.nutzer.has("anna")).toBe(false);
  expect(erg.nutzer.has("bert")).toBe(true);
  expect(erg.fehler.join(" ")).toContain("allmacht");
});

test("istScope kennt genau die vier Rechte", () => {
  expect(istScope("read")).toBe(true);
  expect(istScope("activate:dev")).toBe(true);
  expect(istScope("admin")).toBe(false);
});

// ---- Anmeldung -------------------------------------------------------------

function dienstAufbau(opts: { jetzt?: () => number; token?: string } = {}): {
  dienst: AuthDienst;
  sitzungen: ReturnType<typeof karteSpeicher>;
} {
  const pfad = tempDatei("nutzer.yaml");
  schreibeNutzer(
    pfad,
    new Map([
      ["anna", { hash: hashePasswort("passwort-anna"), scopes: ["read", "operate"] as Scope[] }],
    ]),
  );
  const sitzungen = karteSpeicher();
  const dienst = new AuthDienst({
    nutzerPfad: pfad,
    sitzungen,
    ...(opts.token !== undefined ? { statischesToken: opts.token } : {}),
    ...(opts.jetzt ? { jetzt: opts.jetzt } : {}),
    // Grosszuegig, damit die Bremse nicht die fachlichen Tests stoert.
    loginBremse: new IpBremse({ grenze: 1000 }),
  });
  return { dienst, sitzungen };
}

test("Anmeldung liefert ein Token, das eine Identitaet mit den Scopes ergibt", () => {
  const { dienst } = dienstAufbau();
  const erg = dienst.anmelden("anna", "passwort-anna", "10.0.0.1");
  expect(erg.ok).toBe(true);
  if (!erg.ok) return;
  const identitaet = dienst.identifiziere(erg.token);
  expect(identitaet).toMatchObject({ name: "anna", art: "sitzung", scopes: ["read", "operate"] });
});

test("falsches Passwort und unbekannter Nutzer sind ununterscheidbar", () => {
  const { dienst } = dienstAufbau();
  const falsch = dienst.anmelden("anna", "daneben", "10.0.0.1");
  const fremd = dienst.anmelden("niemand", "daneben", "10.0.0.1");
  expect(falsch).toEqual({ ok: false, status: 401, grund: "Anmeldung fehlgeschlagen" });
  expect(fremd).toEqual(falsch);
});

test("Sitzungen werden nur als Hash abgelegt", () => {
  const { dienst, sitzungen } = dienstAufbau();
  const erg = dienst.anmelden("anna", "passwort-anna", "10.0.0.1");
  if (!erg.ok) throw new Error("Anmeldung sollte klappen");
  expect(sitzungen.finde(erg.token)).toBeNull();
  expect(sitzungen.finde(tokenHash(erg.token))).not.toBeNull();
});

test("abgelaufene Sitzung gilt nicht mehr und wird entsorgt", () => {
  let jetzt = 1_000_000;
  const { dienst, sitzungen } = dienstAufbau({ jetzt: () => jetzt });
  const erg = dienst.anmelden("anna", "passwort-anna", "10.0.0.1");
  if (!erg.ok) throw new Error("Anmeldung sollte klappen");
  expect(dienst.identifiziere(erg.token)).not.toBeNull();
  jetzt = erg.ablauf + 1;
  expect(dienst.identifiziere(erg.token)).toBeNull();
  expect(sitzungen.groesse()).toBe(0);
});

test("Abmelden entwertet das Token sofort", () => {
  const { dienst } = dienstAufbau();
  const erg = dienst.anmelden("anna", "passwort-anna", "10.0.0.1");
  if (!erg.ok) throw new Error("Anmeldung sollte klappen");
  dienst.abmelden(erg.token);
  expect(dienst.identifiziere(erg.token)).toBeNull();
});

test("statisches Token bekommt read+operate als Default", () => {
  const { dienst } = dienstAufbau({ token: "geheim-token" });
  expect(dienst.identifiziere("geheim-token")).toMatchObject({
    art: "token",
    scopes: ["read", "operate"],
  });
  expect(dienst.identifiziere("geheim-toke")).toBeNull();
  expect(dienst.identifiziere(undefined)).toBeNull();
});

test("aktiv ist Auth erst, wenn es etwas zu pruefen gibt", () => {
  const leer = new AuthDienst({
    nutzerPfad: join(tmpdir(), "gibt-es-nicht-4712", "nutzer.yaml"),
    sitzungen: karteSpeicher(),
  });
  expect(leer.aktiv).toBe(false);
  expect(dienstAufbau().dienst.aktiv).toBe(true);
});

// ---- Rate-Limit ------------------------------------------------------------

test("Login-Bremse zaehlt je IP und laeuft nach dem Fenster wieder an", () => {
  let jetzt = 0;
  const bremse = new IpBremse({ grenze: 3, fensterMs: 60_000, jetzt: () => jetzt });
  expect([1, 2, 3].map(() => bremse.versuche("10.0.0.1"))).toEqual([true, true, true]);
  expect(bremse.versuche("10.0.0.1")).toBe(false);
  // Ein anderer Absender ist davon unberuehrt.
  expect(bremse.versuche("10.0.0.2")).toBe(true);
  jetzt = 60_001;
  expect(bremse.versuche("10.0.0.1")).toBe(true);
});

test("der Dienst weist zu viele Anmeldeversuche mit 429 ab", () => {
  const pfad = tempDatei("nutzer.yaml");
  schreibeNutzer(
    pfad,
    new Map([["anna", { hash: hashePasswort("passwort-anna"), scopes: ["read"] as Scope[] }]]),
  );
  const dienst = new AuthDienst({
    nutzerPfad: pfad,
    sitzungen: karteSpeicher(),
    loginBremse: new IpBremse({ grenze: 2, fensterMs: 60_000, jetzt: () => 0 }),
  });
  dienst.anmelden("anna", "falsch", "10.0.0.9");
  dienst.anmelden("anna", "falsch", "10.0.0.9");
  const dritter = dienst.anmelden("anna", "passwort-anna", "10.0.0.9");
  // Auch das RICHTIGE Passwort kommt nicht durch — sonst waere die Bremse
  // genau fuer den Fall wirkungslos, gegen den sie gebaut ist.
  expect(dritter).toMatchObject({ ok: false, status: 429 });
});

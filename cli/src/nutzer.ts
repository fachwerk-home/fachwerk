/**
 * `fachwerk nutzer …` (P5-12) — Nutzerverwaltung fuer die API.
 *
 * Das Passwort kommt AUSSCHLIESSLICH ueber stdin, nie ueber argv: Argumente
 * stehen in der Prozessliste und in der Shell-Historie. Dadurch funktioniert
 * beides — interaktiv (Eingabe, Wiederholung) und im Skript:
 *
 *     printf 'geheim\n' | fachwerk nutzer anlegen anna --scopes read,operate
 *
 * Die Datei `nutzer.yaml` liegt im DATEN-Verzeichnis (FACHWERK_DATEN_DIR),
 * nicht im Gewerk: das Gewerk ist versionierte Definition und wandert in ein
 * Git-Repo — Passwort-Hashes haben dort nichts verloren.
 */
import { join } from "node:path";
import { createInterface } from "node:readline";
import {
  ALLE_SCOPES,
  hashePasswort,
  istScope,
  ladeNutzer,
  schreibeNutzer,
  SqliteSitzungen,
  type NutzerEintrag,
  type Scope,
} from "@fachwerk/core";

function datenDir(): string {
  return process.env["FACHWERK_DATEN_DIR"] ?? "./daten";
}

function nutzerPfad(): string {
  return join(datenDir(), "nutzer.yaml");
}

/** Liest eine Zeile von stdin (ohne Echo-Unterdrueckung — siehe Hinweis unten). */
async function liesZeile(aufforderung: string): Promise<string> {
  if (process.stdin.isTTY) process.stderr.write(aufforderung);
  const rl = createInterface({ input: process.stdin, terminal: false });
  const zeile = await new Promise<string>((auf) => {
    rl.once("line", (l: string) => auf(l));
    rl.once("close", () => auf(""));
  });
  rl.close();
  return zeile;
}

/**
 * `--scopes a,b,c` aus den Argumenten ziehen. Default ist bewusst knapp:
 * lesen und bedienen. Wer das Gewerk aendern darf, sagt es ausdruecklich.
 */
function leseScopes(args: string[]): { scopes: Scope[] } | { fehler: string } {
  const i = args.indexOf("--scopes");
  if (i < 0) return { scopes: ["read", "operate"] };
  const roh = args[i + 1];
  if (!roh) return { fehler: "--scopes braucht eine Liste, z. B. --scopes read,operate" };
  const scopes: Scope[] = [];
  for (const s of roh.split(",").map((t) => t.trim()).filter((t) => t !== "")) {
    if (!istScope(s)) {
      return { fehler: `unbekannter Scope „${s}" (erlaubt: ${ALLE_SCOPES.join(", ")})` };
    }
    if (!scopes.includes(s)) scopes.push(s);
  }
  if (scopes.length === 0) return { fehler: "--scopes ist leer" };
  return { scopes };
}

/**
 * Beendet alle Sitzungen eines Nutzers. Nach einer Passwortaenderung oder dem
 * Loeschen eines Kontos MUSS das passieren — sonst laeuft ein altes
 * Sitzungs-Cookie 30 Tage weiter, obwohl das Passwort schon Geschichte ist.
 */
function beendeSitzungen(name: string): number {
  try {
    const s = new SqliteSitzungen(join(datenDir(), "sitzungen.sqlite"));
    const n = s.loescheNutzer(name);
    s.schliesse();
    return n;
  } catch {
    // Kein Sitzungs-Speicher (API lief nie) — dann gibt es auch nichts zu beenden.
    return 0;
  }
}

export async function nutzer(args: string[]): Promise<number> {
  const [unterkommando, name] = [args[0], args[1]];

  if (unterkommando === "liste") {
    const { nutzer: karte, fehler } = ladeNutzer(nutzerPfad());
    for (const f of fehler) console.error(`WARNUNG: nutzer.yaml: ${f}`);
    if (karte.size === 0) {
      console.log(`Keine Nutzer in ${nutzerPfad()} — anlegen mit: fachwerk nutzer anlegen <name>`);
      return 0;
    }
    for (const [n, e] of [...karte].sort(([a], [b]) => a.localeCompare(b))) {
      console.log(`${n}\t${e.scopes.join(",")}`);
    }
    return 0;
  }

  if (unterkommando !== "anlegen" && unterkommando !== "entfernen") {
    console.error(
      "Aufruf: fachwerk nutzer anlegen <name> [--scopes read,operate] · " +
        "fachwerk nutzer entfernen <name> · fachwerk nutzer liste",
    );
    console.error(`Scopes: ${ALLE_SCOPES.join(", ")}`);
    return 2;
  }
  if (!name) {
    console.error(`Aufruf: fachwerk nutzer ${unterkommando} <name>`);
    return 2;
  }

  const { nutzer: karte, fehler } = ladeNutzer(nutzerPfad());
  for (const f of fehler) console.error(`WARNUNG: nutzer.yaml: ${f}`);

  if (unterkommando === "entfernen") {
    if (!karte.delete(name)) {
      console.error(`FEHLER: Nutzer „${name}" existiert nicht.`);
      return 1;
    }
    schreibeNutzer(nutzerPfad(), karte);
    const beendet = beendeSitzungen(name);
    console.log(
      `Nutzer „${name}" entfernt${beendet > 0 ? ` — ${beendet} Sitzung(en) beendet` : ""}.`,
    );
    return 0;
  }

  const scopeErg = leseScopes(args);
  if ("fehler" in scopeErg) {
    console.error(`FEHLER: ${scopeErg.fehler}`);
    return 2;
  }

  const vorhanden = karte.has(name);
  // Kein Echo-Unterdruecken: das ist plattformabhaengig und faellt auf
  // Windows-Terminals regelmaessig auf die Nase. Stattdessen der ehrliche
  // Hinweis — und der Skriptweg ueber die Pipe, der ohnehin der wichtigere ist.
  if (process.stdin.isTTY) {
    console.error("Hinweis: die Eingabe ist SICHTBAR. Fuer Skripte: printf 'pw\\n' | fachwerk …");
  }
  const passwort = await liesZeile(`Passwort fuer „${name}": `);
  if (passwort.length < 8) {
    console.error("FEHLER: Passwort muss mindestens 8 Zeichen haben.");
    return 1;
  }
  if (process.stdin.isTTY) {
    const wiederholung = await liesZeile("Wiederholung: ");
    if (wiederholung !== passwort) {
      console.error("FEHLER: die Eingaben stimmen nicht ueberein.");
      return 1;
    }
  }

  const eintrag: NutzerEintrag = { hash: hashePasswort(passwort), scopes: scopeErg.scopes };
  karte.set(name, eintrag);
  schreibeNutzer(nutzerPfad(), karte);
  const beendet = vorhanden ? beendeSitzungen(name) : 0;
  console.log(
    `Nutzer „${name}" ${vorhanden ? "aktualisiert" : "angelegt"} in ${nutzerPfad()} ` +
      `— Scopes: ${scopeErg.scopes.join(", ")}` +
      (beendet > 0 ? ` (${beendet} alte Sitzung(en) beendet)` : ""),
  );
  if (!vorhanden) {
    console.error(
      "Hinweis: die Auth ist damit scharf — ab jetzt braucht JEDE /api-Anfrage " +
        "eine Anmeldung (Neustart des Dienstes noetig).",
    );
  }
  return 0;
}

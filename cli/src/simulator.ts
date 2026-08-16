/**
 * `fachwerk simulator` — Datenpunkte einer laufenden Instanz in Bewegung
 * versetzen, damit man zustandsabhaengige Anzeigen pruefen kann.
 *
 * Warum es das gibt: eine importierte Visu zeigt ihre halbe Wahrheit erst,
 * wenn sich Werte aendern. Ob ein Schalter umschlaegt, ein Symbol die Farbe
 * wechselt oder eine Beschriftung wandert, sieht man am ruhenden Bild nicht —
 * und an einer Anlage im Beobachtungsmodus bewegt sich nichts, weil niemand
 * schreibt. Ohne dieses Werkzeug bleibt nur: am echten Bus schalten und
 * hinueberlaufen.
 *
 * Es spricht ausschliesslich die HTTP-API der eigenen Instanz an und schreibt
 * damit auf denselben Wegen wie jeder Bediener. Der Beobachtungsmodus bleibt
 * unangetastet: interne Datenpunkte aendern sich, auf den Bus geht nichts.
 */
import { setTimeout as schlafe } from "node:timers/promises";

interface Datenpunkt {
  schluessel: string;
  name: string;
  klasse: string;
  typ: string;
  wert: unknown;
}

interface Optionen {
  basis: string;
  token?: string;
  muster: RegExp;
  intervallMs: number;
  laeufe: number;
  nurIntern: boolean;
  trocken: boolean;
}

function hilfe(): void {
  console.log(`Aufruf: fachwerk simulator [Optionen]

  --host <url>        Basis der laufenden Instanz (Standard http://localhost:8300)
  --nutzer <name>     Anmeldung mit einem Nutzerkonto; das Passwort kommt ueber
                      stdin, nie ueber die Kommandozeile
  --token <t>         stattdessen ein statisches Bearer-Token
  --nur <muster>      nur Datenpunkte, deren Schluessel darauf passt (regulaerer Ausdruck)
  --intervall <ms>    Abstand zwischen zwei Schritten (Standard 1500)
  --laeufe <n>        Anzahl Durchlaeufe; 0 = endlos (Standard 0)
  --auch-bus          auch Bus-Datenpunkte schreiben (Standard: nur interne)
  --trocken           nur zeigen, was geschrieben wuerde

Beispiele:
  printf 'geheim\\n' | fachwerk simulator --nutzer julian --nur '^status\\.'
  fachwerk simulator --token geheim --intervall 800 --laeufe 3`);
}

/**
 * Naechster Wert eines Datenpunkts. Bewusst schlicht und vorhersagbar: bool
 * kippt, Zahlen wandern eine feste Treppe hoch und springen zurueck. Zufall
 * waere hier ein Feind — man will ja nachvollziehen koennen, welcher Wert
 * welche Anzeige ausgeloest hat.
 */
export function naechsterWert(dp: Pick<Datenpunkt, "typ" | "wert">): unknown {
  if (dp.typ === "bool") return dp.wert !== true;
  if (dp.typ === "zahl") {
    const stufen = [0, 1, 20, 50, 100, 255];
    const jetzt = typeof dp.wert === "number" ? dp.wert : 0;
    // Die naechsthoehere Stufe; von der letzten wieder auf die erste.
    return stufen.find((s) => s > jetzt) ?? stufen[0];
  }
  // Text: zwischen zwei erkennbaren Zustaenden wechseln.
  return dp.wert === "AN" ? "AUS" : "AN";
}

/**
 * Mit Nutzerkonto anmelden und das Sitzungstoken holen.
 *
 * Das Passwort kommt ueber stdin, nie ueber argv — Argumente stehen in der
 * Prozessliste und in der Shell-Historie. Genauso macht es `nutzer anlegen`,
 * und im Skript sieht beides gleich aus:
 *
 *     printf 'geheim\n' | fachwerk simulator --nutzer julian
 */
async function melde_an(basis: string, name: string): Promise<string> {
  const passwort = (await new Promise<string>((fertig) => {
    let puffer = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (teil) => void (puffer += teil));
    process.stdin.on("end", () => fertig(puffer));
  })).split("\n")[0]?.trim() ?? "";
  if (passwort === "") throw new Error("kein Passwort auf stdin — printf 'geheim\n' | fachwerk simulator …");
  const antwort = await fetch(`${basis}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: basis },
    body: JSON.stringify({ name, passwort }),
  });
  if (!antwort.ok) throw new Error(`Anmeldung als "${name}" abgelehnt (${antwort.status})`);
  const daten = (await antwort.json()) as { token?: string };
  if (!daten.token) throw new Error("Anmeldung lieferte kein Token");
  return daten.token;
}

async function hole(opt: Optionen, pfad: string): Promise<unknown> {
  const antwort = await fetch(`${opt.basis}${pfad}`, {
    headers: opt.token ? { authorization: `Bearer ${opt.token}` } : {},
  });
  if (!antwort.ok) {
    throw new Error(`${pfad} antwortet ${antwort.status} — Token noetig oder Instanz nicht erreichbar?`);
  }
  return antwort.json();
}

export async function simulator(argv: string[]): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    hilfe();
    return 0;
  }
  const wert = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const basis = (wert("--host") ?? "http://localhost:8300").replace(/\/$/, "");
  let token = wert("--token");
  const nutzer = wert("--nutzer");
  if (nutzer) {
    try {
      token = await melde_an(basis, nutzer);
    } catch (e) {
      console.error(`FEHLER: ${e instanceof Error ? e.message : String(e)}`);
      return 1;
    }
  }
  const opt: Optionen = {
    basis,
    ...(token ? { token } : {}),
    muster: new RegExp(wert("--nur") ?? ""),
    intervallMs: Number(wert("--intervall") ?? 1500),
    laeufe: Number(wert("--laeufe") ?? 0),
    nurIntern: !argv.includes("--auch-bus"),
    trocken: argv.includes("--trocken"),
  };

  let liste: Datenpunkt[];
  try {
    const roh = (await hole(opt, "/api/datenpunkte")) as { datenpunkte?: Datenpunkt[] } | Datenpunkt[];
    liste = Array.isArray(roh) ? roh : (roh.datenpunkte ?? []);
  } catch (e) {
    console.error(`FEHLER: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }

  const ziele = liste.filter(
    (d) => opt.muster.test(d.schluessel) && (!opt.nurIntern || d.klasse === "intern"),
  );
  if (ziele.length === 0) {
    console.error("Keine passenden Datenpunkte. Ohne --auch-bus werden nur interne genommen.");
    return 1;
  }

  console.error(
    `${ziele.length} Datenpunkt(e), alle ${opt.intervallMs} ms` +
      `${opt.laeufe > 0 ? `, ${opt.laeufe} Durchlaeufe` : ", endlos (Strg+C beendet)"}` +
      `${opt.trocken ? " — TROCKEN, es wird nichts geschrieben" : ""}`,
  );
  if (opt.trocken) {
    for (const d of ziele) {
      console.log(`  ${d.schluessel} (${d.typ}) ${JSON.stringify(d.wert)} -> ${JSON.stringify(naechsterWert(d))}`);
    }
    return 0;
  }

  const stand = new Map(ziele.map((d) => [d.schluessel, d.wert]));
  for (let lauf = 0; opt.laeufe === 0 || lauf < opt.laeufe; lauf++) {
    for (const d of ziele) {
      const neu = naechsterWert({ typ: d.typ, wert: stand.get(d.schluessel) });
      stand.set(d.schluessel, neu);
      const antwort = await fetch(`${opt.basis}/api/datenpunkte/${d.schluessel}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: opt.basis,
          ...(opt.token ? { authorization: `Bearer ${opt.token}` } : {}),
        },
        body: JSON.stringify({ wert: neu }),
      });
      const zeichen = antwort.ok ? "·" : "!";
      process.stderr.write(zeichen);
      if (!antwort.ok && antwort.status === 403) {
        console.error(`\nFEHLER: ${d.schluessel} abgelehnt (403). Fehlt der Scope operate, oder ist der Punkt geschuetzt?`);
        return 1;
      }
      await schlafe(opt.intervallMs);
    }
    process.stderr.write("\n");
  }
  return 0;
}

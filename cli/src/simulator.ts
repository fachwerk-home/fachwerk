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
  dauerMs: number;
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
  --laeufe <n>        Anzahl Durchlaeufe; 0 = unbegrenzt (Standard 0)
  --dauer <s>         nach so vielen Sekunden von selbst aufhoeren. Verlaesst
                      sich NICHT auf Strg+C: "docker exec -i" ohne -t reicht
                      Tastatursignale gar nicht an den Container weiter
  --auch-bus          auch Bus-Datenpunkte schreiben (Standard: nur interne)
  --setze <wert>      EINEN festen Wert schreiben und aufhoeren, statt zu
                      wandern. Genau das braucht man, um eine Anzeige fuer
                      einen Abzug in einen bestimmten Zustand zu bringen.
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
  // Eine unbekannte Option ist ein Abbruchgrund, keine Kleinigkeit. Wer
  // --setze an eine aeltere Fassung schickt, die das noch nicht kennt, bekaeme
  // sonst wortlos die wandernde Betriebsart und einen Lauf ohne Ende — genau
  // das ist an einer echten Anlage zweimal passiert. Lieber laut abbrechen und
  // damit gleich verraten, dass der Dienst nicht auf dem erwarteten Stand ist.
  const MIT_WERT = ["--host", "--token", "--nutzer", "--nur", "--intervall", "--laeufe", "--dauer", "--setze"];
  const OHNE_WERT = ["--auch-bus", "--trocken", "--help", "-h"];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith("-")) continue;
    if (MIT_WERT.includes(a)) {
      if (argv[i + 1] === undefined || argv[i + 1]!.startsWith("--")) {
        console.error(`FEHLER: ${a} braucht einen Wert.`);
        return 2;
      }
      i++;
      continue;
    }
    if (OHNE_WERT.includes(a)) continue;
    console.error(`FEHLER: unbekannte Option „${a}". Bekannt sind: ${[...MIT_WERT, ...OHNE_WERT].join(", ")}`);
    return 2;
  }
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
    dauerMs: Number(wert("--dauer") ?? 0) * 1000,
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
      `${opt.laeufe > 0 ? `, ${opt.laeufe} Durchlaeufe` : ""}` +
      `${opt.dauerMs > 0 ? `, ${opt.dauerMs / 1000} s lang` : ""}` +
      `${opt.laeufe === 0 && opt.dauerMs === 0 ? ", unbegrenzt — mit --dauer oder --laeufe begrenzen" : ""}` +
      `${opt.trocken ? " — TROCKEN, es wird nichts geschrieben" : ""}`,
  );
  // Fester Wert: einmal schreiben, fertig. Kein Warten, keine Schleife.
  const festerWert = wert("--setze");
  if (festerWert !== undefined) {
    let geschrieben = 0;
    for (const d of ziele) {
      // Der Text von der Kommandozeile im Typ des Datenpunkts: "1" auf einem
      // bool-Punkt muss true werden, sonst lehnt die API ab.
      const zahl = Number(festerWert);
      const w = d.typ === "bool"
        ? festerWert === "1" || festerWert.toLowerCase() === "true"
        : d.typ === "zahl" && Number.isFinite(zahl) ? zahl : festerWert;
      if (opt.trocken) {
        console.log(`  ${d.schluessel} (${d.typ}) ${JSON.stringify(d.wert)} -> ${JSON.stringify(w)}`);
        continue;
      }
      const antwort = await fetch(`${opt.basis}/api/datenpunkte/${d.schluessel}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: opt.basis,
          ...(opt.token ? { authorization: `Bearer ${opt.token}` } : {}),
        },
        body: JSON.stringify({ wert: w }),
      });
      if (antwort.ok) geschrieben++;
      else console.error(`  ${d.schluessel}: abgelehnt (${antwort.status})`);
    }
    if (!opt.trocken) console.error(`${geschrieben} von ${ziele.length} gesetzt.`);
    return geschrieben > 0 || opt.trocken ? 0 : 1;
  }

  if (opt.trocken) {
    for (const d of ziele) {
      console.log(`  ${d.schluessel} (${d.typ}) ${JSON.stringify(d.wert)} -> ${JSON.stringify(naechsterWert(d))}`);
    }
    return 0;
  }

  // Abbruch sauber behandeln. Zwei Gruende: `docker exec` OHNE -t leitet
  // Strg+C gar nicht erst weiter (dort hilft nur -it oder docker stop), und
  // selbst mit Signal wuerde eine laufende Wartezeit den Abbruch verschleppen.
  // Deshalb ein eigener Schalter, den jede Schleifenrunde prueft.
  let abbruch = false;
  const aufSignal = (): void => {
    if (abbruch) process.exit(130); // zweimal Strg+C: sofort raus
    abbruch = true;
    console.error("\nAbbruch angefordert — laufender Schritt wird noch beendet.");
  };
  process.on("SIGINT", aufSignal);
  process.on("SIGTERM", aufSignal);

  const stand = new Map(ziele.map((d) => [d.schluessel, d.wert]));
  const gesperrt = new Set<string>();
  const start = Date.now();
  const zeitAbgelaufen = (): boolean => opt.dauerMs > 0 && Date.now() - start >= opt.dauerMs;
  for (let lauf = 0; (opt.laeufe === 0 || lauf < opt.laeufe) && !abbruch && !zeitAbgelaufen(); lauf++) {
    for (const d of ziele) {
      if (abbruch || zeitAbgelaufen()) break;
      if (gesperrt.has(d.schluessel)) continue;
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
      if (antwort.status === 403) {
        // Geschuetzte Datenpunkte (Schloesser, Alarm, Tore) sind mit KEINEM
        // Scope schreibbar — Absicht, kein Fehlerfall. Wer deswegen den ganzen
        // Lauf abbricht, macht den Simulator in jedem echten Gewerk
        // unbrauchbar: es genuegt ein Tuerkontakt in der Liste. Also einmal
        // melden und den Punkt fallenlassen.
        gesperrt.add(d.schluessel);
        console.error(`\n  uebersprungen: ${d.schluessel} (403 — geschuetzt oder Recht fehlt)`);
        continue;
      }
      process.stderr.write(antwort.ok ? "·" : "!");
      await schlafe(opt.intervallMs);
    }
    process.stderr.write("\n");
  }
  process.off("SIGINT", aufSignal);
  process.off("SIGTERM", aufSignal);
  if (gesperrt.size > 0) {
    console.error(`${gesperrt.size} Datenpunkt(e) uebersprungen (geschuetzt oder ohne Recht).`);
  }
  // Alles uebersprungen heisst: nichts bewegt. Das ist ein Fehlschlag, auch
  // wenn jeder einzelne Schritt "nur" abgelehnt wurde.
  return gesperrt.size === ziele.length ? 1 : 0;
}

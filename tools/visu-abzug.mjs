#!/usr/bin/env node
/**
 * DOM-Abzug einer Visu-Seite fuer tools/visu-vergleich.mjs — ohne Handarbeit.
 *
 * Warum es das gibt: der Vergleich (docs/VISU-TREUE-PLAN.md) braucht je Seite
 * einen Abzug, in dem die BERECHNETEN Formangaben als Inline-Stile stehen.
 * Bisher hiess das: Seite oeffnen, Entwicklerwerkzeuge, Schnipsel einfuegen,
 * Ergebnis kopieren, speichern — je Seite und je Zustand. Das ist der Grund,
 * warum nach jeder Runde nur eine Seite nachgemessen wurde.
 *
 * Dieses Werkzeug steuert einen Chromium-Browser (Chrome oder Edge, beide
 * liegen auf Windows ohnehin vor) ueber das DevTools-Protokoll. Der WebSocket-
 * Client ist in Node 24 eingebaut; es kommt KEINE Abhaengigkeit dazu.
 *
 *   node tools/visu-abzug.mjs <url> <ziel.html> [Optionen]
 *
 * Optionen:
 *   --selektor .canvas      Wurzel, unter der Stile eingetragen werden
 *   --warte 1500            Millisekunden Ruhe nach dem Laden (Schriften, WS)
 *   --breite 1024 --hoehe 768   Fenstergroesse (bestimmt die Skalierung!)
 *   --setze schluessel=wert Datenpunkt VOR dem Abzug ueber die API setzen
 *                           (mehrfach moeglich; Wert als JSON, sonst Text)
 *   --basis http://host:8300  API-Basis fuer --setze (Standard: Origin der URL)
 *   --nutzer name           als Nutzer anmelden (Passwort aus FACHWERK_PASSWORT,
 *                           nie aus argv); die Sitzung wird dem Browser als
 *                           Cookie mitgegeben — der verlaessliche Weg, denn nur
 *                           so bekommt die Seite ihren Live-Kanal
 *   --token T               statisches Bearer-Token fuer --setze (Standard:
 *                           FACHWERK_API_TOKEN). Reicht fuer die API; die Seite
 *                           selbst braucht derzeit --nutzer (siehe unten)
 *   --browser pfad          Chromium-Binary (Standard: FACHWERK_BROWSER oder Suche)
 *   --profil verzeichnis    dauerhaftes Browserprofil — fuer Seiten, die eine
 *                           Anmeldung per Cookie brauchen: einmal mit
 *                           --sichtbar anmelden, danach kopflos weiter
 *   --sichtbar              Browserfenster zeigen statt kopflos
 *
 * Beispiel — Fachwerk, Licht-Seite im Zustand „an":
 *   FACHWERK_PASSWORT=... node tools/visu-abzug.mjs \
 *        "http://localhost:8300/visu.html?seite=licht_eg" abzug/licht_eg_an.html \
 *        --nutzer julian --setze licht.eg.status=true
 *
 * Warum nicht einfach ?token=: Die Visu nimmt ein statisches Token zwar aus
 * der URL entgegen, kann es aber nicht an den WebSocket haengen (Browser
 * setzen dort keine Header). Der Kanal wird abgewiesen, die Rueckfrage an
 * /api/ich laeuft ohne Token, und die Seite zeigt den Login. Das ist ein
 * offener Befund der UI (ui/src/lib/api.ts), kein Problem dieses Werkzeugs.
 *
 * Dasselbe Werkzeug zieht die Seite der Altanlage ab (nur gerendertes DOM der
 * eigenen Nutzdaten, kein Quelltext): URL der Altanlage, --profil mit
 * erfolgter Anmeldung, ohne --setze.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

// ---------------------------------------------------------------------------
// Argumente
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const positionen = [];
const optionen = new Map();
const setze = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--sichtbar") optionen.set("sichtbar", "1");
  else if (a === "--setze") setze.push(argv[++i]);
  else if (a.startsWith("--")) optionen.set(a.slice(2), argv[++i]);
  else positionen.push(a);
}
const [url, ziel] = positionen;
if (!url || !ziel) {
  console.error("Aufruf: node tools/visu-abzug.mjs <url> <ziel.html> [--selektor .canvas] [--setze k=v ...]");
  process.exit(2);
}
const selektor = optionen.get("selektor") ?? ".canvas";
const warteMs = Number(optionen.get("warte") ?? 1500);
const breite = Number(optionen.get("breite") ?? 1024);
const hoehe = Number(optionen.get("hoehe") ?? 768);
const basis = optionen.get("basis") ?? new URL(url).origin;
const seitenUrl = new URL(url);

// Anmeldung: entweder Sitzung (Nutzer + Passwort -> Token + Cookie) oder
// statisches Token. Die Sitzung ist der Weg fuer die Seite selbst.
let token = optionen.get("token") ?? process.env.FACHWERK_API_TOKEN ?? "";
let sitzungsCookie = null;
const nutzer = optionen.get("nutzer");
if (nutzer) {
  const passwort = process.env.FACHWERK_PASSWORT;
  if (!passwort) {
    console.error("--nutzer braucht das Passwort in FACHWERK_PASSWORT (nie als Argument).");
    process.exit(2);
  }
  const antwort = await fetch(`${basis}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: nutzer, passwort }),
  });
  if (!antwort.ok) {
    console.error(`FEHLER: Anmeldung als ${nutzer} -> HTTP ${antwort.status}: ${(await antwort.text()).slice(0, 200)}`);
    process.exit(1);
  }
  const k = await antwort.json();
  token = k.token;
  sitzungsCookie = { name: "fachwerk_sitzung", value: encodeURIComponent(k.token) };
  console.error(`angemeldet: ${nutzer} (${(k.scopes ?? []).join(",")})`);
}

// ---------------------------------------------------------------------------
// Browser finden und starten
// ---------------------------------------------------------------------------
const KANDIDATEN = [
  process.env.FACHWERK_BROWSER,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);
const browserPfad = optionen.get("browser") ?? KANDIDATEN.find((p) => existsSync(p));
if (!browserPfad) {
  console.error("Kein Chromium gefunden. --browser <pfad> oder FACHWERK_BROWSER setzen.");
  process.exit(2);
}

const profilTemporaer = !optionen.has("profil");
const profil = optionen.get("profil") ?? mkdtempSync(join(tmpdir(), "fachwerk-abzug-"));
const browser = spawn(browserPfad, [
  ...(optionen.has("sichtbar") ? [] : ["--headless=new"]),
  "--remote-debugging-port=0",
  `--user-data-dir=${profil}`,
  `--window-size=${breite},${hoehe}`,
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-extensions",
  "--disable-background-networking",
  "--hide-scrollbars",
  "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });

function aufraeumen() {
  try { browser.kill(); } catch { /* schon weg */ }
  if (profilTemporaer) {
    // Chrome gibt das Profil erst nach dem Beenden frei — kurz warten.
    setTimeout(() => { try { rmSync(profil, { recursive: true, force: true }); } catch { /* egal */ } }, 500);
  }
}
process.on("exit", aufraeumen);
process.on("SIGINT", () => process.exit(130));

/** Die DevTools-Adresse meldet der Browser auf stderr. */
const browserWs = await new Promise((loese, lehneAb) => {
  let puffer = "";
  const timer = setTimeout(() => lehneAb(new Error("Browser meldet keine DevTools-Adresse (10 s)")), 10_000);
  browser.stderr.on("data", (teil) => {
    puffer += teil.toString();
    const m = /DevTools listening on (ws:\/\/\S+)/.exec(puffer);
    if (m) { clearTimeout(timer); loese(m[1]); }
  });
  browser.on("exit", (code) => { clearTimeout(timer); lehneAb(new Error(`Browser beendet (Code ${code})\n${puffer}`)); });
});

// ---------------------------------------------------------------------------
// Winziger CDP-Client: Befehl -> Antwort, Ereignisse per Warten
// ---------------------------------------------------------------------------
const ws = new WebSocket(browserWs);
await new Promise((loese, lehneAb) => { ws.onopen = loese; ws.onerror = () => lehneAb(new Error("DevTools-WebSocket nicht erreichbar")); });

let naechsteId = 0;
const offen = new Map();
const lauscher = [];
ws.onmessage = (ev) => {
  const nachricht = JSON.parse(String(ev.data));
  if (nachricht.id !== undefined) {
    const { loese, lehneAb } = offen.get(nachricht.id) ?? {};
    offen.delete(nachricht.id);
    if (nachricht.error) lehneAb?.(new Error(`${nachricht.error.message} (${nachricht.error.code})`));
    else loese?.(nachricht.result);
  } else {
    for (const l of lauscher) l(nachricht);
  }
};

function befehl(methode, params = {}, sessionId) {
  const id = ++naechsteId;
  return new Promise((loese, lehneAb) => {
    offen.set(id, { loese, lehneAb });
    ws.send(JSON.stringify({ id, method: methode, params, ...(sessionId ? { sessionId } : {}) }));
  });
}

function warteAuf(methode, sessionId, timeoutMs = 20_000) {
  return new Promise((loese, lehneAb) => {
    const timer = setTimeout(() => lehneAb(new Error(`Warten auf ${methode} abgelaufen`)), timeoutMs);
    const l = (n) => {
      if (n.method === methode && n.sessionId === sessionId) {
        clearTimeout(timer);
        lauscher.splice(lauscher.indexOf(l), 1);
        loese(n.params);
      }
    };
    lauscher.push(l);
  });
}

const schlaf = (ms) => new Promise((l) => setTimeout(l, ms));

// ---------------------------------------------------------------------------
// Datenpunkte setzen (vor dem Laden — die Seite zeigt dann den Zustand)
// ---------------------------------------------------------------------------
for (const paar of setze) {
  const i = paar.indexOf("=");
  if (i < 0) { console.error(`--setze erwartet schluessel=wert, bekommen: ${paar}`); process.exit(2); }
  const schluessel = paar.slice(0, i);
  const roh = paar.slice(i + 1);
  let wert;
  try { wert = JSON.parse(roh); } catch { wert = roh; }
  const antwort = await fetch(`${basis}/api/datenpunkte/${encodeURIComponent(schluessel)}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ wert }),
  });
  if (!antwort.ok) {
    console.error(`FEHLER: ${schluessel} = ${roh} -> HTTP ${antwort.status}: ${(await antwort.text()).slice(0, 200)}`);
    process.exit(1);
  }
  console.error(`gesetzt: ${schluessel} = ${JSON.stringify(wert)}`);
}

// ---------------------------------------------------------------------------
// Seite laden
// ---------------------------------------------------------------------------
const { targetId } = await befehl("Target.createTarget", { url: "about:blank" });
const { sessionId } = await befehl("Target.attachToTarget", { targetId, flatten: true });
await befehl("Page.enable", {}, sessionId);
await befehl("Runtime.enable", {}, sessionId);
await befehl("Emulation.setDeviceMetricsOverride", { width: breite, height: hoehe, deviceScaleFactor: 1, mobile: false }, sessionId);
if (sitzungsCookie) {
  await befehl("Network.enable", {}, sessionId);
  await befehl("Network.setCookie", {
    ...sitzungsCookie, url: basis, path: "/", httpOnly: true, sameSite: "Lax",
  }, sessionId);
}

const geladen = warteAuf("Page.loadEventFired", sessionId);
await befehl("Page.navigate", { url: seitenUrl.toString() }, sessionId);
await geladen;

/** Ausdruck im Seitenkontext auswerten; wirft bei JS-Fehlern. */
async function imBrowser(ausdruck) {
  const r = await befehl("Runtime.evaluate", { expression: ausdruck, returnByValue: true, awaitPromise: true }, sessionId);
  if (r.exceptionDetails) throw new Error(`Seite: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
  return r.result.value;
}

// Auf die Wurzel warten: die Visu rendert erst nach dem Laden des Gewerks.
const frist = Date.now() + 20_000;
while (!(await imBrowser(`!!document.querySelector(${JSON.stringify(selektor)})`))) {
  if (Date.now() > frist) {
    const titel = await imBrowser("document.title + ' | ' + document.body.innerText.slice(0, 200).replace(/\\s+/g, ' ')");
    console.error(`FEHLER: „${selektor}" erscheint nicht. Seite zeigt: ${titel}`);
    process.exit(1);
  }
  await schlaf(200);
}
await schlaf(warteMs);
await imBrowser("document.fonts ? document.fonts.ready.then(() => true) : true");

// ---------------------------------------------------------------------------
// Berechnete Stile als Inline-Stile eintragen und Dokument sichern
// ---------------------------------------------------------------------------
// Genau die Angaben, die visu-vergleich.mjs liest — plus Position, damit ein
// Element als solches erkannt wird (left/top/width/height in px).
const EIGENSCHAFTEN = [
  "position", "left", "top", "width", "height",
  "color", "font-family", "font-size", "font-weight", "font-style",
  "text-align", "line-height", "border-radius", "border-width", "border-style",
  "border-color", "box-shadow", "opacity",
];
const html = await imBrowser(`(() => {
  const wurzel = document.querySelector(${JSON.stringify(selektor)});
  const alle = [wurzel, ...wurzel.querySelectorAll("*")];
  for (const el of alle) {
    const cs = getComputedStyle(el);
    for (const p of ${JSON.stringify(EIGENSCHAFTEN)}) el.style.setProperty(p, cs.getPropertyValue(p));
    // Hintergrund als EINE Angabe: Verlauf wenn vorhanden, sonst Farbe — so
    // liest es der Vergleich, und so steht es im Abzug der Altanlage.
    const bild = cs.getPropertyValue("background-image");
    el.style.setProperty("background", bild && bild !== "none" ? bild : cs.getPropertyValue("background-color"));
  }
  return "<!DOCTYPE html>\\n" + document.documentElement.outerHTML;
})()`);

mkdirSync(dirname(ziel), { recursive: true });
writeFileSync(ziel, html);
const anzahl = (html.match(/style="[^"]*position:\s*absolute/g) ?? []).length;
console.error(`Abzug gesichert: ${ziel} (${Math.round(html.length / 1024)} kB, ${anzahl} absolut positionierte Elemente)`);

await befehl("Browser.close").catch(() => {});
ws.close();
process.exit(0);

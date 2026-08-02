#!/usr/bin/env node
/**
 * Zwei Visu-Seiten Element fuer Element vergleichen: Altanlage gegen Fachwerk.
 *
 * Warum es das gibt: eine Seite hat schnell hundert Elemente. Wer zwei
 * Bildschirme nebeneinanderlegt, findet drei Abweichungen und uebersieht
 * dreissig — und die naechste Runde beginnt wieder bei drei. Dieses Werkzeug
 * listet ALLE und ordnet sie nach Haeufigkeit, damit man die Ursache trifft
 * statt des Symptoms.
 *
 * Verglichen werden ausschliesslich die gerenderten Formangaben aus dem
 * jeweiligen DOM — keine Programmlogik, kein Quelltext. Die Altanlagen-Seite
 * speichert man im Browser mit „Seite speichern" oder aus den Entwicklerwerkzeugen.
 *
 *   node tools/visu-vergleich.mjs <alt.html> <neu.html> [--alle]
 *
 * Ohne --alle werden je Abweichungsart nur die ersten Beispiele gezeigt.
 */
import { readFileSync } from "node:fs";

const [, , altPfad, neuPfad, ...rest] = process.argv;
if (!altPfad || !neuPfad) {
  console.error("Aufruf: node tools/visu-vergleich.mjs <alt.html> <neu.html> [--alle]");
  process.exit(2);
}
const ALLE = rest.includes("--alle");
/**
 * Schriftnamen einander zuordnen. Der Import benennt mitgelieferte Schriften
 * sprechend um (font1 -> „KNX UF"), damit das Gewerk lesbar bleibt. Fuer den
 * Vergleich muss man die Paare kennen, sonst meldet das Werkzeug eine
 * Abweichung, wo nur der Name ein anderer ist.
 *
 *   --schriften "font1=knx uf,font2=flaticon"
 */
const SCHRIFT_ABBILD = new Map(
  (rest.find((r) => r.startsWith("--schriften="))?.slice(12) ?? "")
    .split(",").filter(Boolean)
    .map((paar) => paar.split("=").map((t) => t.trim().toLowerCase())),
);

/** Zahlen aus einer CSS-Laengenangabe; calc(12px + 3px) ergibt 15. */
function laenge(wert) {
  if (!wert) return undefined;
  const zahlen = [...wert.matchAll(/(-?\d+(?:\.\d+)?)\s*px/g)].map((m) => Number(m[1]));
  if (zahlen.length === 0) return undefined;
  return zahlen.reduce((a, b) => a + b, 0);
}

/**
 * Farbangaben vereinheitlichen, damit #FFF und rgb(255,255,255) gleich sind.
 * Aus einer background-Kurzform wird nur der Farb- bzw. Verlaufsanteil gelesen:
 * die Altanlage schreibt dort zusaetzlich Position und Wiederholung, der
 * Browser laesst sie in der berechneten Form weg. Ohne das meldet der
 * Vergleich Dutzende Unterschiede, die keine sind.
 */
function farbe(wert) {
  if (!wert) return undefined;
  let roh = wert.trim();
  const verlauf = /(-webkit-)?(linear|radial)-gradient\([^)]*(\([^)]*\))?[^)]*\)/i.exec(roh);
  if (verlauf) return verlaufNormal(verlauf[0]);
  const rgbTeil = /rgba?\([^)]*\)|#[0-9a-f]{3,8}/i.exec(roh);
  if (rgbTeil) roh = rgbTeil[0];
  const t = roh.toLowerCase().replace(/\s+/g, "");
  if (t === "transparent" || t === "rgba(0,0,0,0)") return undefined;
  const kurz = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(t);
  if (kurz) return `rgb(${kurz.slice(1).map((h) => parseInt(h + h, 16)).join(",")})`;
  const lang = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(t);
  if (lang) return `rgb(${lang.slice(1).map((h) => parseInt(h, 16)).join(",")})`;
  const rgb = /^rgba?\((-?\d+),(-?\d+),(-?\d+)(?:,[\d.]+)?\)$/.exec(t);
  if (rgb) return `rgb(${rgb[1]},${rgb[2]},${rgb[3]})`;
  return t;
}

/**
 * Schriftfamilie auf den ersten TATSAECHLICH verfuegbaren Namen kuerzen.
 *
 * Eine Kette wie „EDOMIfont, Lucida Grande, Arial" nennt zuerst die
 * Hausschrift des Altsystems. Die liegt dem Export nicht bei, also faellt
 * jeder Browser auf das naechste Glied zurueck — und Fachwerk zeigt dasselbe.
 * Wer nur den ersten Namen vergleicht, meldet 28 Abweichungen, wo keine sind.
 */
const NICHT_VERFUEGBAR = new Set(["edomifont"]);

function schrift(wert) {
  if (!wert) return undefined;
  const kette = wert.split(",")
    .map((n) => n.trim().replace(/^["']|["']$/g, "").toLowerCase())
    // Fachwerk stellt importierten Schriften einen Namensraum voran.
    .map((n) => n.replace(/^fachwerk visu /, ""))
    .filter((n) => n !== "" && !NICHT_VERFUEGBAR.has(n));
  const erst = kette[0];
  return erst === undefined ? undefined : (SCHRIFT_ABBILD.get(erst) ?? erst);
}

/**
 * Verlaeufe vergleichbar machen: die alte praefigierte Form misst den Winkel
 * anders, und der Browser laesst den Standardwinkel ganz weg. Verglichen wird
 * deshalb nur die Folge der Farbstopps.
 */
function verlaufNormal(wert) {
  const stopps = [...wert.matchAll(/rgba?\([^)]*\)|#[0-9a-f]{3,8}/gi)].map((m) => farbe(m[0]));
  return `verlauf(${stopps.join("|")})`;
}

/** Werte, die „nichts gesetzt" bedeuten — in beiden Systemen. */
function bedeutungslos(wert) {
  return wert === undefined || wert === null || wert === "" || wert === 0 ||
    wert === false || wert === "none" || wert === "normal" ||
    // Linksbuendig ist in beiden Systemen der Standard — einmal ausgeschrieben,
    // einmal weggelassen. Das ist kein Unterschied.
    wert === "start" || wert === "left";
}

/** HTML-Entities im style-Attribut aufloesen — sonst steht dort &quot; statt ". */
function entities(text) {
  return text
    .replace(/&quot;?/g, '"')
    .replace(/&#0?39;?/g, "'")
    .replace(/&amp;?/g, "&");
}

function stilKarte(stil) {
  const karte = new Map();
  for (const teil of entities(stil).split(";")) {
    const i = teil.indexOf(":");
    if (i < 0) continue;
    karte.set(teil.slice(0, i).trim().toLowerCase(), teil.slice(i + 1).trim());
  }
  return karte;
}

/** Sichtbaren Text eines Element-Schnipsels ermitteln (Markup entfernen). */
function textVon(fragment) {
  return fragment
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-f]+);?/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Elemente aus einem DOM-Abzug lesen. Erkannt wird jedes Tag mit einem
 * style-Attribut, das absolute Position UND Groesse traegt — genau das
 * kennzeichnet ein Visu-Element in beiden Systemen.
 */
function elemente(html) {
  const gefunden = [];
  const tagRegex = /<(div|button|span|img|canvas)\b([^>]*?)style="([^"]*)"([^>]*)>/gi;
  for (const treffer of html.matchAll(tagRegex)) {
    const stil = stilKarte(treffer[3]);
    const x = laenge(stil.get("left"));
    const y = laenge(stil.get("top"));
    const b = laenge(stil.get("width"));
    const h = laenge(stil.get("height"));
    if (x === undefined || y === undefined || b === undefined || h === undefined) continue;
    // Text bis zum naechsten oeffnenden Tag gleicher Art (grob, aber es geht
    // nur um „steht dort dasselbe", nicht um exakte Baumstruktur).
    const ab = treffer.index + treffer[0].length;
    gefunden.push({
      x, y, b, h,
      text: textVon(html.slice(ab, ab + 400).split(/<\/(?:div|button)>/)[0] ?? ""),
      hintergrund: farbe(stil.get("background") ?? stil.get("background-color")),
      farbe: farbe(stil.get("color")),
      schriftart: schrift(stil.get("font-family")),
      schriftgroesse: laenge(stil.get("font-size")),
      fett: /bold|[6-9]00/.test(stil.get("font-weight") ?? ""),
      kursiv: /italic/.test(stil.get("font-style") ?? ""),
      ausrichtung: (stil.get("text-align") ?? "").trim() || undefined,
      radius: laenge(stil.get("border-radius")),
      rahmen: laenge(stil.get("border-width")),
      schatten: /^(|none)$/i.test((stil.get("box-shadow") ?? "").trim()) ? undefined : "ja",
    });
  }
  return gefunden;
}

const alt = elemente(readFileSync(altPfad, "utf8"));
const neu = elemente(readFileSync(neuPfad, "utf8"));

// Zuordnung ueber die Position: das ist der einzige Schluessel, den beide
// Systeme teilen. Ein Element gilt als dasselbe, wenn seine Ecke nahe liegt.
const offen = [...neu];
const paare = [];
const fehlend = [];
for (const a of alt) {
  let bester = -1;
  let beste = Infinity;
  offen.forEach((n, i) => {
    const abstand = Math.abs(n.x - a.x) + Math.abs(n.y - a.y);
    if (abstand < beste) { beste = abstand; bester = i; }
  });
  if (bester >= 0 && beste <= 6) paare.push([a, offen.splice(bester, 1)[0]]);
  else fehlend.push(a);
}

const FELDER = [
  ["b", "Breite"], ["h", "Hoehe"],
  ["hintergrund", "Hintergrund"], ["farbe", "Schriftfarbe"],
  ["schriftart", "Schriftart"], ["schriftgroesse", "Schriftgroesse"],
  ["fett", "fett"], ["kursiv", "kursiv"], ["ausrichtung", "Ausrichtung"],
  ["radius", "Eckenradius"], ["rahmen", "Rahmenbreite"], ["schatten", "Schatten"],
  ["text", "Text"],
];

const abweichungen = new Map();
for (const [a, n] of paare) {
  for (const [feld, name] of FELDER) {
    const va = a[feld];
    const vn = n[feld];
    // Beide Seiten „nichts" — kein Unterschied. Das faengt den Vergleich von
    // berechnetem Standard (0px, none) gegen fehlende Inline-Angabe ab.
    if (bedeutungslos(va) && bedeutungslos(vn)) continue;
    if (typeof va === "number" && typeof vn === "number" && Math.abs(va - vn) <= 1) continue;
    if (String(va ?? "") === String(vn ?? "")) continue;
    const liste = abweichungen.get(name) ?? [];
    liste.push({ x: a.x, y: a.y, alt: va, neu: vn, text: a.text.slice(0, 24) });
    abweichungen.set(name, liste);
  }
}

const sortiert = [...abweichungen.entries()].sort((p, q) => q[1].length - p[1].length);

console.log(`Elemente: Altanlage ${alt.length}, Fachwerk ${neu.length}, zugeordnet ${paare.length}`);
if (fehlend.length > 0) {
  console.log(`\nFEHLEN in Fachwerk: ${fehlend.length}`);
  for (const f of fehlend.slice(0, ALLE ? fehlend.length : 8)) {
    console.log(`  bei ${f.x}/${f.y} (${f.b}x${f.h}) "${f.text.slice(0, 30)}"`);
  }
}
if (offen.length > 0) {
  console.log(`\nZUSAETZLICH in Fachwerk: ${offen.length}`);
  for (const z of offen.slice(0, ALLE ? offen.length : 8)) {
    console.log(`  bei ${z.x}/${z.y} (${z.b}x${z.h}) "${z.text.slice(0, 30)}"`);
  }
}
console.log(`\nAbweichungen nach Haeufigkeit (${[...abweichungen.values()].reduce((a, l) => a + l.length, 0)} gesamt):`);
for (const [name, liste] of sortiert) {
  console.log(`\n  ${name}: ${liste.length}x`);
  for (const e of liste.slice(0, ALLE ? liste.length : 4)) {
    console.log(`    ${String(e.x).padStart(5)}/${String(e.y).padStart(5)}  alt: ${String(e.alt).slice(0, 30).padEnd(30)} neu: ${String(e.neu).slice(0, 30)}`);
  }
  if (!ALLE && liste.length > 4) console.log(`    … ${liste.length - 4} weitere (--alle zeigt sie)`);
}
process.exit(sortiert.length > 0 || fehlend.length > 0 ? 1 : 0);

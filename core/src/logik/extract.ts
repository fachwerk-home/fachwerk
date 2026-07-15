/**
 * Extraktion aus strukturiertem Text (für den EXTRACT-Baustein).
 * Ein Interface (Dokument + Pfad → Wert), zwei Formate mit je eigener,
 * passender Pfadsprache — bewusst KEINE erfundene Einheits-Syntax.
 *
 * - JSON: nativ (JSON.parse), Pfad in Punkt/Klammer-Notation: a.b[0].c
 * - XML:  kleine Teilmenge ohne Abhängigkeiten: a/b/c (Elementtext),
 *         a/b/@attr (Attribut). Erster Treffer, lokale Namen (keine
 *         Namespaces), kein Mixed-Content-Sonderfall. Für API-Antworten.
 */
export type ExtractFormat = "json" | "xml";

export interface ExtractErgebnis {
  ok: boolean;
  wert?: string | number | boolean;
  fehler?: string;
}

// ---- JSON --------------------------------------------------------------------

/** Pfad „a.b[0].c" oder „$.a.b.0" in Segmente zerlegen. */
function jsonSegmente(pfad: string): string[] {
  const p = pfad.replace(/^\$\.?/, "");
  const segmente: string[] = [];
  for (const teil of p.split(".")) {
    if (teil === "") continue;
    // „b[0][1]" → „b", „0", „1"
    const m = teil.matchAll(/([^[\]]+)|\[(\d+)\]/g);
    for (const treffer of m) segmente.push(treffer[1] ?? treffer[2] ?? "");
  }
  return segmente;
}

function jsonExtract(doc: string, pfad: string): ExtractErgebnis {
  let wurzel: unknown;
  try {
    wurzel = JSON.parse(doc);
  } catch (e) {
    return { ok: false, fehler: `kein gültiges JSON: ${e instanceof Error ? e.message : e}` };
  }
  let aktuell: unknown = wurzel;
  for (const seg of jsonSegmente(pfad)) {
    if (aktuell === null || typeof aktuell !== "object") {
      return { ok: false, fehler: `Pfad „${pfad}" endet vor „${seg}"` };
    }
    aktuell = (aktuell as Record<string, unknown>)[seg];
    if (aktuell === undefined) return { ok: false, fehler: `„${seg}" nicht gefunden` };
  }
  if (aktuell === null) return { ok: true, wert: "" };
  if (typeof aktuell === "object") return { ok: true, wert: JSON.stringify(aktuell) };
  return { ok: true, wert: aktuell as string | number | boolean };
}

// ---- XML (Teilmenge) ---------------------------------------------------------

/**
 * Erstes DIREKTES Kind-Element `tag` in `xml` finden (Tiefe-0-Scan über alle
 * Tags, balanciert). So meint „a/b" das direkte Kind, nicht irgendeinen
 * Nachfahren in einem gleichnamigen Wrapper.
 */
function ersterKnoten(
  xml: string,
  tag: string,
): { inner: string; openTag: string } | null {
  const tags = /<(\/?)([A-Za-z_][\w.-]*)(\s[^>]*?)?(\/?)>/g;
  let tiefe = 0;
  let startInner = -1;
  let openTag = "";
  for (let m = tags.exec(xml); m; m = tags.exec(xml)) {
    const [ganz, schluss, name, , selbst] = m;
    const istSelbst = selbst === "/";
    if (startInner === -1) {
      // Suchen: erstes <tag> (kein Schluss) auf Tiefe 0.
      if (!schluss && name === tag && tiefe === 0) {
        if (istSelbst) return { inner: "", openTag: ganz! };
        startInner = tags.lastIndex;
        openTag = ganz!;
        tiefe = 1;
      } else if (!istSelbst) {
        tiefe += schluss ? -1 : 1;
      }
    } else {
      // Innerhalb: passenden Schluss auf Tiefe 0 finden.
      if (!istSelbst) tiefe += schluss ? -1 : 1;
      if (tiefe === 0) return { inner: xml.slice(startInner, m.index), openTag };
    }
  }
  return null;
}

function attribut(openTag: string, name: string): string | undefined {
  const m = new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`).exec(openTag);
  return m ? m[1] : undefined;
}

function xmlExtract(doc: string, pfad: string): ExtractErgebnis {
  const segmente = pfad.split("/").filter((s) => s !== "");
  if (segmente.length === 0) return { ok: false, fehler: "leerer XML-Pfad" };

  const letztes = segmente[segmente.length - 1]!;
  const attrName = letztes.startsWith("@") ? letztes.slice(1) : null;
  const elementPfad = attrName ? segmente.slice(0, -1) : segmente;

  let aktuell = doc;
  let letzterOpenTag = "";
  for (const tag of elementPfad) {
    const knoten = ersterKnoten(aktuell, tag);
    if (!knoten) return { ok: false, fehler: `Element „${tag}" nicht gefunden` };
    aktuell = knoten.inner;
    letzterOpenTag = knoten.openTag;
  }
  if (attrName) {
    const wert = attribut(letzterOpenTag, attrName);
    return wert === undefined
      ? { ok: false, fehler: `Attribut „${attrName}" nicht gefunden` }
      : { ok: true, wert };
  }
  // Textinhalt (Tags im Inneren grob entfernen, Entities minimal auflösen).
  const text = aktuell
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
  return { ok: true, wert: text };
}

export function extrahiere(format: ExtractFormat, doc: string, pfad: string): ExtractErgebnis {
  return format === "xml" ? xmlExtract(doc, pfad) : jsonExtract(doc, pfad);
}

/**
 * Konvertierung Altsystem → Fachwerk-Gewerk (Import-Assistent, Stufe 1):
 * KOs werden zu Datenpunkten (Gruppen aus dem Ordnerbaum), die Logik wird
 * inventarisiert (Baustein-Bedarfsliste = Portierungs-Prioritäten). Die
 * eigentliche Logik-Graph-Konvertierung folgt in Stufe 2, Visu in Stufe 3.
 *
 * Clean-Room: Diese Konvertierung liest ausschließlich NUTZDATEN des
 * Anlagenbetreibers (KO-Listen, Verdrahtung, Namen) — niemals Programmcode.
 */
import type { Datenpunkt, DatenpunktDatei } from "@fachwerk/schema";
import type { Tabelle, Zeile } from "./sql-dump.ts";

export interface ImportErgebnis {
  /** Gruppe → Datenpunkt-Datei (kanonisch serialisierbar). */
  datenpunkte: Map<string, DatenpunktDatei>;
  /** KO-Id → voller Fachwerk-Schlüssel (für Stufe 2: Logik-Verdrahtung). */
  koZuSchluessel: Map<number, string>;
  bericht: ImportBericht;
}

export interface ImportBericht {
  kos: { gesamt: number; bus: number; intern: number; uebersprungen: number };
  /** DPT-Haupttyp → Anzahl; Basis für Treiber-Ausbau. */
  werttypen: Map<number, number>;
  /** Baustein-Bedarf: LBS-Name → Verwendungen (Portierungs-Prioritäten). */
  bausteinBedarf: Array<{ id: number; name: string; verwendungen: number }>;
  logik: { seiten: number; instanzen: number; verknuepfungen: number };
  hinweise: string[];
}

/** Namen zu stabilen, sprechenden Schlüsseln machen (ADR-0004). */
export function slug(name: string): string {
  const s = name
    .toLowerCase()
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("ß", "ss")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_");
  return /^[a-z]/.test(s) ? s : `k_${s || "unbenannt"}`;
}

/** Altsystem-Werttyp (≈ DPT-Hauptnummer) → Fachwerk-Typ + ggf. DPT. */
function mappeTyp(valuetyp: number): Pick<Datenpunkt, "typ" | "dpt"> {
  switch (valuetyp) {
    case 1:
    case 2:
      return { typ: "bool", dpt: "1.001" };
    case 5:
      return { typ: "zahl", dpt: "5.001" };
    case 9:
      return { typ: "zahl", dpt: "9.001" };
    case 3: // Dimmen relativ
    case 6:
    case 7:
    case 8:
    case 12:
    case 13:
    case 14: // Gleitkomma 4 Byte
      return { typ: "zahl" };
    case 16: // Text
    case 24:
      return { typ: "text" };
    case 232: // RGB
      return { typ: "text" };
    default:
      return { typ: "text" };
  }
}

function zahl(z: Zeile, spalte: string): number {
  const v = z[spalte];
  return typeof v === "number" ? v : Number(v ?? 0);
}

function text(z: Zeile, spalte: string): string {
  const v = z[spalte];
  return v === null || v === undefined ? "" : String(v);
}

export function konvertiere(tabellen: Map<string, Tabelle>): ImportErgebnis {
  const hinweise: string[] = [];

  // Ordnerbaum → Gruppennamen
  const ordner = new Map<number, string>();
  for (const z of tabellen.get("editRoot")?.zeilen ?? []) {
    ordner.set(zahl(z, "id"), text(z, "name"));
  }

  // ---- KOs → Datenpunkte -----------------------------------------------------
  const datenpunkte = new Map<string, DatenpunktDatei>();
  const koZuSchluessel = new Map<number, string>();
  const werttypen = new Map<number, number>();
  const vergeben = new Set<string>();
  let bus = 0;
  let intern = 0;
  let uebersprungen = 0;

  // Altsystem-System-KOs mit fester Id → Fachwerk-Uhr-Datenpunkte (klasse
  // system; der Uhr-Dienst speist sie). Ids sind im Referenzsystem fix.
  const SYSTEM_KOS = new Map<number, { gruppe: string; key: string; typ: "text" | "bool" }>([
    [2, { gruppe: "system", key: "start", typ: "bool" }], // Systemstart-Impuls
    [4, { gruppe: "system", key: "datum", typ: "text" }],
    [5, { gruppe: "system", key: "zeit", typ: "text" }],
  ]);

  const kos = tabellen.get("editKo")?.zeilen ?? [];
  for (const ko of kos) {
    const id = zahl(ko, "id");
    const name = text(ko, "name") || `KO ${id}`;
    const gatyp = zahl(ko, "gatyp");

    const system = SYSTEM_KOS.get(id);
    if (system && gatyp === 2) {
      const datei = datenpunkte.get(system.gruppe) ?? {};
      datei[system.key] = { name, klasse: "system", typ: system.typ };
      datenpunkte.set(system.gruppe, datei);
      koZuSchluessel.set(id, `${system.gruppe}.${system.key}`);
      vergeben.add(`${system.gruppe}.${system.key}`);
      intern++;
      continue;
    }
    const valuetyp = zahl(ko, "valuetyp");
    werttypen.set(valuetyp, (werttypen.get(valuetyp) ?? 0) + 1);

    const gruppe = slug(ordner.get(zahl(ko, "folderid")) ?? "allgemein");
    let key = slug(name);
    while (vergeben.has(`${gruppe}.${key}`)) key = `${key}_${id}`;
    vergeben.add(`${gruppe}.${key}`);

    const { typ, dpt } = mappeTyp(valuetyp);
    const dp: Datenpunkt = { name, klasse: gatyp === 1 ? "bus" : "intern", typ };

    if (gatyp === 1) {
      const ga = text(ko, "ga");
      if (!/^\d+\/\d+\/\d+$/.test(ga)) {
        uebersprungen++;
        hinweise.push(`KO ${id} „${name}": unerwartetes GA-Format „${ga}" — übersprungen`);
        continue;
      }
      dp.treiber = "knx";
      dp.adresse = ga;
      if (dpt) dp.dpt = dpt;
      bus++;
    } else {
      intern++;
    }

    if (zahl(ko, "remanent") === 1) dp.remanent = true;

    const defaultwert = text(ko, "defaultvalue");
    if (defaultwert !== "") {
      dp.initial =
        typ === "bool" ? defaultwert === "1" : typ === "zahl" ? Number(defaultwert) : defaultwert;
      if (typ === "zahl" && !Number.isFinite(dp.initial as number)) delete dp.initial;
    }

    const datei = datenpunkte.get(gruppe) ?? {};
    datei[key] = dp;
    datenpunkte.set(gruppe, datei);
    koZuSchluessel.set(id, `${gruppe}.${key}`);
  }

  // ---- Logik inventarisieren (Stufe 1: Bedarf statt Konvertierung) ------------
  const defNamen = new Map<number, string>();
  for (const z of tabellen.get("editLogicElementDef")?.zeilen ?? []) {
    defNamen.set(zahl(z, "id"), text(z, "name") || text(z, "title") || `LBS ${zahl(z, "id")}`);
  }
  const verwendungen = new Map<number, number>();
  const instanzen = tabellen.get("editLogicElement")?.zeilen ?? [];
  for (const z of instanzen) {
    const fid = zahl(z, "functionid");
    verwendungen.set(fid, (verwendungen.get(fid) ?? 0) + 1);
  }
  const bausteinBedarf = [...verwendungen.entries()]
    .map(([id, n]) => ({ id, name: defNamen.get(id) ?? `LBS ${id}`, verwendungen: n }))
    .sort((a, b) => b.verwendungen - a.verwendungen);

  return {
    datenpunkte,
    koZuSchluessel,
    bericht: {
      kos: { gesamt: kos.length, bus, intern, uebersprungen },
      werttypen,
      bausteinBedarf,
      logik: {
        seiten: tabellen.get("editLogicPage")?.zeilen.length ?? 0,
        instanzen: instanzen.length,
        verknuepfungen: tabellen.get("editLogicLink")?.zeilen.length ?? 0,
      },
      hinweise,
    },
  };
}

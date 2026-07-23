/**
 * Fähigkeiten-Katalog: maschinenlesbare Beschreibung dessen, was Fachwerk kann
 * — Standardbausteine, Visu-Elemente, Datenpunkt-Typen.
 *
 * Wozu: Beim Umstieg von einer Altanlage bleiben fremde Bausteine/Elemente
 * übrig. Fachwerk selbst kann nicht beurteilen, ob es die Funktion schon an
 * Bord hat — es kennt die fremden Dinger nicht. Ein LLM kann das, wenn es
 * BEIDE Seiten sieht: den fremden Baustein (liegt beim Betreiber) und diesen
 * Katalog. Ablauf: docs/MIGRATION-TRIAGE.md.
 *
 * Zweitnutzen: Agenten (ADR-0009 Agent-first) und die Editor-Palette bekommen
 * dieselbe Quelle — statt drei Beschreibungen, die auseinanderlaufen.
 *
 * Pflege: Der Katalog ist bewusst Daten, kein Code. Neue Stdlib-Bausteine
 * brauchen einen Eintrag, sonst schlägt der Vollständigkeitstest fehl.
 * `stichworte` sind Suchhilfen für die Triage (Synonyme, auch umgangssprachlich)
 * — großzügig füllen, sie kosten nichts und verbessern die Treffer.
 */
import { stdlibTypen } from "./bausteine.ts";

export interface KatalogParameter {
  name: string;
  bedeutung: string;
  standard?: string;
}

export interface KatalogBaustein {
  typ: string;
  zweck: string;
  eingaenge: string[];
  ausgaenge: string[];
  parameter?: KatalogParameter[];
  /** Ports hängen von der Konfiguration ab (ADR-0012) — Regel im Klartext. */
  konfigVariabel?: string;
  /** Zeitentkoppelt (ADR-0005 E-6): Ausgang kommt nur über Timer. */
  entkoppelt?: boolean;
  stichworte: string[];
}

export interface KatalogVisuElement {
  name: string;
  art: "preset" | "widget";
  zweck: string;
  /** Bindungs-Rollen, die das Element auswertet. */
  rollen: string[];
  aktionen?: string[];
  stichworte: string[];
}

export interface Katalog {
  katalogVersion: number;
  gewerkFormat: number;
  bausteine: KatalogBaustein[];
  visu: { elemente: KatalogVisuElement[]; formatFelder: string[] };
  datenpunkte: { typen: string[]; klassen: string[] };
  hinweise: string[];
}

// ---- Standardbausteine -----------------------------------------------------

const BAUSTEINE: KatalogBaustein[] = [
  {
    typ: "KOPIE",
    zweck: "Reicht den Eingang unverändert durch (Datenpunkt-zu-Datenpunkt-Route).",
    eingaenge: ["in"],
    ausgaenge: ["out"],
    stichworte: ["kopie", "durchreichen", "weiterleiten", "route", "verbinden"],
  },
  {
    typ: "NOT",
    zweck: "Invertiert einen Wahrheitswert.",
    eingaenge: ["in"],
    ausgaenge: ["out"],
    stichworte: ["nicht", "invertieren", "negation", "umkehren", "inverter"],
  },
  {
    typ: "AND",
    zweck: "UND über zwei Wahrheitswerte.",
    eingaenge: ["a", "b"],
    ausgaenge: ["out"],
    stichworte: ["und", "and", "konjunktion", "beide"],
  },
  {
    typ: "OR",
    zweck: "ODER über zwei Wahrheitswerte.",
    eingaenge: ["a", "b"],
    ausgaenge: ["out"],
    stichworte: ["oder", "or", "disjunktion"],
  },
  {
    typ: "OR8",
    zweck: "ODER über bis zu acht Eingänge; unbelegte zählen nicht mit.",
    eingaenge: ["e1", "e2", "e3", "e4", "e5", "e6", "e7", "e8"],
    ausgaenge: ["out"],
    stichworte: ["oder", "sammelmeldung", "8-fach", "mehrfach", "irgendeiner"],
  },
  {
    typ: "XOR",
    zweck: "Exklusiv-ODER: wahr, wenn die Eingänge sich unterscheiden.",
    eingaenge: ["a", "b"],
    ausgaenge: ["out"],
    stichworte: ["exklusiv", "xor", "ungleich", "wechselschaltung"],
  },
  {
    typ: "TOGGLE",
    zweck:
      "Steigende Flanke am Eingang wechselt den Ausgang. Der optionale " +
      "status-Eingang gleicht den internen Zustand ab, ohne selbst zu schalten.",
    eingaenge: ["in", "status"],
    ausgaenge: ["out"],
    stichworte: ["umschalten", "toggle", "wechseln", "taster", "stromstoss"],
  },
  {
    typ: "VERGLEICH",
    zweck: "Vergleicht zwei Zahlen mit einem wählbaren Operator.",
    eingaenge: ["a", "b"],
    ausgaenge: ["out"],
    parameter: [
      { name: "op", bedeutung: "Operator: > >= < <= == !=", standard: ">=" },
      { name: "wert", bedeutung: "Vergleichswert, wenn Eingang b unbelegt bleibt" },
    ],
    stichworte: ["vergleich", "schwellwert", "groesser", "kleiner", "gleich", "grenzwert"],
  },
  {
    typ: "HYSTERESE",
    zweck:
      "Schaltet ein ab dem oberen und aus ab dem unteren Schwellwert; " +
      "dazwischen wird gehalten (kein Flattern an der Schwelle).",
    eingaenge: ["in"],
    ausgaenge: ["out"],
    parameter: [
      { name: "ein", bedeutung: "Einschaltschwelle" },
      { name: "aus", bedeutung: "Ausschaltschwelle" },
    ],
    stichworte: ["hysterese", "schwellwert", "zweipunkt", "flattern", "schmitt-trigger"],
  },
  {
    typ: "SPERRE",
    zweck:
      "Torschaltung: hält den Eingang zurück, solange gesperrt ist; beim " +
      "Entsperren wird der zuletzt gehaltene Wert nachgereicht.",
    eingaenge: ["in", "sperre"],
    ausgaenge: ["out"],
    parameter: [
      { name: "modus", bedeutung: "\"freigabe\" invertiert den Steuereingang" },
      { name: "nachreichen", bedeutung: "Gehaltenen Wert beim Entsperren senden", standard: "true" },
    ],
    stichworte: ["sperre", "gate", "tor", "freigabe", "blockieren", "verriegeln"],
  },
  {
    typ: "VERZOEGERUNG",
    zweck: "Reicht den Eingangswert nach einer Wartezeit weiter; ein neuer Wert ersetzt den laufenden Timer.",
    eingaenge: ["in"],
    ausgaenge: ["out"],
    parameter: [{ name: "ms", bedeutung: "Verzögerung in Millisekunden", standard: "1000" }],
    entkoppelt: true,
    stichworte: ["verzoegerung", "delay", "warten", "einschaltverzoegerung", "timer"],
  },
  {
    typ: "TREPPENLICHT",
    zweck:
      "Ein-Impuls schaltet ein und plant das Ausschalten; erneutes Ein " +
      "verlängert, ein Aus-Impuls schaltet sofort ab.",
    eingaenge: ["in"],
    ausgaenge: ["out"],
    parameter: [{ name: "ms", bedeutung: "Nachlaufzeit in Millisekunden", standard: "60000" }],
    stichworte: ["treppenlicht", "nachlauf", "ausschaltverzoegerung", "zeitschalter"],
  },
  {
    typ: "SPERRLICHT",
    zweck:
      "Licht mit Sperre: Schaltwünsche während der Sperre werden gemerkt und " +
      "beim Entsperren wiederhergestellt (Verhalten je Parameter).",
    eingaenge: ["schalten", "sperre"],
    ausgaenge: ["out"],
    parameter: [
      { name: "beimSperren", bedeutung: "aus | an | halten", standard: "aus" },
      { name: "beimEntsperren", bedeutung: "wiederherstellen | aus | halten", standard: "wiederherstellen" },
    ],
    stichworte: ["sperrlicht", "zwangsfuehrung", "licht", "sperre", "putzlicht"],
  },
  {
    typ: "WERTAUSLOESER",
    zweck: "Gibt bei einer Flanke am Trigger einen festen Wert aus.",
    eingaenge: ["trigger", "wert"],
    ausgaenge: ["out"],
    parameter: [{ name: "wert", bedeutung: "Auszugebender Wert, wenn der Eingang unbelegt ist" }],
    stichworte: ["wertauslöser", "trigger", "senden", "konstante", "flanke"],
  },
  {
    typ: "IMPULS",
    zweck: "Erzeugt bei einer Flanke einen zeitlich begrenzten Ein-Impuls.",
    eingaenge: ["trigger", "dauer"],
    ausgaenge: ["out"],
    parameter: [{ name: "ms", bedeutung: "Impulsdauer in Millisekunden", standard: "1000" }],
    stichworte: ["impuls", "monoflop", "puls", "wischer"],
  },
  {
    typ: "MULT",
    zweck: "Multipliziert zwei Zahlen.",
    eingaenge: ["a", "b"],
    ausgaenge: ["out"],
    stichworte: ["multiplikation", "mal", "produkt", "rechnen", "skalieren"],
  },
  {
    typ: "KLEMME",
    zweck: "Führt mehrere Quellen zusammen: der zuletzt frisch eingetroffene Eingang gewinnt.",
    eingaenge: ["in1", "in2"],
    ausgaenge: ["out"],
    stichworte: ["klemme", "sammelpunkt", "zusammenfuehren", "letzter gewinnt"],
  },
  {
    typ: "WENN_DANN_SONST",
    zweck: "Vergleicht den Eingang und gibt je nach Ergebnis den Dann- oder Sonst-Wert aus.",
    eingaenge: ["eingang", "vergleich", "op", "dann", "sonst"],
    ausgaenge: ["out"],
    parameter: [
      { name: "op", bedeutung: "EQ NE GT GE LT LE", standard: "EQ" },
      { name: "vergleich", bedeutung: "Vergleichswert" },
      { name: "dann", bedeutung: "Ausgabe bei erfüllter Bedingung" },
      { name: "sonst", bedeutung: "Ausgabe sonst" },
    ],
    stichworte: ["wenn", "bedingung", "if", "dann", "sonst", "fallunterscheidung"],
  },
  {
    typ: "EXTRACT",
    zweck: "Holt benannte Felder aus einem JSON- oder XML-Text.",
    eingaenge: ["text"],
    ausgaenge: ["status"],
    parameter: [
      { name: "format", bedeutung: "json | xml", standard: "json" },
      { name: "felder", bedeutung: "Liste aus name + pfad; jeder Name wird ein Ausgang" },
    ],
    konfigVariabel: "Je konfiguriertem Feld entsteht ein gleichnamiger Ausgang, dazu immer status.",
    stichworte: ["json", "xml", "parsen", "feld", "extrahieren", "api", "auslesen"],
  },
  {
    typ: "SPLIT",
    zweck: "Zerlegt einen Text an einem Trennzeichen in mehrere Teile.",
    eingaenge: ["text", "separator"],
    ausgaenge: ["rest"],
    parameter: [
      { name: "anzahl", bedeutung: "Anzahl der Teil-Ausgänge", standard: "2" },
      { name: "separator", bedeutung: "Trennzeichen" },
      { name: "rest", bedeutung: "false unterdrückt den Rest-Ausgang", standard: "true" },
    ],
    konfigVariabel: "Ausgänge teil1..teilN gemäß Parameter anzahl, dazu optional rest.",
    stichworte: ["split", "zerlegen", "trennen", "text", "liste", "csv"],
  },
  {
    typ: "JOIN",
    zweck: "Verbindet mehrere Eingänge mit einem Trennzeichen zu einem Text.",
    eingaenge: [],
    ausgaenge: ["text"],
    parameter: [
      { name: "anzahl", bedeutung: "Anzahl der Teil-Eingänge", standard: "2" },
      { name: "separator", bedeutung: "Trennzeichen" },
      { name: "modus", bedeutung: "\"ohne_leere\" überspringt leere Eingänge" },
    ],
    konfigVariabel: "Eingänge teil1..teilN gemäß Parameter anzahl.",
    stichworte: ["join", "verbinden", "zusammenfuegen", "text", "verketten"],
  },
  {
    typ: "FORMEL",
    zweck: "Wertet eine Rechenformel über die Variablen $x und $a..$e aus.",
    eingaenge: ["x", "a", "b", "c", "d", "e", "formel"],
    ausgaenge: ["out"],
    parameter: [{ name: "formel", bedeutung: "Ausdruck, z. B. ($a-$b)*100" }],
    stichworte: ["formel", "rechnen", "arithmetik", "berechnung", "mathematik", "umrechnen"],
  },
  {
    typ: "BITS_ZU_BYTE",
    zweck: "Fasst acht Wahrheitswerte zu einer Zahl zusammen.",
    eingaenge: ["bit0", "bit1", "bit2", "bit3", "bit4", "bit5", "bit6", "bit7"],
    ausgaenge: ["out"],
    stichworte: ["bits", "byte", "bitmuster", "zusammenfassen", "maske"],
  },
  {
    typ: "VERGLEICH_LISTE",
    zweck: "Vergleicht den Eingang mit mehreren Konstanten; je Treffer ein eigener Ausgang.",
    eingaenge: ["in"],
    ausgaenge: ["ne"],
    parameter: [
      { name: "anzahl", bedeutung: "Anzahl der Vergleichswerte", standard: "2" },
      { name: "w1..wN", bedeutung: "Die Vergleichswerte" },
    ],
    konfigVariabel: "Ausgänge eq1..eqN gemäß Parameter anzahl, dazu ne (kein Treffer).",
    stichworte: ["vergleichsliste", "konstante", "mehrfachvergleich", "dekoder", "auswahl"],
  },
  {
    typ: "WENN_LISTE",
    zweck: "Wertetabelle: der erste passende Vergleich bestimmt die Ausgabe.",
    eingaenge: ["in"],
    ausgaenge: ["out"],
    parameter: [
      { name: "anzahl", bedeutung: "Anzahl der Vergleichspaare", standard: "2" },
      { name: "vergl1..verglN", bedeutung: "Vergleichswerte" },
      { name: "wert1..wertN", bedeutung: "Zugehörige Ausgabewerte" },
    ],
    konfigVariabel: "Eingänge vergl1..verglN und wert1..wertN gemäß Parameter anzahl.",
    stichworte: ["wenn-dann-liste", "mapping", "umsetzen", "wertetabelle", "lookup", "uebersetzen"],
  },
  {
    typ: "MATRIX",
    zweck: "Routet den Wert eines wählbaren Eingangs auf einen wählbaren Ausgang.",
    eingaenge: ["wahl_eingang", "wahl_ausgang"],
    ausgaenge: [],
    parameter: [{ name: "anzahl", bedeutung: "Anzahl der Ein-/Ausgänge", standard: "2" }],
    konfigVariabel: "Eingänge e1..eN und Ausgänge a1..aN gemäß Parameter anzahl.",
    stichworte: ["matrix", "router", "umschalter", "verteiler", "kreuzschiene"],
  },
  {
    typ: "ZEITVERGLEICH",
    zweck:
      "Prüft, ob eine Uhrzeit in einem Zeitfenster liegt — inklusive " +
      "Mitternachtsüberlauf (z. B. 20:00 bis 06:00).",
    eingaenge: ["zeit", "von", "bis"],
    ausgaenge: ["out"],
    parameter: [
      { name: "zeit", bedeutung: "Uhrzeit HH:MM[:SS], wenn der Eingang unbelegt ist" },
      { name: "von", bedeutung: "Fensterbeginn" },
      { name: "bis", bedeutung: "Fensterende" },
    ],
    stichworte: ["zeitfenster", "uhrzeit", "zeitbereich", "nachtabsenkung", "tag nacht", "zeitschaltuhr"],
  },
  {
    typ: "ZEITVERGLEICH_AB",
    zweck: "Vergleicht zwei Uhrzeiten; je Ergebnis ein eigener Ausgang.",
    eingaenge: ["a", "b"],
    ausgaenge: ["gt", "lt", "eq"],
    parameter: [
      { name: "a", bedeutung: "Erste Uhrzeit, wenn der Eingang unbelegt ist" },
      { name: "b", bedeutung: "Zweite Uhrzeit" },
    ],
    stichworte: ["uhrzeit", "vergleich", "frueher", "spaeter", "zeitpunkt"],
  },
  {
    typ: "ZEITFORMAT",
    zweck: "Verschiebt eine Zeit um einen Offset und formatiert sie als Text.",
    eingaenge: ["zeit", "offset", "format"],
    ausgaenge: ["out"],
    parameter: [
      { name: "offset", bedeutung: "Verschiebung in Sekunden", standard: "0" },
      { name: "format", bedeutung: "Muster mit %H %M %S %d %m %Y %X", standard: "%X" },
    ],
    stichworte: ["zeit", "formatieren", "uhrzeit", "datum", "strftime", "anzeige"],
  },
];

// ---- Visu-Elemente ---------------------------------------------------------

const VISU_ELEMENTE: KatalogVisuElement[] = [
  {
    name: "taster",
    art: "preset",
    zweck: "Schaltfläche, die bei Betätigung einen festen Wert sendet.",
    rollen: ["set"],
    aktionen: ["setze"],
    stichworte: ["taster", "button", "knopf", "senden", "schaltflaeche"],
  },
  {
    name: "schalter",
    art: "preset",
    zweck: "Bedienelement mit Zustand: zeigt den Status und schaltet um.",
    rollen: ["status", "set"],
    aktionen: ["umschalten", "setze"],
    stichworte: ["schalter", "toggle", "ein aus", "schiebeschalter", "switch", "kippschalter"],
  },
  {
    name: "statusanzeige",
    art: "preset",
    zweck: "Zeigt einen Zustand an, ohne bedienbar zu sein.",
    rollen: ["status"],
    stichworte: ["status", "anzeige", "kontrollleuchte", "melder", "zustand"],
  },
  {
    name: "wertanzeige",
    art: "preset",
    zweck: "Zeigt einen Wert formatiert an (Einheit, Nachkommastellen, Skalierung).",
    rollen: ["display", "status"],
    stichworte: ["wert", "anzeige", "temperatur", "messwert", "zahl", "einheit"],
  },
  {
    name: "label",
    art: "preset",
    zweck: "Statischer Text oder Symbol ohne Wertbezug.",
    rollen: [],
    stichworte: ["text", "beschriftung", "label", "ueberschrift", "symbol", "icon"],
  },
  {
    name: "symbol",
    art: "preset",
    zweck: "Zeigt je nach Zustand ein Symbol.",
    rollen: ["status"],
    stichworte: ["symbol", "icon", "piktogramm", "zustandssymbol"],
  },
  {
    name: "navigation",
    art: "preset",
    zweck: "Wechselt auf eine andere Seite oder öffnet ein Popup.",
    rollen: [],
    aktionen: ["seite", "popup"],
    stichworte: ["navigation", "seitenwechsel", "menue", "popup", "link"],
  },
  {
    name: "slider",
    art: "widget",
    zweck: "Schieberegler zum Einstellen eines Zahlenwerts.",
    rollen: ["display", "set"],
    stichworte: ["slider", "schieberegler", "dimmer", "regler", "prozent", "helligkeit"],
  },
  {
    name: "diagramm",
    art: "widget",
    zweck: "Zeigt den zeitlichen Verlauf aus einem Archiv.",
    rollen: [],
    stichworte: ["diagramm", "chart", "verlauf", "graph", "historie", "kurve"],
  },
];

/** Felder der Wert-Formatierung (ADR-0011) — für Anzeige-Fragen der Triage. */
const FORMAT_FELDER = [
  "einheit", "praefix", "suffix", "dezimalstellen", "skalierung", "offset",
  "tausendertrenner", "enum_map", "bool_map", "fallback", "leerwert",
  "max_laenge", "ellipsis", "muster", "modus", "template",
];

const HINWEISE = [
  "Ein Element kann mehrere Rollen gleichzeitig bedienen (z. B. status + set).",
  "Anzeige-Fragen (Einheit, Nachkommastellen, An/Aus-Text) löst das Format, nicht ein eigener Baustein.",
  "Zeitfunktionen sind pur: die Uhrzeit kommt als Datenpunkt herein, kein Baustein liest die Wanduhr.",
  "Fehlt eine Funktion ganz, ist ein eigener Baustein möglich (docs/BAUSTEIN-SDK.md) — oder ein Feature-Request.",
];

/**
 * Baut den Katalog. Reine Funktion ohne Seiteneffekte; die Reihenfolge ist
 * stabil (nach Typ sortiert), damit Ausgaben vergleichbar bleiben.
 */
export function baueKatalog(gewerkFormat: number): Katalog {
  return {
    katalogVersion: 1,
    gewerkFormat,
    bausteine: [...BAUSTEINE].sort((a, b) => a.typ.localeCompare(b.typ)),
    visu: { elemente: [...VISU_ELEMENTE], formatFelder: [...FORMAT_FELDER] },
    datenpunkte: { typen: ["bool", "zahl", "text"], klassen: ["bus", "intern", "system"] },
    hinweise: [...HINWEISE],
  };
}

/** Typen, die im Katalog beschrieben sind (für den Vollständigkeitstest). */
export function katalogTypen(): string[] {
  return BAUSTEINE.map((b) => b.typ).sort();
}

/** Stdlib-Typen ohne Katalogeintrag — muss leer sein (Test). */
export function fehlendeKatalogEintraege(): string[] {
  const beschrieben = new Set(katalogTypen());
  return stdlibTypen().filter((t) => !beschrieben.has(t));
}

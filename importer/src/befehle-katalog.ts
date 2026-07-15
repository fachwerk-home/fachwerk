/**
 * Ausgangsbox-Befehlskatalog (Import-Assistent). Vollständig dekodiert aus
 * zwei Referenz-Ausgangsboxen mit allen Palette-Einträgen (Betreiber-Vorlage,
 * Nutzdaten — kein Code). Ordnet jede cmd-Nummer ihrer Bedeutung, Fachwerk-
 * Kategorie und Feldbelegung zu. Basis dafür, was der Importer direkt abbildet
 * und was er als Zuständigkeit anderer Subsysteme berichtet.
 */

/** In welchem Fachwerk-Subsystem der Befehl landet. */
export type BefehlKategorie =
  | "ko-schreiben" // Datenpunkt-Schreiben/-Rechnen → Logik (teils direkt abbildbar)
  | "archiv" // Daten-/Meldungs-/Anrufarchiv → SPEC-004
  | "visu" // Seiten/Popups/Ton/Sprache → SPEC-003
  | "aktion" // Szene/Sequenz/Makro/HTTP/IR/Email/Telefon
  | "system"; // Steuerung der Plattform selbst

export interface BefehlDef {
  name: string;
  kategorie: BefehlKategorie;
  /** Kurzform der Feldbelegung (id1/id2/value1/option1) für die Doku. */
  felder: string;
  /**
   * true, wenn `cmdoption1` eine Unter-Auswahl kodiert, die die konkrete
   * Aktion bestimmt (z. B. „EDOMI Steuerung" → ganzer Server-Neustart vs.
   * Teilneustart). Die genaue option→Aktion-Zuordnung ist noch nicht
   * vollständig erfasst (bräuchte je eine Referenzbox pro Variante).
   */
  optionVarianten?: boolean;
}

/**
 * Bekannte Lücken im Katalog — bewusst dokumentiert statt still übergangen:
 * - Kamera-Befehle (Kameraarchiv: Bild hinzufügen/entfernen) sind in EDOMI
 *   nur mit eingerichteter Kamera anlegbar; ohne Hardware nicht erfassbar.
 *   Kategorie wäre „archiv". cmd-Nummern noch unbekannt.
 * - Option-Untervarianten mehrerer Befehle (optionVarianten=true) sind nicht
 *   im Detail dekodiert.
 * Unbekannte cmd-Nummern behandelt der Importer generisch (Report), nie raten.
 */
export const BEKANNTE_LUECKEN = [
  "Kameraarchiv: Kamerabild hinzufügen (archiv, cmd unbekannt — keine Kamera)",
  "Kameraarchiv: Kamerabild entfernen (archiv, cmd unbekannt — keine Kamera)",
  "Option-Untervarianten (cmdoption1) bei EDOMI-Steuerung u. a.",
] as const;

/**
 * cmd-Nummer → Definition. Vollständig aus der Referenz-Palette abgeleitet.
 * id1 = primäres Ziel (KO/Archiv/Visu/Szene…), id2 = Sekundärziel (Status-KO,
 * Account…), value1 = Wert/Text, option1 = Schalter (Raster, IR-Kanal, …).
 */
export const BEFEHLE: Record<number, BefehlDef> = {
  1: { name: "KO: Eingangswert zuweisen", kategorie: "ko-schreiben", felder: "id1=KO" },
  2: { name: "KO: Wert zuweisen", kategorie: "ko-schreiben", felder: "id1=KO value1=Wert" },
  3: {
    name: "KO: Wert eines anderen KOs zuweisen",
    kategorie: "ko-schreiben",
    felder: "id1=KO id2=QuellKO",
  },
  4: {
    name: "KO: Wechseln zwischen 0 und Wert",
    kategorie: "ko-schreiben",
    felder: "id1=KO value1=Wert",
  },
  5: { name: "KO: Rasterwert addieren", kategorie: "ko-schreiben", felder: "id1=KO option1=Raster" },
  6: {
    name: "KO: Wechseln zwischen 0 und Wert (mit Status-KO)",
    kategorie: "ko-schreiben",
    felder: "id1=KO id2=StatusKO value1=Wert",
  },
  7: { name: "KO: Wert addieren", kategorie: "ko-schreiben", felder: "id1=KO value1=Summand" },
  8: { name: "KO: Abfragen (Read-Request)", kategorie: "ko-schreiben", felder: "id1=KO" },
  9: { name: "KO: Wertliste vor/zurück", kategorie: "ko-schreiben", felder: "id1=KO value1=Schritt" },
  19: {
    name: "KO: Wechseln zwischen 1 und Wert (mit Status-KO)",
    kategorie: "ko-schreiben",
    felder: "id1=KO id2=StatusKO value1=Wert",
  },

  13: { name: "Datenarchiv: Eingangswert hinzufügen", kategorie: "archiv", felder: "id1=Archiv" },
  40: { name: "Datenarchiv: Wert hinzufügen", kategorie: "archiv", felder: "id1=Archiv value1=Wert" },
  42: {
    name: "Datenarchiv: KO-Wert hinzufügen",
    kategorie: "archiv",
    felder: "id1=Archiv id2=KO",
  },
  50: { name: "Datenarchiv: neusten Eintrag entfernen", kategorie: "archiv", felder: "id1=Archiv" },
  14: {
    name: "Meldungsarchiv: Eingangswert hinzufügen",
    kategorie: "archiv",
    felder: "id1=Archiv id2=?",
  },
  41: {
    name: "Meldungsarchiv: Meldung hinzufügen",
    kategorie: "archiv",
    felder: "id1=Archiv value1=Text",
  },
  51: { name: "Meldungsarchiv: neuste Meldung entfernen", kategorie: "archiv", felder: "id1=Archiv" },
  53: { name: "Anrufarchiv: neusten Eintrag entfernen", kategorie: "archiv", felder: "id1=Archiv" },

  18: {
    name: "Visu: Eingangswert als Visuseite aufrufen",
    kategorie: "visu",
    felder: "id1=Visu id2=Account",
  },
  21: { name: "Visu: Visuseite/Popup aufrufen", kategorie: "visu", felder: "id1=Seite id2=Account" },
  29: { name: "Visu: Popup schließen", kategorie: "visu", felder: "id1=Popup id2=Account" },
  28: { name: "Visu: Alle Popups schließen", kategorie: "visu", felder: "id1=Visu id2=Account" },
  24: { name: "Visu: Ton abspielen", kategorie: "visu", felder: "id1=Visu id2=Ton" },
  26: { name: "Visu: Sprachausgabe", kategorie: "visu", felder: "id1=Visu value1=Text" },
  27: { name: "Visuaccount: Sprachausgabe", kategorie: "visu", felder: "id1=Account value1=Text" },
  23: { name: "Visu: Logout", kategorie: "visu", felder: "id1=Visu id2=Account" },

  10: { name: "Szene: Abrufen", kategorie: "aktion", felder: "id1=Szene" },
  11: { name: "Sequenz: Abrufen", kategorie: "aktion", felder: "id1=Sequenz" },
  17: { name: "Makro: Ausführen", kategorie: "aktion", felder: "id1=Makro" },
  15: { name: "HTTP/UDP/SHELL: Ausführen", kategorie: "aktion", felder: "id1=Befehl" },
  16: { name: "IR-Befehl: Senden", kategorie: "aktion", felder: "id1=IR option1=Kanal" },
  20: { name: "Email: Senden", kategorie: "aktion", felder: "id1=Email" },
  22: { name: "Telefonbucheintrag: Anrufen", kategorie: "aktion", felder: "id1=Eintrag" },

  30: {
    name: "System (EDOMI-Steuerung): Neustart u. a.",
    kategorie: "system",
    felder: "option1=Aktion",
    optionVarianten: true,
  },
};

export function befehlDef(cmd: number): BefehlDef | undefined {
  return BEFEHLE[cmd];
}

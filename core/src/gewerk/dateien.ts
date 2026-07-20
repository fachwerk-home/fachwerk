/**
 * Pfadpruefung fuer den Gewerk-Schreibpfad (P5-10a).
 *
 * Ueber die API darf ein Editor Gewerk-Dateien schreiben — das ist ein
 * Dateisystem-Zugriff aus dem Netz und damit die gefaehrlichste Stelle der
 * ganzen API. Deshalb steht die Pruefung hier als eigene, reine Funktion:
 * einzeln testbar, ohne Server, ohne Dateisystem.
 *
 * Grundhaltung: ALLES ist verboten, ausser dem ausdruecklich Erlaubten. Eine
 * Sperrliste (".. verbieten") wird frueher oder spaeter umgangen; eine
 * Erlaubnisliste nicht.
 */

/** Ordner, in denen ueberhaupt Dateien liegen duerfen. */
const ERLAUBTE_ORDNER = ["datenpunkte", "logik", "visu", "visu/seiten", "archiv"] as const;

/** Dateien, die direkt im Gewerk-Wurzelverzeichnis liegen duerfen. */
const ERLAUBTE_WURZELDATEIEN = ["gewerk.yaml"] as const;

/** NUL und andere Steuerzeichen — klassischer Trick, um Pruefungen zu ueberholen. */
const STEUERZEICHEN = /[\u0000-\u001f\u007f]/;

export type PfadPruefung = { ok: true; rel: string } | { ok: false; grund: string };

/**
 * Prueft einen vom Client gelieferten Pfad. Liefert bei Erfolg den
 * normalisierten, relativen Pfad mit / als Trenner.
 *
 * Bausteine (bausteine/<id>/baustein.js) sind bewusst NICHT erlaubt: das waere
 * Code-Ausfuehrung per HTTP-POST. Wer Bausteine liefert, legt sie ins
 * Gewerk-Verzeichnis — nicht ueber die API (ADR-0008 ist offen).
 */
export function pruefeGewerkPfad(pfad: unknown): PfadPruefung {
  if (typeof pfad !== "string" || pfad === "") {
    return { ok: false, grund: "pfad fehlt oder ist kein Text" };
  }
  if (pfad.length > 200) return { ok: false, grund: "pfad ist zu lang" };
  if (STEUERZEICHEN.test(pfad)) return { ok: false, grund: "pfad enthaelt Steuerzeichen" };

  const roh = pfad.replaceAll("\\", "/");
  if (roh.startsWith("/")) return { ok: false, grund: "nur relative Pfade" };
  // Laufwerksbuchstabe (C:/...) und UNC (//server/...) sind ebenfalls absolut.
  if (/^[a-zA-Z]:/.test(roh)) return { ok: false, grund: "nur relative Pfade" };

  const teile = roh.split("/").filter((t) => t !== "" && t !== ".");
  if (teile.length === 0) return { ok: false, grund: "pfad ist leer" };
  if (teile.includes("..")) {
    return { ok: false, grund: "pfad darf nicht aus dem Gewerk herausfuehren" };
  }
  // Prozentkodierung kommt hier bereits dekodiert an; ein uebrig gebliebenes
  // %2e ist ein Zeichen fuer doppelte Kodierung — dann lieber ablehnen.
  if (teile.some((t) => t.includes("%"))) {
    return { ok: false, grund: "pfad enthaelt Prozentzeichen" };
  }

  const rel = teile.join("/");
  const datei = teile[teile.length - 1]!;
  if (datei.startsWith(".")) return { ok: false, grund: "keine versteckten Dateien" };

  if (teile.length === 1) {
    return (ERLAUBTE_WURZELDATEIEN as readonly string[]).includes(datei)
      ? { ok: true, rel }
      : {
          ok: false,
          grund: `im Wurzelverzeichnis ist nur ${ERLAUBTE_WURZELDATEIEN.join(", ")} erlaubt`,
        };
  }

  const ordner = teile.slice(0, -1).join("/");
  if (!(ERLAUBTE_ORDNER as readonly string[]).includes(ordner)) {
    return {
      ok: false,
      grund: `Ordner ${ordner} ist nicht erlaubt (erlaubt: ${ERLAUBTE_ORDNER.join(", ")})`,
    };
  }
  if (!datei.endsWith(".yaml")) return { ok: false, grund: "nur .yaml-Dateien" };

  return { ok: true, rel };
}

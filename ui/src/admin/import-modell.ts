export const IMPORT_ENDUNGEN = [".sql", ".tar", ".json"] as const;

export type ImportVorgang = "bereit" | "laedt" | "importiert" | "uebernimmt";

export interface ImportRechte {
  darfSchreiben: boolean;
  darfAktivieren: boolean;
}

export interface ImportStatus {
  kannUploaden: boolean;
  kannImportieren: boolean;
  kannUebernehmen: boolean;
  uploadGrund?: string;
  importGrund?: string;
  uebernehmenGrund?: string;
}

export function importDateinameOk(name: string): boolean {
  const klein = name.toLowerCase();
  return IMPORT_ENDUNGEN.some((endung) => klein.endsWith(endung));
}

export function importGroesseText(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} kB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
}

export function importStatus(
  rechte: ImportRechte,
  quellenAnzahl: number,
  vorgang: ImportVorgang,
  importErfolgreich: boolean,
): ImportStatus {
  const arbeitet = vorgang === "laedt" || vorgang === "uebernimmt";
  const importiert = vorgang === "importiert";
  const busy = arbeitet || importiert;
  const kannUploaden = rechte.darfSchreiben && !busy;
  const kannImportieren = rechte.darfSchreiben && quellenAnzahl > 0 && !busy;
  const kannUebernehmen = rechte.darfAktivieren && importErfolgreich && !busy;
  return {
    kannUploaden,
    kannImportieren,
    kannUebernehmen,
    ...(kannUploaden ? {} : { uploadGrund: rechte.darfSchreiben ? "Vorgang läuft" : "Scope write:gewerk fehlt" }),
    ...(kannImportieren ? {} : {
      importGrund: !rechte.darfSchreiben
        ? "Scope write:gewerk fehlt"
        : quellenAnzahl === 0
          ? "Keine Quelle bereit"
          : "Vorgang läuft",
    }),
    ...(kannUebernehmen ? {} : {
      uebernehmenGrund: !rechte.darfAktivieren
        ? "Scope activate:dev fehlt"
        : !importErfolgreich
          ? "Erst erfolgreich importieren"
          : "Vorgang läuft",
    }),
  };
}

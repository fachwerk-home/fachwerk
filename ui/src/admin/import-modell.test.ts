import { describe, expect, it } from "vitest";
import { importDateinameOk, importGroesseText, importStatus } from "./import-modell.ts";

describe("Import-Modell", () => {
  it("akzeptiert nur die von der API erlaubten Quelldateien", () => {
    expect(importDateinameOk("dump.sql")).toBe(true);
    expect(importDateinameOk("visu.TAR")).toBe(true);
    expect(importDateinameOk("export.json")).toBe(true);
    expect(importDateinameOk("backup.zip")).toBe(false);
    expect(importDateinameOk("sql")).toBe(false);
  });

  it("formatiert Quellgrößen kompakt", () => {
    expect(importGroesseText(512)).toBe("512 B");
    expect(importGroesseText(1536)).toBe("1.5 kB");
    expect(importGroesseText(1_782_579)).toBe("1.7 MB");
  });

  it("spiegelt Schreib- und Aktivierungsrechte in die Button-Status", () => {
    expect(importStatus({ darfSchreiben: false, darfAktivieren: true }, 1, "bereit", true))
      .toMatchObject({ kannUploaden: false, kannImportieren: false, kannUebernehmen: true, importGrund: "Scope write:gewerk fehlt" });
    expect(importStatus({ darfSchreiben: true, darfAktivieren: false }, 1, "bereit", true))
      .toMatchObject({ kannUploaden: true, kannImportieren: true, kannUebernehmen: false, uebernehmenGrund: "Scope activate:dev fehlt" });
    expect(importStatus({ darfSchreiben: true, darfAktivieren: true }, 0, "bereit", false))
      .toMatchObject({ kannImportieren: false, importGrund: "Keine Quelle bereit", kannUebernehmen: false });
  });

  it("sperrt Aktionen während laufender Vorgänge", () => {
    expect(importStatus({ darfSchreiben: true, darfAktivieren: true }, 1, "laedt", true))
      .toMatchObject({ kannUploaden: false, kannImportieren: false, kannUebernehmen: false });
    expect(importStatus({ darfSchreiben: true, darfAktivieren: true }, 1, "importiert", true))
      .toMatchObject({ kannUploaden: false, kannImportieren: false, kannUebernehmen: false });
  });

  it("verschiebt die Hauptaktion nach erfolgreichem Import auf Übernehmen", () => {
    expect(importStatus({ darfSchreiben: true, darfAktivieren: true }, 1, "bereit", false))
      .toMatchObject({ hauptAktion: "importieren", kannImportieren: true, kannUebernehmen: false });
    expect(importStatus({ darfSchreiben: true, darfAktivieren: true }, 1, "bereit", true))
      .toMatchObject({ hauptAktion: "uebernehmen", kannImportieren: true, kannUebernehmen: true });
    expect(importStatus({ darfSchreiben: true, darfAktivieren: false }, 1, "bereit", true))
      .toMatchObject({ hauptAktion: "uebernehmen", kannUebernehmen: false, uebernehmenGrund: "Scope activate:dev fehlt" });
  });
});

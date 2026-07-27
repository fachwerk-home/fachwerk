import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { ApiFehler, api, type ImportQuelle } from "../lib/api.ts";
import { importDateinameOk, importGroesseText, importStatus, type ImportVorgang } from "./import-modell.ts";

type MeldungTon = "ok" | "fehler" | "info";

interface Meldung {
  ton: MeldungTon;
  text: string;
}

function fehlerText(error: unknown): string {
  if (error instanceof ApiFehler) {
    const grund = error.koerper.fehler;
    const text = Array.isArray(grund) ? grund.join("\n") : grund;
    return text ? `${error.status}: ${text}` : error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

export function ImportAnsicht({
  darfSchreiben,
  darfAktivieren,
  onAktiviert,
}: {
  darfSchreiben: boolean;
  darfAktivieren: boolean;
  onAktiviert: () => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [quellen, setQuellen] = useState<ImportQuelle[]>([]);
  const [meldung, setMeldung] = useState<Meldung | null>(null);
  const [bericht, setBericht] = useState("");
  const [vorgang, setVorgang] = useState<ImportVorgang>("bereit");
  const [importErfolgreich, setImportErfolgreich] = useState(false);

  const status = useMemo(
    () => importStatus({ darfSchreiben, darfAktivieren }, quellen.length, vorgang, importErfolgreich),
    [darfSchreiben, darfAktivieren, quellen.length, vorgang, importErfolgreich],
  );

  const ladeQuellen = async (): Promise<void> => {
    const antwort = await api.importQuellen();
    setQuellen([...antwort.quellen].sort((a, b) => a.name.localeCompare(b.name, "de")));
  };

  useEffect(() => {
    void ladeQuellen().catch((error: unknown) => setMeldung({ ton: "fehler", text: fehlerText(error) }));
  }, []);

  const ladeDateien = async (dateien: FileList | File[]): Promise<void> => {
    const liste = Array.from(dateien);
    if (liste.length === 0) return;
    const ungueltig = liste.find((datei) => !importDateinameOk(datei.name));
    if (ungueltig) {
      setMeldung({ ton: "fehler", text: `415: Nicht unterstütztes Format: ${ungueltig.name}. Erlaubt sind .sql, .tar, .json.` });
      return;
    }
    setVorgang("laedt");
    setMeldung({ ton: "info", text: liste.length === 1 ? `Lädt ${liste[0]!.name} …` : `Lädt ${liste.length} Dateien …` });
    try {
      for (const datei of liste) await api.ladeImportQuelle(datei.name, datei);
      setImportErfolgreich(false);
      setBericht("");
      await ladeQuellen();
      setMeldung({ ton: "ok", text: liste.length === 1 ? `${liste[0]!.name} abgelegt.` : `${liste.length} Dateien abgelegt.` });
    } catch (error) {
      setMeldung({ ton: "fehler", text: fehlerText(error) });
    } finally {
      setVorgang("bereit");
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const entferne = async (name: string): Promise<void> => {
    setVorgang("laedt");
    setMeldung({ ton: "info", text: `Entferne ${name} …` });
    try {
      await api.entferneImportQuelle(name);
      setImportErfolgreich(false);
      setBericht("");
      await ladeQuellen();
      setMeldung({ ton: "ok", text: `${name} entfernt.` });
    } catch (error) {
      setMeldung({ ton: "fehler", text: fehlerText(error) });
    } finally {
      setVorgang("bereit");
    }
  };

  const importieren = async (): Promise<void> => {
    setVorgang("importiert");
    setMeldung({ ton: "info", text: "Import läuft …" });
    setImportErfolgreich(false);
    try {
      const antwort = await api.importiereGewerk();
      setBericht(antwort.bericht);
      setImportErfolgreich(true);
      setMeldung({ ton: "ok", text: "Import abgeschlossen. Bericht prüfen, dann übernehmen." });
    } catch (error) {
      setBericht(error instanceof ApiFehler ? fehlerText(error) : "");
      setMeldung({ ton: "fehler", text: fehlerText(error) });
    } finally {
      setVorgang("bereit");
    }
  };

  const uebernehmen = async (): Promise<void> => {
    const bestaetigt = window.confirm(
      "Übernehmen und aktivieren ersetzt das laufende Gewerk. Der Vorgänger bleibt auf dem Host als <gewerk>.alt liegen. Fortfahren?",
    );
    if (!bestaetigt) return;
    setVorgang("uebernimmt");
    setMeldung({ ton: "info", text: "Übernahme und Aktivierung läuft …" });
    try {
      const antwort = await api.uebernehmeImport();
      await onAktiviert();
      setMeldung({ ton: "ok", text: `Übernommen und aktiviert in ${antwort.dauerMs} ms.` });
      setImportErfolgreich(false);
    } catch (error) {
      setMeldung({ ton: "fehler", text: fehlerText(error) });
    } finally {
      setVorgang("bereit");
    }
  };

  const ausDrop = (event: DragEvent): void => {
    event.preventDefault();
    if (!status.kannUploaden || !event.dataTransfer?.files) return;
    void ladeDateien(event.dataTransfer.files);
  };

  return (
    <div class="import-layout">
      <section class="karte import-kopf">
        <div>
          <h2>Gewerk importieren</h2>
          <p>Lege .sql, .tar oder .json als Quelle ab. Importieren erzeugt ein neues Gewerk daneben; erst Übernehmen ersetzt das laufende Gewerk.</p>
        </div>
        <div class="import-aktionen">
          <button
            class="primaer"
            disabled={!status.kannImportieren}
            title={status.importGrund}
            onClick={() => void importieren()}
          >
            {vorgang === "importiert" ? "Import läuft …" : "Importieren"}
          </button>
          <button
            disabled={!status.kannUebernehmen}
            title={status.uebernehmenGrund}
            onClick={() => void uebernehmen()}
          >
            {vorgang === "uebernimmt" ? "Übernimmt …" : "Übernehmen und aktivieren"}
          </button>
        </div>
      </section>

      <section
        class={`karte import-dropzone ${status.kannUploaden ? "" : "gesperrt"}`}
        onDragOver={(event) => { event.preventDefault(); }}
        onDrop={ausDrop}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".sql,.tar,.json"
          disabled={!status.kannUploaden}
          onChange={(event) => {
            const dateien = (event.currentTarget as HTMLInputElement).files;
            if (dateien) void ladeDateien(dateien);
          }}
        />
        <strong>Dateien auswählen oder hier ablegen</strong>
        <span>{status.uploadGrund ?? "Erlaubt: .sql, .tar, .json · roher Upload, kein multipart"}</span>
      </section>

      {meldung && <div class={`import-meldung import-${meldung.ton}`} role={meldung.ton === "fehler" ? "alert" : "status"}>{meldung.text}</div>}

      <section class="karte import-quellen" aria-label="Bereitliegende Quellen">
        <div class="abschnitt-kopf">
          <h3>Bereitliegende Quellen</h3>
          <button disabled={vorgang !== "bereit"} onClick={() => void ladeQuellen()}>Aktualisieren</button>
        </div>
        {quellen.length === 0 ? (
          <p class="schwach">Noch keine Quelle abgelegt.</p>
        ) : (
          <div class="import-quellenliste">
            {quellen.map((quelle) => (
              <div key={quelle.name} class="import-quelle">
                <strong>{quelle.name}</strong>
                <span>{importGroesseText(quelle.groesse)}</span>
                <button
                  class="icon-knopf"
                  disabled={!status.kannUploaden}
                  title={status.uploadGrund ?? "Quelle entfernen"}
                  aria-label={`${quelle.name} entfernen`}
                  onClick={() => void entferne(quelle.name)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section class="karte import-bericht" aria-label="Importbericht">
        <h3>Importbericht</h3>
        <pre>{bericht || "Noch kein Importbericht. Starte den Import, sobald alle Quellen bereitliegen."}</pre>
      </section>
    </div>
  );
}

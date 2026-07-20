import { useEffect, useMemo, useState } from "preact/hooks";
import { Diagramm } from "../lib/diagramm.tsx";
import type { ArchivEintrag, LiveNachricht } from "../lib/api.ts";

type LiveWert = Extract<LiveNachricht, { art: "wert" }>;

export function Archive({
  archive,
  liveNachricht,
}: {
  archive: ArchivEintrag[];
  liveNachricht: LiveWert | null;
}) {
  const sortiert = useMemo(
    () => [...archive].sort((a, b) => a.name.localeCompare(b.name, "de") || a.id.localeCompare(b.id, "de")),
    [archive],
  );
  const [auswahl, setAuswahl] = useState<string | null>(null);

  useEffect(() => {
    if (sortiert.length === 0) {
      setAuswahl(null);
      return;
    }
    if (!auswahl || !sortiert.some((archiv) => archiv.id === auswahl)) {
      setAuswahl(sortiert[0]?.id ?? null);
    }
  }, [sortiert, auswahl]);

  const aktiv = sortiert.find((archiv) => archiv.id === auswahl);

  if (sortiert.length === 0) {
    return <div class="leerzustand"><strong>Keine Archive definiert</strong><span>Das Gewerk liefert aktuell keine Zeitreihen.</span></div>;
  }

  return (
    <div class="archiv-arbeitsflaeche">
      <aside class="archiv-liste" aria-label="Archive">
        {sortiert.map((archiv) => (
          <button
            key={archiv.id}
            type="button"
            aria-pressed={archiv.id === auswahl}
            onClick={() => setAuswahl(archiv.id)}
          >
            <strong>{archiv.name}</strong>
            <span class="mono">{archiv.id}</span>
            <span>{archiv.quelle}</span>
            <small>{archiv.punkte.toLocaleString("de-DE")} Punkte · {archiv.aufbewahrung_tage} T</small>
          </button>
        ))}
      </aside>
      <section class="archiv-detail" aria-label={aktiv?.name ?? "Archiv"}>
        <Diagramm archivId={aktiv?.id} startStunden={24} liveNachricht={liveNachricht} klasse="diagramm-admin" />
      </section>
    </div>
  );
}

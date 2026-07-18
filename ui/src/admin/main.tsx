import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import "../lib/stil.css";
import "./admin.css";
import {
  api,
  verbindeLive,
  type DatenpunktSicht,
  type LiveNachricht,
  type Status,
  type Wert,
} from "../lib/api.ts";

function dauer(ms: number): string {
  const s = Math.floor(ms / 1000);
  const t = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (t > 0) return `${t}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}

function zeit(ts: number | null): string {
  if (ts === null) return "—";
  const d = new Date(ts);
  return d.toLocaleTimeString("de-DE", { hour12: false });
}

function wertText(w: Wert | null): string {
  if (w === null) return "—";
  if (typeof w === "boolean") return w ? "an" : "aus";
  return String(w);
}

function Kopf({ status, live }: { status: Status | null; live: boolean }) {
  const knx = status?.knx;
  const mqtt = status?.mqtt;
  const beobachtung = knx?.modus === "beobachten";
  return (
    <header class="kopf">
      <div>
        <strong>Fachwerk</strong>{" "}
        <span class="schwach">{status ? status.gewerk : "lädt …"}</span>
      </div>
      <div class="kopf-status">
        {beobachtung && <span class="marke marke-beobachtung">BEOBACHTUNG · sendet nie</span>}
        {knx && (
          <span class={knx.verbunden ? "ok" : "fehler"}>
            KNX {knx.verbunden ? "verbunden" : "getrennt"}
            {knx.adresse ? ` (${knx.adresse}, Kanal ${knx.kanal})` : ""}
          </span>
        )}
        {mqtt && (
          <span class={mqtt.verbunden ? "ok" : "fehler"}>
            MQTT {mqtt.verbunden ? `verbunden (${mqtt.topics} Topics)` : "getrennt"}
          </span>
        )}
        {status && <span class="schwach">seit {dauer(status.uptimeMs)}</span>}
        <span class={live ? "ok" : "warn"}>{live ? "● live" : "○ offline"}</span>
      </div>
    </header>
  );
}

function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [dps, setDps] = useState<DatenpunktSicht[]>([]);
  const [filter, setFilter] = useState("");
  const [nurGesetzt, setNurGesetzt] = useState(true);
  const [live, setLive] = useState(false);
  const [geaendert, setGeaendert] = useState<Record<string, number>>({});
  const [fehler, setFehler] = useState<string | null>(null);

  // Erstladen + Status-Refresh
  useEffect(() => {
    let aktiv = true;
    const laden = async (): Promise<void> => {
      try {
        const [s, d] = await Promise.all([api.status(), api.datenpunkte()]);
        if (!aktiv) return;
        setStatus(s);
        setDps(d.datenpunkte);
        setFehler(null);
      } catch (e) {
        if (aktiv) setFehler(e instanceof Error ? e.message : String(e));
      }
    };
    void laden();
    const t = setInterval(() => void api.status().then(setStatus).catch(() => {}), 5000);
    return () => {
      aktiv = false;
      clearInterval(t);
    };
  }, []);

  // Live-Werte
  useEffect(() => {
    return verbindeLive((n: LiveNachricht) => {
      if (n.art !== "wert") return;
      setDps((alt) =>
        alt.map((d) => (d.schluessel === n.schluessel ? { ...d, wert: n.wert, ts: n.ts } : d)),
      );
      setGeaendert((alt) => ({ ...alt, [n.schluessel]: Date.now() }));
    }, setLive);
  }, []);

  const suche = filter.trim().toLowerCase();
  const sichtbar = dps.filter((d) => {
    if (nurGesetzt && d.ts === null) return false;
    if (!suche) return true;
    return (
      d.schluessel.toLowerCase().includes(suche) ||
      d.name.toLowerCase().includes(suche) ||
      (d.adresse ?? "").toLowerCase().includes(suche)
    );
  });

  return (
    <>
      <Kopf status={status} live={live} />
      {fehler && <div class="karte fehler meldung">API nicht erreichbar: {fehler}</div>}
      <main>
        <div class="werkzeuge">
          <input
            type="search"
            placeholder="Suchen (Name, Schlüssel, GA/Topic) …"
            value={filter}
            onInput={(e) => setFilter((e.target as HTMLInputElement).value)}
          />
          <button aria-pressed={nurGesetzt} onClick={() => setNurGesetzt((v) => !v)}>
            nur mit Wert
          </button>
          <span class="schwach">
            {sichtbar.length} von {dps.length}
          </span>
        </div>

        <table class="tabelle">
          <thead>
            <tr>
              <th>Name</th>
              <th>Schlüssel</th>
              <th>Adresse</th>
              <th class="rechts">Wert</th>
              <th class="rechts">geändert</th>
            </tr>
          </thead>
          <tbody>
            {sichtbar.slice(0, 500).map((d) => {
              const frisch = Date.now() - (geaendert[d.schluessel] ?? 0) < 2000;
              return (
                <tr key={d.schluessel} class={frisch ? "frisch" : ""}>
                  <td>
                    {d.name}
                    {d.protected && <span class="marke" title="geschützt">🔒</span>}
                  </td>
                  <td class="mono schwach">{d.schluessel}</td>
                  <td class="mono schwach">{d.adresse ?? "—"}</td>
                  <td class="rechts mono">{wertText(d.wert)}</td>
                  <td class="rechts schwach">{zeit(d.ts)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sichtbar.length > 500 && (
          <p class="schwach">… weitere {sichtbar.length - 500} ausgeblendet (Filter nutzen)</p>
        )}
      </main>
    </>
  );
}

render(<App />, document.getElementById("app")!);

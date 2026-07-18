import { render } from "preact";
import "../lib/stil.css";

/**
 * Visu-Client (PWA) — Platzhalter. Der Renderer entsteht in P5-6/P5-7 auf
 * Basis des Visu-Formats (SPEC-003, ADR-0010/0011). Bewusst eigener
 * Einstiegspunkt, damit Editor-Code nie im Panel-Bundle landet (ADR-0013 U-3).
 */
function App() {
  return (
    <main style="padding:2rem;max-width:40rem;margin:0 auto">
      <h1>Fachwerk Visu</h1>
      <p class="schwach">
        Der Visualisierungs-Client wird in Schnitt P5-6/P5-7 gebaut (Visu-Format,
        Renderer, Live-Bindungen).
      </p>
      <p>
        Bis dahin: <a href="./index.html">Monitor öffnen</a>
      </p>
    </main>
  );
}

render(<App />, document.getElementById("app")!);

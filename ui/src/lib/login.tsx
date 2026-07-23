import { useState } from "preact/hooks";
import { api } from "./api.ts";
import { authFehlerText } from "./auth.ts";

export function LoginAnsicht({
  titel = "Fachwerk",
  onErfolg,
}: {
  titel?: string;
  onErfolg: () => void;
}) {
  const [name, setName] = useState("");
  const [passwort, setPasswort] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [sendet, setSendet] = useState(false);

  const anmelden = async (event: Event): Promise<void> => {
    event.preventDefault();
    setSendet(true);
    setFehler(null);
    try {
      await api.login(name, passwort);
      setPasswort("");
      onErfolg();
    } catch (error) {
      setFehler(authFehlerText(error));
    } finally {
      setSendet(false);
    }
  };

  return (
    <main class="login-seite">
      <form class="login-karte" onSubmit={(event) => void anmelden(event)}>
        <div>
          <span class="produkt">FACHWERK</span>
          <h1>{titel}</h1>
          <p class="schwach">Bitte anmelden, um diese Oberfläche zu öffnen.</p>
        </div>
        <label>
          Name
          <input type="text" autocomplete="username" value={name} onInput={(event) => setName((event.target as HTMLInputElement).value)} autofocus />
        </label>
        <label>
          Passwort
          <input
            type="password"
            autocomplete="current-password"
            value={passwort}
            onInput={(event) => setPasswort((event.target as HTMLInputElement).value)}
          />
        </label>
        {fehler && <div class="login-fehler" role="alert">{fehler}</div>}
        <button class="primaer" disabled={sendet || name.trim() === "" || passwort === ""}>{sendet ? "Anmeldung läuft …" : "Anmelden"}</button>
      </form>
    </main>
  );
}

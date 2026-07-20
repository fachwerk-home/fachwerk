// Telegram-Versand ueber den Netz-Dienst der Engine (ADR-0014 V-2).
//
// Der Baustein bekommt kein fetch. Er sagt der Engine, WAS er will; die prueft
// gegen die Allowlist aus dem Manifest (capabilities.netz.hosts) und liefert
// die Antwort spaeter als eigenen Auslöser `netz` zurueck. Damit steht das
// Ergebnis sauber an den Ausgaengen, statt dem Versand um eine Auslösung
// hinterherzulaufen — so war es vor ADR-0014, und es war eine Zumutung.

let laufendeNummer = 0;

export default function rechne(eingaenge, ctx) {
  // Fall 1: Die Antwort auf einen frueheren Versand trifft ein.
  if (ctx.ausloeser.art === "netz") {
    const ok = ctx.ausloeser.ok;
    return {
      gesendet: ok,
      fehler: ok ? "" : (ctx.ausloeser.fehler ?? `HTTP ${ctx.ausloeser.status}`),
    };
  }

  // Fall 2: Auslösung durch einen Eingang — Nachricht bauen und absenden.
  if (eingaenge.ausloeser !== true) return null;

  if (ctx.parameter.nur_bei !== null && ctx.parameter.nur_bei !== undefined) {
    if (eingaenge.wert !== ctx.parameter.nur_bei) return null;
  }

  let text = String(ctx.parameter.text || "{wert}");
  if (eingaenge.wert !== undefined) {
    text = text.replaceAll("{wert}", String(eingaenge.wert));
  }

  const token = ctx.parameter.bot_token;
  const chatId = ctx.parameter.chat_id;
  if (!token || !chatId) {
    return { gesendet: false, fehler: "Token oder Chat-ID fehlt" };
  }

  const basis = ctx.parameter.api_basis || "https://api.telegram.org";
  laufendeNummer += 1;
  ctx.netz.hole(`sende-${laufendeNummer}`, `${basis}/bot${token}/sendMessage`, {
    methode: "POST",
    kopfzeilen: { "content-type": "application/json" },
    koerper: JSON.stringify({ chat_id: chatId, text }),
  });

  // Noch nichts zu melden: das Ergebnis kommt oben als Auslöser `netz` an.
  return null;
}

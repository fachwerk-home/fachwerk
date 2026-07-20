let letzterStatusGesendet = false;
let letzterStatusFehler = "";

export default function rechne(eingaenge, ctx) {
  // Outputs aus dem vorherigen Durchlauf zwischenspeichern, 
  // da wir sie am Ende synchron zurückgeben.
  const ausgabe = { 
    gesendet: letzterStatusGesendet, 
    fehler: letzterStatusFehler 
  };

  if (eingaenge.ausloeser !== true) return null;

  if (ctx.parameter.nur_bei !== null && ctx.parameter.nur_bei !== undefined) {
    if (eingaenge.wert !== ctx.parameter.nur_bei) return null;
  }

  let msgText = String(ctx.parameter.text || "{wert}");
  if (eingaenge.wert !== undefined) {
    msgText = msgText.replaceAll("{wert}", String(eingaenge.wert));
  }

  const token = ctx.parameter.bot_token;
  const chatId = ctx.parameter.chat_id;
  const apiBasis = ctx.parameter.api_basis || "https://api.telegram.org";

  if (!token || !chatId) {
    letzterStatusGesendet = false;
    letzterStatusFehler = "Token oder Chat-ID fehlt";
    return ausgabe;
  }

  // Fire-and-forget Fetch mit Timeout
  const url = `${apiBasis}/bot${token}/sendMessage`;
  const payload = {
    chat_id: chatId,
    text: msgText,
  };

  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000)
  })
    .then(async (res) => {
      if (!res.ok) {
        letzterStatusGesendet = false;
        letzterStatusFehler = `HTTP ${res.status}: ${await res.text()}`;
      } else {
        letzterStatusGesendet = true;
        letzterStatusFehler = "";
      }
    })
    .catch((err) => {
      letzterStatusGesendet = false;
      letzterStatusFehler = err.message || "Netzwerkfehler";
    });

  // Wir geben den Zustand VOR diesem Fetch zurück.
  // Das Ergebnis dieses Fetches wird erst beim nächsten Aufruf auf den Ausgang gelegt.
  return ausgabe;
}

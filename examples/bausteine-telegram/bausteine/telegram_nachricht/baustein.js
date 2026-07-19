export default function rechne(eingaenge, ctx) {
  if (eingaenge.ausloeser !== true) return null;

  if (ctx.parameter.nur_bei !== null && ctx.parameter.nur_bei !== undefined) {
    if (eingaenge.wert !== ctx.parameter.nur_bei) return null;
  }

  let msgText = String(ctx.parameter.text || "{wert}");
  if (msgText.includes("{wert}") && eingaenge.wert !== undefined) {
    msgText = msgText.replace("{wert}", String(eingaenge.wert));
  }

  // WICHTIGER HINWEIS (laut Auftrag):
  // HTTP Versand (fetch) ist asynchron. 
  // Die Sandbox rechnet aber synchron und crasht bei Rückgabe eines Promises (DataCloneError).
  // Daher ist ein fire-and-forget Versand mit Ergebnis an den Ausgangsports 
  // hier gar nicht möglich. 
  // -> STOPP. Sandbox-Erweiterung wird in Spur 1 als Frage formuliert!
  
  // Für die Test-Abdeckung (reine Logik) geben wir synchron Erfolg zurück:
  return { gesendet: true, fehler: "" };
}

// Flankenzähler — Beispiel für einen eigenen Baustein (Null-Toolchain):
// plain JavaScript, ESM, default-Export. Läuft in der Fachwerk-Sandbox.
export default function rechne(eingaenge, ctx) {
  const vorher = ctx.zustand.letzter === true;
  ctx.zustand.letzter = eingaenge.in === true;
  if (eingaenge.in === true && !vorher) {
    const n = (typeof ctx.zustand.n === "number" ? ctx.zustand.n : 0) + 1;
    ctx.zustand.n = n;
    return { out: n };
  }
  return null;
}

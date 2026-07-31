import type { JSX } from "preact";
import type { VisuDesign, VisuRand, VisuSchatten } from "../../../schema/src/visu.ts";
import { schriftfamilieFuer, textausrichtungCss } from "./modell.ts";

function px(wert: number | undefined): string {
  return `${wert ?? 0}px`;
}

function cssDateiName(datei: string | undefined): string | undefined {
  const name = datei?.trim();
  return name && name.length > 0 ? name : undefined;
}

function randMusterCss(muster: VisuRand["muster"]): JSX.CSSProperties["borderStyle"] | undefined {
  switch (muster) {
    case "linie": return "solid";
    case "punkte": return "dotted";
    case "striche": return "dashed";
    default: return undefined;
  }
}

function boxShadowCss(schatten: VisuSchatten | undefined): string | undefined {
  if (!schatten) return undefined;
  return [
    schatten.innen ? "inset" : "",
    px(schatten.x),
    px(schatten.y),
    px(schatten.unschaerfe),
    px(schatten.ueberstand),
    schatten.farbe ?? "currentColor",
  ].filter(Boolean).join(" ");
}

function textShadowCss(schatten: VisuDesign["textschatten"]): string | undefined {
  if (!schatten) return undefined;
  return [
    px(schatten.x),
    px(schatten.y),
    px(schatten.unschaerfe),
    schatten.farbe ?? "currentColor",
  ].join(" ");
}

function schriftstaerkeCss(
  schriftstaerke: VisuDesign["schriftstaerke"],
): JSX.CSSProperties["fontWeight"] | undefined {
  switch (schriftstaerke) {
    case "fett": return "bold";
    case "normal": return "normal";
    default: return undefined;
  }
}

export function visuDateiUrl(datei: string): string {
  return `/api/visu/datei/${encodeURIComponent(datei)}`;
}

export function designStil(design: VisuDesign): JSX.CSSProperties {
  const rand = design.rand;
  const bild = cssDateiName(design.bild);
  return {
    textAlign: textausrichtungCss(design.textausrichtung),
    ...(design.hintergrund ? { background: design.hintergrund } : {}),
    ...(bild ? { backgroundImage: `url("${visuDateiUrl(bild)}")` } : {}),
    ...(design.text ? { color: design.text } : {}),
    ...(design.schriftart ? { fontFamily: schriftfamilieFuer(design.schriftart) } : {}),
    ...(design.schriftgroesse !== undefined ? { fontSize: `${design.schriftgroesse}px` } : {}),
    ...(design.schriftstil ? { fontStyle: design.schriftstil === "kursiv" ? "italic" : "normal" } : {}),
    ...(design.schriftstaerke ? { fontWeight: schriftstaerkeCss(design.schriftstaerke) } : {}),
    ...(design.polsterung !== undefined ? { padding: `${design.polsterung}px` } : {}),
    ...(design.versatz ? { translate: `${px(design.versatz.x)} ${px(design.versatz.y)}` } : {}),
    ...(design.deckkraft !== undefined ? { opacity: design.deckkraft } : {}),
    ...(boxShadowCss(design.schatten) ? { boxShadow: boxShadowCss(design.schatten) } : {}),
    ...(textShadowCss(design.textschatten) ? { textShadow: textShadowCss(design.textschatten) } : {}),
    ...(rand?.staerke !== undefined ? { borderWidth: `${rand.staerke}px` } : {}),
    ...(rand?.muster ? { borderStyle: randMusterCss(rand.muster) } : {}),
    ...(rand?.farbe ? { borderColor: rand.farbe } : {}),
    ...(rand?.farben?.oben ? { borderTopColor: rand.farben.oben } : {}),
    ...(rand?.farben?.rechts ? { borderRightColor: rand.farben.rechts } : {}),
    ...(rand?.farben?.unten ? { borderBottomColor: rand.farben.unten } : {}),
    ...(rand?.farben?.links ? { borderLeftColor: rand.farben.links } : {}),
    ...(rand?.radius !== undefined ? { borderRadius: `${rand.radius}px` } : {}),
    ...(rand?.radien?.ol !== undefined ? { borderTopLeftRadius: `${rand.radien.ol}px` } : {}),
    ...(rand?.radien?.or !== undefined ? { borderTopRightRadius: `${rand.radien.or}px` } : {}),
    ...(rand?.radien?.ur !== undefined ? { borderBottomRightRadius: `${rand.radien.ur}px` } : {}),
    ...(rand?.radien?.ul !== undefined ? { borderBottomLeftRadius: `${rand.radien.ul}px` } : {}),
  };
}

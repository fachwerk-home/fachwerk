import { describe, expect, it } from "vitest";
import { designStil, visuDateiUrl } from "./design.ts";

describe("Visu-Design-CSS", () => {
  it("zeichnet Schatten nach innen", () => {
    expect(designStil({
      schatten: {
        x: 2,
        y: 3,
        unschaerfe: 4,
        ueberstand: 5,
        farbe: "rgb(1 2 3 / 50%)",
        innen: true,
      },
    })).toMatchObject({
      boxShadow: "inset 2px 3px 4px 5px rgb(1 2 3 / 50%)",
    });
  });

  it("uebersetzt Rahmenmuster in CSS border-style", () => {
    expect(designStil({ rand: { muster: "linie" } })).toMatchObject({ borderStyle: "solid" });
    expect(designStil({ rand: { muster: "punkte" } })).toMatchObject({ borderStyle: "dotted" });
    expect(designStil({ rand: { muster: "striche" } })).toMatchObject({ borderStyle: "dashed" });
  });

  it("laesst ausfuehrliche Eckenradien gegen den einfachen Radius gewinnen", () => {
    expect(designStil({
      rand: {
        radius: 8,
        radien: { ol: 1, or: 2, ur: 3, ul: 4 },
      },
    })).toMatchObject({
      borderRadius: "8px",
      borderTopLeftRadius: "1px",
      borderTopRightRadius: "2px",
      borderBottomRightRadius: "3px",
      borderBottomLeftRadius: "4px",
    });
  });

  it("verschiebt per Versatz relativ zur Platzierung", () => {
    expect(designStil({ versatz: { x: -6, y: 12 } })).toMatchObject({
      translate: "-6px 12px",
    });
  });

  it("zeichnet Schrift, Polsterung, Bild, Rahmenfarben und Textschatten", () => {
    expect(designStil({
      schriftstil: "kursiv",
      schriftstaerke: "fett",
      polsterung: 7,
      bild: "muster hintergrund.png",
      textschatten: { x: 1, y: 2, unschaerfe: 3, farbe: "#123456" },
      rand: {
        farbe: "#000000",
        farben: {
          oben: "#111111",
          rechts: "#222222",
          unten: "#333333",
          links: "#444444",
        },
      },
    })).toMatchObject({
      fontStyle: "italic",
      fontWeight: "bold",
      padding: "7px",
      backgroundImage: `url("${visuDateiUrl("muster hintergrund.png")}")`,
      textShadow: "1px 2px 3px #123456",
      borderColor: "#000000",
      borderTopColor: "#111111",
      borderRightColor: "#222222",
      borderBottomColor: "#333333",
      borderLeftColor: "#444444",
    });
  });
});

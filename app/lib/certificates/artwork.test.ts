import { describe, expect, it } from "vitest";

import { parseCertificateArtwork } from "./artwork";

describe("parseCertificateArtwork", () => {
  it("reads the size and every element in drawing order", () => {
    const artwork = parseCertificateArtwork(
      [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200" width="300" height="200">',
        '<rect width="300" height="200" fill="#ffffff"/>',
        '<image id="encabezado" x="0" y="0" width="300" height="50" xlink:href="data:image/jpeg;base64,/9j/AA=="/>',
        '<rect id="pie" x="0" y="180" width="300" height="20" fill="#011c1b"/>',
        '<path id="firma" transform="translate(15,120.5)" fill="#000000" fill-rule="evenodd" d="M0,0L10,10Z"/>',
        "</svg>",
      ].join("\n"),
    );

    expect(artwork).toEqual({
      height: 200,
      width: 300,
      elements: [
        { kind: "rect", x: 0, y: 0, width: 300, height: 200, fill: "#ffffff" },
        {
          kind: "jpeg",
          x: 0,
          y: 0,
          width: 300,
          height: 50,
          dataUri: "data:image/jpeg;base64,/9j/AA==",
        },
        {
          kind: "rect",
          x: 0,
          y: 180,
          width: 300,
          height: 20,
          fill: "#011c1b",
        },
        {
          kind: "path",
          d: "M0,0L10,10Z",
          fill: "#000000",
          translateX: 15,
          translateY: 120.5,
        },
      ],
    });
  });

  it("refuses an element it cannot draw instead of leaving it out", () => {
    expect(() =>
      parseCertificateArtwork(
        '<svg viewBox="0 0 10 10" width="10" height="10"><circle r="2"/></svg>',
      ),
    ).toThrow(/circle/);
  });
});

import { describe, expect, it } from "vitest";

import {
  layoutCertificateBody,
  type CertificateBodyFrame,
  type MeasureText,
} from "./body-layout";

// Every character is half the font size wide in regular and the full size in
// bold, so a width can be worked out by hand.
const measure: MeasureText = (text, weight, fontSize) =>
  text.length * fontSize * (weight === "bold" ? 1 : 0.5);

const frame: CertificateBodyFrame = {
  fontSize: 10,
  height: 40,
  left: 100,
  lineHeight: 2,
  top: 200,
  width: 100,
};

function lineTexts(layout: ReturnType<typeof layoutCertificateBody>) {
  return layout.lines.map((line) =>
    line.pieces.map((piece) => piece.text).join(""),
  );
}

describe("layoutCertificateBody", () => {
  it("wraps at spaces and centres each line in the frame", () => {
    // "aaaa bbbb cccc" is 70 wide at size 10; with " dddddd" it is 105.
    const layout = layoutCertificateBody(
      [{ text: "aaaa bbbb cccc dddddd", weight: "regular" }],
      frame,
      measure,
    );

    expect(layout.fontSize).toBe(10);
    expect(lineTexts(layout)).toEqual(["aaaa bbbb cccc", "dddddd"]);
    // 70 wide in a 100 frame from 100: 15 on each side.
    expect(layout.lines[0].pieces[0].x).toBe(115);
    // 30 wide: 35 on each side.
    expect(layout.lines[1].pieces[0].x).toBe(135);
  });

  it("centres the block of lines vertically", () => {
    const layout = layoutCertificateBody(
      [{ text: "aaaa", weight: "regular" }],
      frame,
      measure,
    );

    // One line of 20 (size 10 × 2) in a 40 frame from 200.
    expect(layout.lines.map((line) => line.top)).toEqual([210]);
    expect(layout.lineHeight).toBe(20);
  });

  it("keeps a bold run and the punctuation glued to it on one line", () => {
    const layout = layoutCertificateBody(
      [
        { text: "aaaa bbbb ccc ", weight: "regular" },
        { text: "ddd", weight: "bold" },
        { text: ".", weight: "regular" },
      ],
      frame,
      measure,
    );

    // "aaaa bbbb ccc ddd." would be 105: the period does not stay behind.
    expect(lineTexts(layout)).toEqual(["aaaa bbbb ccc", "ddd."]);
    const [bold, period] = layout.lines[1].pieces;
    expect(bold).toMatchObject({ text: "ddd", weight: "bold" });
    // "ddd." is 35 wide: it starts at 132.5 and the period follows the bold.
    expect(bold.x).toBe(132.5);
    expect(period).toMatchObject({ text: ".", weight: "regular", x: 162.5 });
  });

  it("shrinks every run alike when the lines do not fit the frame's height", () => {
    // At size 10 this takes three lines of 20, past the frame's 40.
    const layout = layoutCertificateBody(
      [
        { text: "aaaa bbbb cccc ", weight: "regular" },
        { text: "ddddd eeeee", weight: "bold" },
        { text: " ffff", weight: "regular" },
      ],
      frame,
      measure,
    );

    expect(layout.fontSize).toBeLessThan(10);
    expect(layout.lines.length * layout.lineHeight).toBeLessThanOrEqual(40);
    expect(layout.lines.at(-1)!.top + layout.lineHeight).toBeLessThanOrEqual(
      240,
    );
  });

  it("shrinks a single word wider than the frame until it fits", () => {
    const layout = layoutCertificateBody(
      [{ text: "x".repeat(30), weight: "bold" }],
      frame,
      measure,
    );

    // 30 bold characters fit 100 at size 3.
    expect(layout.fontSize).toBeLessThanOrEqual(10 / 3);
    expect(lineTexts(layout)).toEqual(["x".repeat(30)]);
    expect(layout.lines[0].pieces[0].x).toBeGreaterThanOrEqual(100);
  });
});

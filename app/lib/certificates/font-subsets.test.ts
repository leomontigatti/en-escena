import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

import { readFontSubsets, splitByFontSubset } from "./font-subsets";

const require = createRequire(import.meta.url);
const subsets = readFontSubsets(
  require("@fontsource/montserrat/unicode.json") as Record<string, string>,
);

describe("splitByFontSubset", () => {
  it("keeps Spanish text on the latin subset in one piece", () => {
    expect(splitByFontSubset("María Núñez “Río”", subsets)).toEqual([
      { subset: "latin", text: "María Núñez “Río”" },
    ]);
  });

  it("draws a letter latin lacks from the subset that has it", () => {
    expect(splitByFontSubset("Dvořák Łukasz", subsets)).toEqual([
      { subset: "latin", text: "Dvo" },
      { subset: "latin-ext", text: "ř" },
      { subset: "latin", text: "ák " },
      { subset: "latin-ext", text: "Ł" },
      { subset: "latin", text: "ukasz" },
    ]);
  });

  it("composes a decomposed accent with its letter", () => {
    expect(splitByFontSubset("Jose\u0301", subsets)).toEqual([
      { subset: "latin", text: "José" },
    ]);
  });

  it("keeps a mark with no composed form on its letter's piece", () => {
    // x with an acute has no precomposed character: the mark stays with it.
    expect(splitByFontSubset("x\u0301y", subsets)).toEqual([
      { subset: "latin", text: "x\u0301y" },
    ]);
  });

  it("reaches the Cyrillic subset too", () => {
    expect(splitByFontSubset("Иван", subsets)).toEqual([
      { subset: "cyrillic", text: "Иван" },
    ]);
  });
});

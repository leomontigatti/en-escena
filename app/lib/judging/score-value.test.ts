import { describe, expect, test } from "vitest";

import {
  formatScoreFieldValue,
  parseScoreValue,
  scoreValueMessage,
  singleScoreMaximum,
} from "./score-value";

describe("a score value", () => {
  test("reads a whole number and a half step within range", () => {
    expect(parseScoreValue("0")).toBe(0);
    expect(parseScoreValue("90.5")).toBe(90.5);
    expect(parseScoreValue(String(singleScoreMaximum))).toBe(100);
  });

  test("refuses what is not a half step", () => {
    expect(parseScoreValue("90.2")).toBeNull();
    expect(parseScoreValue("90.55")).toBeNull();
  });

  test("refuses what is outside the range", () => {
    expect(parseScoreValue("-1")).toBeNull();
    expect(parseScoreValue("100.5")).toBeNull();
    expect(parseScoreValue("20.5", 20)).toBeNull();
  });

  test("refuses what is not a number at all", () => {
    expect(parseScoreValue("")).toBeNull();
    expect(parseScoreValue("   ")).toBeNull();
    expect(parseScoreValue("ocho")).toBeNull();
    expect(parseScoreValue("8,5")).toBeNull();
  });

  test("names its own maximum in the message", () => {
    expect(scoreValueMessage()).toBe(
      "Ingresá un valor de 0 a 100, de 0.5 en 0.5.",
    );
    expect(scoreValueMessage(20)).toBe(
      "Ingresá un valor de 0 a 20, de 0.5 en 0.5.",
    );
  });
});

describe("the score a field shows back", () => {
  test("drops the decimal the column keeps and nobody typed", () => {
    expect(formatScoreFieldValue("90.0")).toBe("90");
    expect(formatScoreFieldValue("90.5")).toBe("90.5");
    expect(formatScoreFieldValue("0.0")).toBe("0");
  });

  test("leaves a field with nothing stored behind it empty", () => {
    expect(formatScoreFieldValue(null)).toBe("");
    expect(formatScoreFieldValue(undefined)).toBe("");
    expect(formatScoreFieldValue("")).toBe("");
  });
});

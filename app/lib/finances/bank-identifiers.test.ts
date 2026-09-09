import { describe, expect, test } from "vitest";

import {
  validateAlias,
  validateCbu,
  validateCuit,
} from "@/lib/finances/bank-identifiers";

// The BCRA worked example pins the algorithm; the other two are the fixtures
// the rest of the feature's tests reuse.
const BCRA_EXAMPLE_CBU = "0110138202011100377664";
const VALID_CBU = "0070099330004512345678";
const VALID_CVU = "0000031400010000000009";

describe("validateCbu", () => {
  test.each([
    ["the BCRA worked example", BCRA_EXAMPLE_CBU],
    ["a CBU", VALID_CBU],
    ["a CVU", VALID_CVU],
  ])("accepts %s", (_case, value) => {
    expect(validateCbu(value)).toBe("ok");
  });

  test.each([
    ["21 digits", VALID_CBU.slice(0, 21)],
    ["23 digits", `${VALID_CBU}0`],
    ["nothing but letters", "abcdefghijklmnopqrstuv"],
    ["digits with a space", `${VALID_CBU.slice(0, 21)} 8`],
  ])("refuses %s as a wrong length", (_case, value) => {
    expect(validateCbu(value)).toBe("wrong-length");
  });

  test("refuses a single altered digit in the first block", () => {
    expect(validateCbu(`1${VALID_CBU.slice(1)}`)).toBe("mistyped-digit");
  });

  test("refuses a single altered digit in the second block", () => {
    expect(validateCbu(`${VALID_CBU.slice(0, 20)}98`)).toBe("mistyped-digit");
  });
});

describe("validateAlias", () => {
  test.each([
    ["six characters", "mialia"],
    ["twenty characters", "a".repeat(20)],
    ["dots and hyphens", "mi.alias-01"],
    ["mixed case", "Mi.Alias-01"],
  ])("accepts %s", (_case, value) => {
    expect(validateAlias(value)).toBe("ok");
  });

  test.each([
    ["three characters", "abc"],
    ["twenty-one characters", "a".repeat(21)],
    ["a space", "mi alias"],
    ["an underscore", "mi_alias"],
    ["an accent", "misalías"],
  ])("refuses %s", (_case, value) => {
    expect(validateAlias(value)).toBe("invalid");
  });
});

describe("validateCuit", () => {
  test.each([
    ["eleven bare digits", "30712345671"],
    ["hyphens at 2-8-1", "30-71234567-1"],
  ])("accepts %s", (_case, value) => {
    expect(validateCuit(value)).toBe("ok");
  });

  test.each([
    ["ten digits", "3071234567"],
    ["twelve digits", "307123456712"],
    ["hyphens at 1-9-1", "3-071234567-1"],
    ["hyphens at 5-5-1", "30712-34567-1"],
    ["hyphens at 2-7-2", "30-7123456-71"],
    ["spaces as separators", "30 71234567 1"],
  ])("refuses %s as a wrong shape", (_case, value) => {
    expect(validateCuit(value)).toBe("wrong-shape");
  });

  test("refuses an altered digit", () => {
    expect(validateCuit("30712345670")).toBe("mistyped-digit");
  });

  // A remainder of 1 leaves no digit that could complete the number, so every
  // one of the ten variants is refused rather than one of them passing.
  test("refuses a number whose remainder is 1", () => {
    for (let digit = 0; digit <= 9; digit += 1) {
      expect(validateCuit(`3071234568${digit}`)).toBe("mistyped-digit");
    }
  });
});

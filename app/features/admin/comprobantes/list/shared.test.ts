import { describe, expect, test } from "vitest";

import {
  readComprobanteAnchorKindSearchValue,
  readComprobanteStatusSearchValue,
} from "./shared";

describe("the `estado` filter's URL values", () => {
  test("keep the Spanish values existing list URLs carry", () => {
    expect(readComprobanteStatusSearchValue("vigente")).toBe("valid");
    expect(readComprobanteStatusSearchValue("anulada")).toBe("annulled");
  });

  test("read an absent or unknown value, or the English status itself, as no filter", () => {
    expect(readComprobanteStatusSearchValue(null)).toBeNull();
    expect(readComprobanteStatusSearchValue("vencida")).toBeNull();
    expect(readComprobanteStatusSearchValue("valid")).toBeNull();
  });
});

describe("the `origen` filter's URL values", () => {
  test("read an absent or unknown value, or the English kind itself, as no filter", () => {
    expect(readComprobanteAnchorKindSearchValue(null)).toBeNull();
    expect(readComprobanteAnchorKindSearchValue("academia")).toBeNull();
    expect(readComprobanteAnchorKindSearchValue("seminar")).toBeNull();
  });
});

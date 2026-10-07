import { describe, expect, test } from "vitest";

import {
  comprobanteStatusSearchValues,
  readComprobanteStatusSearchValue,
} from "./shared";

describe("the `estado` filter's URL values", () => {
  test("keep the Spanish values existing list URLs carry", () => {
    expect(readComprobanteStatusSearchValue("vigente")).toBe("valid");
    expect(readComprobanteStatusSearchValue("anulada")).toBe("annulled");
  });

  test("read back every status they write", () => {
    for (const status of ["valid", "annulled"] as const) {
      expect(
        readComprobanteStatusSearchValue(comprobanteStatusSearchValues[status]),
      ).toBe(status);
    }
  });

  test("read an absent or unknown value, or the English status itself, as no filter", () => {
    expect(readComprobanteStatusSearchValue(null)).toBeNull();
    expect(readComprobanteStatusSearchValue("vencida")).toBeNull();
    expect(readComprobanteStatusSearchValue("valid")).toBeNull();
  });
});

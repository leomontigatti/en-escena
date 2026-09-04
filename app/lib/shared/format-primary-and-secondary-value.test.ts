import { describe, expect, test } from "vitest";

import { formatPrimaryAndSecondaryValue } from "./format-primary-and-secondary-value";

describe("formatPrimaryAndSecondaryValue", () => {
  test("joins both values with a middle dot", () => {
    expect(formatPrimaryAndSecondaryValue("Juvenil", "Solo")).toBe(
      "Juvenil · Solo",
    );
  });

  test("keeps the primary value alone when there is no secondary one", () => {
    expect(formatPrimaryAndSecondaryValue("Jazz", null)).toBe("Jazz");
    expect(formatPrimaryAndSecondaryValue("Jazz", "")).toBe("Jazz");
  });
});

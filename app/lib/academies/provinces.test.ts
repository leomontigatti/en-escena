import { describe, expect, test } from "vitest";

import { province } from "@/db/schema/academies";

import {
  formatProvinceLabel,
  provinceField,
  provinceOptions,
} from "./provinces";

describe("the province list", () => {
  test("offers the 24 Argentine jurisdictions and `Otro país`", () => {
    expect(provinceOptions).toHaveLength(25);
    expect(provinceOptions.at(-1)).toEqual({
      label: "Otro país",
      value: "otro_pais",
    });
  });

  test("offers exactly the values the column stores", () => {
    expect(provinceOptions.map(({ value }) => value)).toEqual(
      province.enumValues,
    );
  });

  test("refuses a typed province, even one spelled like a label", () => {
    expect(provinceField().safeParse("Córdoba").success).toBe(false);
    expect(provinceField().safeParse("").success).toBe(false);
    expect(provinceField().safeParse("cordoba").data).toBe("cordoba");
  });

  test("reads a stored province by its label, and none as none", () => {
    expect(formatProvinceLabel("tucuman")).toBe("Tucumán");
    expect(formatProvinceLabel(null)).toBeNull();
  });
});

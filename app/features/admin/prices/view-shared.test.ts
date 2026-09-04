import { describe, expect, test } from "vitest";

import {
  basePriceDeadlineLabel,
  EMPTY_SCHEDULE_VALUE,
  formatPaymentDeadlineForTable,
  priceFormSchema,
} from "./view-shared";

function buildPriceFormValues(overrides: Record<string, unknown> = {}) {
  return {
    name: "Precio solo",
    isSpecialPrice: false,
    isBasePrice: false,
    groupType: "solo",
    amount: "12000",
    paymentDeadline: "2026-05-31",
    scheduleId: EMPTY_SCHEDULE_VALUE,
    ...overrides,
  };
}

describe("priceFormSchema", () => {
  test("accepts a base price with no payment deadline", () => {
    const result = priceFormSchema.safeParse(
      buildPriceFormValues({ isBasePrice: true, paymentDeadline: "" }),
    );

    expect(result.success).toBe(true);
    expect(result.data?.paymentDeadline).toBe("");
  });

  test("still requires a payment deadline while the base price switch is off", () => {
    const result = priceFormSchema.safeParse(
      buildPriceFormValues({ paymentDeadline: "   " }),
    );

    expect(result.success).toBe(false);
    expect(
      result.error?.issues.find((issue) => issue.path[0] === "paymentDeadline")
        ?.message,
    ).toBe("Este campo es obligatorio.");
  });

  test("keeps requiring a schedule on a special base price", () => {
    const result = priceFormSchema.safeParse(
      buildPriceFormValues({
        isBasePrice: true,
        isSpecialPrice: true,
        paymentDeadline: "",
      }),
    );

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual([
      "scheduleId",
    ]);
  });
});

describe("formatPaymentDeadlineForTable", () => {
  test("reads a deadline-less price as a base price", () => {
    expect(formatPaymentDeadlineForTable(null)).toBe(basePriceDeadlineLabel);
    expect(formatPaymentDeadlineForTable("2026-05-31")).toBe(
      "31 de mayo de 2026",
    );
  });
});

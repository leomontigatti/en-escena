import { describe, expect, test } from "vitest";

import type { PriceListItem } from "@/lib/events/bases.server";

import {
  openEndedDeadlineLabel,
  EMPTY_SCHEDULE_VALUE,
  formatPaymentDeadlineForTable,
  getPriceDisplayName,
  priceFormSchema,
  type PriceFormValues,
} from "./view-shared";

function buildPriceFormValues(
  overrides: Partial<PriceFormValues> = {},
): PriceFormValues {
  return {
    name: "Precio solo",
    isSpecialPrice: false,
    groupType: "solo",
    amount: "12000",
    paymentDeadline: "2026-05-31",
    scheduleId: EMPTY_SCHEDULE_VALUE,
    ...overrides,
  };
}

describe("priceFormSchema", () => {
  test("accepts a blank payment deadline, which is what a deadline-less price is", () => {
    const result = priceFormSchema.safeParse(
      buildPriceFormValues({ paymentDeadline: "" }),
    );

    expect(result.success).toBe(true);
    expect(result.data?.paymentDeadline).toBe("");
  });

  test("keeps requiring a schedule on a special price with no deadline", () => {
    const result = priceFormSchema.safeParse(
      buildPriceFormValues({
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
  test("reads a deadline-less price as open-ended", () => {
    expect(formatPaymentDeadlineForTable(null)).toBe(openEndedDeadlineLabel);
    expect(formatPaymentDeadlineForTable("2026-05-31")).toBe(
      "31 de mayo de 2026",
    );
  });
});

function buildPriceListItem(
  overrides: Partial<PriceListItem> = {},
): PriceListItem {
  return {
    id: "price_1",
    name: "",
    eventId: "event_1",
    groupType: "solo",
    amount: 12000,
    paymentDeadline: "2026-05-31",
    scheduleId: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    schedule: null,
    ...overrides,
  };
}

describe("getPriceDisplayName", () => {
  test("names a deadline-less price by its missing deadline", () => {
    expect(
      getPriceDisplayName(buildPriceListItem({ paymentDeadline: null })),
    ).toBe("Solo - Precio base - sin fecha límite");
  });

  // Without the tail, an open-ended price and a dated one whose deadline the derived
  // name dropped would read identically wherever `getPriceDisplayName` lands —
  // the detail header, the list `aria-label` and the delete confirmation.
  test("keeps naming a dated price by its deadline", () => {
    expect(getPriceDisplayName(buildPriceListItem())).toBe(
      "Solo - Precio base - hasta 31/5/26",
    );
  });
});

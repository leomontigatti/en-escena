import { describe, expect, test } from "vitest";

import type { PriceListItem } from "@/lib/events/bases.server";

import {
  openEndedDeadlineLabel,
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
    scheduleIds: [],
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
      "scheduleIds",
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
    isSpecialPrice: false,
    scheduleIds: [],
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    isReferenced: false,
    keepsRegistrationOpen: false,
    schedules: [],
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

  test("names a special price by every schedule it covers", () => {
    expect(
      getPriceDisplayName(
        buildPriceListItem({
          isSpecialPrice: true,
          scheduleIds: ["schedule_1", "schedule_2"],
          schedules: [
            {
              id: "schedule_1",
              name: "En Escena All",
              scheduledDate: "2026-10-10",
              startTime: "12:00",
            },
            {
              id: "schedule_2",
              name: "Acrobacias Aéreas",
              scheduledDate: "2026-10-10",
              startTime: "18:00",
            },
          ],
        }),
      ),
    ).toBe("Solo - En Escena All, Acrobacias Aéreas - hasta 31/5/26");
  });
});

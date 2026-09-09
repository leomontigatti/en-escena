import { beforeEach, describe, expect, test } from "vitest";

import { onBusinessDate } from "@/lib/shared/business-time-zone.test-support";

import {
  deriveEffectivePrice,
  resolveEffectiveBasePriceRow,
  selectApplicableInscriptionPrice,
  selectApplicablePriceCandidate,
} from "./inscription-price";

type Row = {
  id: string;
  amount: number;
  groupType: string;
  paymentDeadline: string | null;
  scheduleId: string | null;
};

function row(overrides: Partial<Row> & { id: string; amount: number }): Row {
  return {
    groupType: "solo",
    paymentDeadline: null,
    scheduleId: null,
    ...overrides,
  };
}

const today = "2026-06-15";

describe("selectApplicablePriceCandidate", () => {
  test("drops a candidate whose deadline has passed and keeps one due today", () => {
    const candidates = [
      row({ id: "expired", amount: 100, paymentDeadline: "2026-06-14" }),
      row({ id: "due-today", amount: 200, paymentDeadline: today }),
    ];

    expect(selectApplicablePriceCandidate(candidates, today)?.id).toBe(
      "due-today",
    );
  });

  test("prefers the nearest deadline, then the lowest amount", () => {
    const candidates = [
      row({ id: "later", amount: 100, paymentDeadline: "2026-08-01" }),
      row({ id: "sooner-dear", amount: 300, paymentDeadline: "2026-07-01" }),
      row({ id: "sooner-cheap", amount: 200, paymentDeadline: "2026-07-01" }),
    ];

    expect(selectApplicablePriceCandidate(candidates, today)?.id).toBe(
      "sooner-cheap",
    );
  });

  test("lets a deadline-less candidate win only when nothing dated is left", () => {
    const tail = row({ id: "tail", amount: 500 });
    const dated = row({
      id: "dated",
      amount: 400,
      paymentDeadline: "2026-07-01",
    });

    expect(selectApplicablePriceCandidate([tail, dated], today)?.id).toBe(
      "dated",
    );
    expect(
      selectApplicablePriceCandidate([tail, dated], "2026-07-02")?.id,
    ).toBe("tail");
  });

  test("returns null when every candidate has expired", () => {
    expect(
      selectApplicablePriceCandidate(
        [row({ id: "expired", amount: 100, paymentDeadline: "2026-01-01" })],
        today,
      ),
    ).toBeNull();
  });

  test("selects a seminar tier list, which has no schedule or group-type axis", () => {
    // A seminar's tiers reach the owner already reduced to the amount that
    // applies to the person: nothing but id, amount and deadline.
    const tiers = [
      { id: "early", amount: 8000, paymentDeadline: "2026-06-30" },
      { id: "regular", amount: 10000, paymentDeadline: "2026-08-31" },
      { id: "door", amount: 12000, paymentDeadline: null },
    ];

    expect(selectApplicablePriceCandidate(tiers, today)?.id).toBe("early");
    expect(selectApplicablePriceCandidate(tiers, "2026-07-01")?.id).toBe(
      "regular",
    );
    expect(selectApplicablePriceCandidate(tiers, "2026-09-01")?.id).toBe(
      "door",
    );
  });
});

describe("selectApplicableInscriptionPrice", () => {
  const general = row({ id: "general", amount: 10000 });
  const specific = row({
    id: "specific",
    amount: 9000,
    scheduleId: "schedule_1",
  });
  const otherGroupType = row({
    id: "duo",
    amount: 100,
    groupType: "duo",
    scheduleId: "schedule_1",
  });
  const otherSchedule = row({
    id: "other-schedule",
    amount: 100,
    scheduleId: "schedule_2",
  });
  const priceRows = [general, specific, otherGroupType, otherSchedule];

  test("prefers the row specific to the pricing schedule and group type", () => {
    expect(
      selectApplicableInscriptionPrice({
        businessDate: today,
        key: {
          choreographyScheduleId: "schedule_1",
          groupType: "solo",
          scheduleCapacityScheduleId: null,
        },
        priceRows,
      })?.id,
    ).toBe("specific");
  });

  test("reads the schedule off the capacity before the choreography's own", () => {
    expect(
      selectApplicableInscriptionPrice({
        businessDate: today,
        key: {
          choreographyScheduleId: "schedule_2",
          groupType: "solo",
          scheduleCapacityScheduleId: "schedule_1",
        },
        priceRows,
      })?.id,
    ).toBe("specific");
  });

  test("falls through to the general row when the specific one has expired", () => {
    const expiredSpecific = { ...specific, paymentDeadline: "2026-01-01" };

    expect(
      selectApplicableInscriptionPrice({
        businessDate: today,
        key: {
          choreographyScheduleId: "schedule_1",
          groupType: "solo",
          scheduleCapacityScheduleId: null,
        },
        priceRows: [general, expiredSpecific],
      })?.id,
    ).toBe("general");
  });

  test("uses the general row alone when the choreography has no schedule", () => {
    expect(
      selectApplicableInscriptionPrice({
        businessDate: today,
        key: {
          choreographyScheduleId: null,
          groupType: "solo",
          scheduleCapacityScheduleId: null,
        },
        priceRows,
      })?.id,
    ).toBe("general");
  });

  test("returns null when neither tier has an applicable row", () => {
    expect(
      selectApplicableInscriptionPrice({
        businessDate: today,
        key: {
          choreographyScheduleId: "schedule_1",
          groupType: "trio",
          scheduleCapacityScheduleId: null,
        },
        priceRows,
      }),
    ).toBeNull();
  });
});

describe("deriveEffectivePrice", () => {
  const stored = { id: "stored", amount: 12000, paymentDeadline: null };
  const current = { id: "current", amount: 10000, paymentDeadline: null };

  test("follows the current candidate below the threshold", () => {
    expect(
      deriveEffectivePrice({
        allocatedAmount: 1000,
        current,
        requiredDepositPercentage: 30,
        stored,
      })?.id,
    ).toBe("current");
  });

  test("falls back to the stored candidate when nothing applies today", () => {
    expect(
      deriveEffectivePrice({
        allocatedAmount: 1000,
        current: null,
        requiredDepositPercentage: 30,
        stored,
      })?.id,
    ).toBe("stored");
  });

  test("fixes the stored candidate at the threshold even when a cheaper one applies", () => {
    expect(
      deriveEffectivePrice({
        allocatedAmount: 3600,
        current,
        requiredDepositPercentage: 30,
        stored,
      })?.id,
    ).toBe("stored");
  });

  test("measures the crossing against the stored candidate, never the current one", () => {
    // 3000 is exactly the current candidate's deposit and 600 short of the
    // stored one's. Were the crossing measured against the current price the
    // stored 12000 would lock here, and "has it crossed?" would depend on which
    // price was asked about.
    expect(
      deriveEffectivePrice({
        allocatedAmount: 3000,
        current,
        requiredDepositPercentage: 30,
        stored,
      })?.id,
    ).toBe("current");
  });

  test("returns null when nothing is stored and nothing applies", () => {
    expect(
      deriveEffectivePrice({
        allocatedAmount: 0,
        current: null,
        requiredDepositPercentage: 30,
        stored: null,
      }),
    ).toBeNull();
  });

  test("works over any candidate shape, as a seminar tier will be", () => {
    const tier = {
      id: "tier",
      amount: 8000,
      paymentDeadline: "2026-07-01",
      participantAmount: 8000,
      nonParticipantAmount: 9500,
    };

    expect(
      deriveEffectivePrice({
        allocatedAmount: 4000,
        current: null,
        requiredDepositPercentage: 50,
        stored: tier,
      }),
    ).toBe(tier);
  });
});

describe("resolveEffectiveBasePriceRow", () => {
  beforeEach(() => {
    onBusinessDate(today);
  });

  const expiredStored = row({
    id: "stored",
    amount: 10000,
    paymentDeadline: "2026-05-31",
  });
  const currentGeneral = row({
    id: "current",
    amount: 12000,
    paymentDeadline: "2026-06-30",
  });
  const key = {
    choreographyScheduleId: null,
    groupType: "solo",
    scheduleCapacityScheduleId: null,
  };

  test("selects the current row against today's business date and derives from it", () => {
    expect(
      resolveEffectiveBasePriceRow({
        allocatedAmount: 0,
        choreography: key,
        priceRows: [expiredStored, currentGeneral],
        requiredDepositPercentage: 30,
        selectedPriceId: "stored",
      })?.id,
    ).toBe("current");
  });

  test("keeps the stored row once its deposit is covered", () => {
    expect(
      resolveEffectiveBasePriceRow({
        allocatedAmount: 3000,
        choreography: key,
        priceRows: [expiredStored, currentGeneral],
        requiredDepositPercentage: 30,
        selectedPriceId: "stored",
      })?.id,
    ).toBe("stored");
  });

  test("returns the stored row when the choreography is unknown", () => {
    expect(
      resolveEffectiveBasePriceRow({
        allocatedAmount: 0,
        choreography: undefined,
        priceRows: [expiredStored, currentGeneral],
        requiredDepositPercentage: 30,
        selectedPriceId: "stored",
      })?.id,
    ).toBe("stored");
  });

  test("returns null when nothing is stored and nothing applies", () => {
    expect(
      resolveEffectiveBasePriceRow({
        allocatedAmount: 0,
        choreography: key,
        priceRows: [expiredStored],
        requiredDepositPercentage: 30,
        selectedPriceId: null,
      }),
    ).toBeNull();
  });
});

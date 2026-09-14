import { beforeEach, describe, expect, test } from "vitest";

import { onBusinessDate } from "@/lib/shared/business-time-zone.test-support";

import {
  deriveSeminarInscriptionThresholds,
  resolveEffectiveSeminarPriceRow,
  selectSeminarPriceCandidates,
  type SeminarPriceCandidateRow,
} from "./seminar-inscription-price";

const today = "2026-06-15";

function row(
  overrides: Partial<SeminarPriceCandidateRow> & { id: string; amount: number },
): SeminarPriceCandidateRow {
  return {
    forParticipants: true,
    kind: "regular",
    paymentDeadline: null,
    ...overrides,
  };
}

const regularParticipant = row({ id: "regular-participant", amount: 20000 });
const regularOutsider = row({
  id: "regular-outsider",
  amount: 30000,
  forParticipants: false,
});
const specialParticipant = row({
  id: "special-participant",
  amount: 40000,
  kind: "special",
});
const specialOutsider = row({
  id: "special-outsider",
  amount: 50000,
  forParticipants: false,
  kind: "special",
});

const priceRows = [
  regularParticipant,
  regularOutsider,
  specialParticipant,
  specialOutsider,
];

describe("selectSeminarPriceCandidates", () => {
  test("prices a participant of a special seminar from the special participant rows", () => {
    expect(
      selectSeminarPriceCandidates({
        forParticipants: true,
        priceRows,
        seminarKind: "special",
      }),
    ).toEqual([specialParticipant]);
  });

  test("falls back to the regular rows of the same cell when the kind has none", () => {
    expect(
      selectSeminarPriceCandidates({
        forParticipants: true,
        priceRows: [regularParticipant, regularOutsider, specialOutsider],
        seminarKind: "special",
      }),
    ).toEqual([regularParticipant]);
  });

  test("never offers a row of the other participant cell", () => {
    expect(
      selectSeminarPriceCandidates({
        forParticipants: true,
        priceRows: [regularOutsider, specialOutsider],
        seminarKind: "special",
      }),
    ).toEqual([]);
  });

  test("prices a non-participant from the rows of their own cell", () => {
    expect(
      selectSeminarPriceCandidates({
        forParticipants: false,
        priceRows,
        seminarKind: "regular",
      }),
    ).toEqual([regularOutsider]);
  });
});

describe("resolveEffectiveSeminarPriceRow", () => {
  beforeEach(() => {
    onBusinessDate(today);
  });

  const dated = row({
    id: "dated",
    amount: 15000,
    paymentDeadline: "2026-07-01",
  });

  test("follows the business date while the stored row's deposit is uncrossed", () => {
    expect(
      resolveEffectiveSeminarPriceRow({
        allocatedAmount: 0,
        forParticipants: true,
        priceRows: [regularParticipant, dated],
        requiredDepositPercentage: 50,
        seminarKind: "regular",
        selectedPriceId: regularParticipant.id,
      })?.id,
    ).toBe(dated.id);
  });

  test("freezes on the stored row once its own deposit is covered", () => {
    // 10000 is half of the stored row's 20000 and well past the dated row's
    // deposit: the crossing is tested against what is stored, not against the
    // row that applies today.
    expect(
      resolveEffectiveSeminarPriceRow({
        allocatedAmount: 10000,
        forParticipants: true,
        priceRows: [regularParticipant, dated],
        requiredDepositPercentage: 50,
        seminarKind: "regular",
        selectedPriceId: regularParticipant.id,
      })?.id,
    ).toBe(regularParticipant.id);
  });

  test("keeps a covered row of the other cell when the person's participation flips", () => {
    expect(
      resolveEffectiveSeminarPriceRow({
        allocatedAmount: 10000,
        forParticipants: false,
        priceRows,
        requiredDepositPercentage: 50,
        seminarKind: "regular",
        selectedPriceId: regularParticipant.id,
      })?.id,
    ).toBe(regularParticipant.id);
  });

  test("reads as having no price when nothing applies and nothing is stored", () => {
    expect(
      resolveEffectiveSeminarPriceRow({
        allocatedAmount: 0,
        forParticipants: true,
        priceRows: [regularOutsider],
        requiredDepositPercentage: 50,
        seminarKind: "regular",
        selectedPriceId: null,
      }),
    ).toBeNull();
  });
});

describe("deriveSeminarInscriptionThresholds", () => {
  test("takes the deposit from the seminar's own rate and the total undiscounted", () => {
    expect(
      deriveSeminarInscriptionThresholds({
        priceAmount: 20000,
        requiredDepositPercentage: 50,
      }),
    ).toEqual({ depositAmount: 10000, totalAmount: 20000 });
    expect(
      deriveSeminarInscriptionThresholds({
        priceAmount: 20000,
        requiredDepositPercentage: 30,
      }),
    ).toEqual({ depositAmount: 6000, totalAmount: 20000 });
  });

  test("leaves both thresholds null when no row prices the inscription", () => {
    expect(
      deriveSeminarInscriptionThresholds({
        priceAmount: null,
        requiredDepositPercentage: 50,
      }),
    ).toEqual({ depositAmount: null, totalAmount: null });
  });
});

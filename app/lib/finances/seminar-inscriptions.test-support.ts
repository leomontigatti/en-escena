import type { SeminarInscriptionFinanceDetailRow } from "@/lib/finances/seminar-inscriptions.server";

/**
 * One seminar inscription row as the readers hand it to a view: one person of
 * `academy_1` in `seminar_1`, with the deposit covered and half the total
 * owed. Every financial view of seminar inscriptions renders this
 * shape, so its fixture lives once.
 */
export function seminarInscriptionFinanceRowFixture(
  overrides: Partial<SeminarInscriptionFinanceDetailRow> = {},
): SeminarInscriptionFinanceDetailRow {
  return {
    academyId: "academy_1",
    academyName: "Academia Centro",
    allocatedAmount: 5000,
    anomalies: [],
    dancerDiscountAmount: 0,
    depositAmount: 5000,
    effectivePrice: {
      amount: 10000,
      depositAmount: 5000,
      id: "seminar_price_1",
      name: "Participante general",
    },
    financialStatus: "depositMet",
    firstName: "Ana",
    inscriptionId: "seminar_inscription_1",
    instructorName: "Abril Sosa",
    lastName: "López",
    overAllocatedAmount: 0,
    owedBalanceAmount: 5000,
    owedDepositAmount: 0,
    scheduledDate: "2026-10-10",
    seminarId: "seminar_1",
    totalAmount: 10000,
    withdrawn: false,
    ...overrides,
  };
}

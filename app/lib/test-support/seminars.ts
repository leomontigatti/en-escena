import { DEFAULT_SEMINAR_DEPOSIT_PERCENTAGE } from "@/lib/seminars/deposit-percentage";
import { defaultSeminarKind } from "@/lib/seminars/seminar-kinds";

/**
 * The two facts every seminar carries beyond its instructor, moment and quota.
 * Fixtures that are not about the kind or the deposit rate spread this instead
 * of restating both, so a third fact is added in one place.
 */
export const defaultSeminarFacts = {
  kind: defaultSeminarKind,
  requiredDepositPercentage: DEFAULT_SEMINAR_DEPOSIT_PERCENTAGE,
};

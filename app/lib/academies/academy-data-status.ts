import type { Province } from "@/lib/academies/provinces";

/**
 * Whether an academy's own data is complete: `Incompleta` while it lacks a
 * province or a city, which academies registered before those fields existed
 * do, `Completa` otherwise. Derived on read and never stored; this module is
 * the one owner of the rule.
 */

export type AcademyDataStatus = "complete" | "incomplete";

export const academyDataStatusLabels = {
  complete: "Completa",
  incomplete: "Incompleta",
} as const satisfies Record<AcademyDataStatus, string>;

export const academyDataStatusBadgeVariants = {
  complete: "success",
  incomplete: "warning",
} as const satisfies Record<AcademyDataStatus, string>;

export function getAcademyDataStatus(academy: {
  city: string | null;
  province: Province | null;
}): AcademyDataStatus {
  return academy.province !== null && academy.city?.trim()
    ? "complete"
    : "incomplete";
}

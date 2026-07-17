import type { ChoreographyFinancialState } from "@/lib/finances/operational-summary";

const choreographyFinancialStateLabels = {
  impaga: "Impaga",
  señada: "Señada",
  pagada: "Pagada",
} as const satisfies Record<ChoreographyFinancialState, string>;

const choreographyFinancialStateBadgeVariants = {
  impaga: "warning",
  señada: "info",
  pagada: "success",
} as const satisfies Record<ChoreographyFinancialState, string>;

export const choreographyFinancialStateOptions = [
  { label: "Impaga", value: "impaga" },
  { label: "Señada", value: "señada" },
  { label: "Pagada", value: "pagada" },
] as const satisfies ReadonlyArray<{
  label: string;
  value: ChoreographyFinancialState;
}>;

export function formatChoreographyFinancialState(
  value: ChoreographyFinancialState,
) {
  return choreographyFinancialStateLabels[value];
}

export function getChoreographyFinancialStateBadgeVariant(
  value: ChoreographyFinancialState,
) {
  return choreographyFinancialStateBadgeVariants[value];
}

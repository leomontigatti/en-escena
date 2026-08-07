import type {
  InscriptionAnomaly,
  InscriptionFinancialStatus,
} from "@/lib/finances/inscription-financial-status";

const inscriptionFinancialStatusLabels = {
  depositPending: "Seña pendiente",
  depositMet: "Señada",
  paidInFull: "Pagada",
} as const satisfies Record<InscriptionFinancialStatus, string>;

const inscriptionFinancialStatusBadgeVariants = {
  depositPending: "warning",
  depositMet: "info",
  paidInFull: "success",
} as const satisfies Record<InscriptionFinancialStatus, string>;

const inscriptionAnomalyLabels = {
  overAllocated: "Sobreasignada",
} as const satisfies Record<InscriptionAnomaly, string>;

/**
 * `Sobreasignada` es `destructive`, no ámbar: al lado de `Seña pendiente` dos
 * badges ámbar se leerían como un mismo tipo de hecho.
 */
const inscriptionAnomalyBadgeVariants = {
  overAllocated: "destructive",
} as const satisfies Record<InscriptionAnomaly, string>;

export const inscriptionFinancialStatusOptions = [
  { label: "Seña pendiente", value: "depositPending" },
  { label: "Señada", value: "depositMet" },
  { label: "Pagada", value: "paidInFull" },
] as const satisfies ReadonlyArray<{
  label: string;
  value: InscriptionFinancialStatus;
}>;

export function formatInscriptionFinancialStatus(
  value: InscriptionFinancialStatus,
) {
  return inscriptionFinancialStatusLabels[value];
}

export function getInscriptionFinancialStatusBadgeVariant(
  value: InscriptionFinancialStatus,
) {
  return inscriptionFinancialStatusBadgeVariants[value];
}

export function formatInscriptionAnomaly(value: InscriptionAnomaly) {
  return inscriptionAnomalyLabels[value];
}

export function getInscriptionAnomalyBadgeVariant(value: InscriptionAnomaly) {
  return inscriptionAnomalyBadgeVariants[value];
}

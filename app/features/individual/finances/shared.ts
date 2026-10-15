import { INDIVIDUAL_AREA_PATH } from "@/lib/auth/user-role.shared";

/**
 * `Finanzas` in the individual's area (ADR-0019): the same read-only summary
 * an academy reads in the portal, over the individual's own owner row — its
 * seminar inscriptions with their status, its payments, its `Saldo
 * disponible` and its comprobantes. Administration records and allocates the
 * money; the individual only reads it.
 */
export const individualFinancesPath = `${INDIVIDUAL_AREA_PATH}/finanzas`;

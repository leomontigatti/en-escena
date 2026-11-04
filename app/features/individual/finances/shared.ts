import { INDIVIDUAL_AREA_PATH } from "@/lib/auth/user-role.shared";

/**
 * `Finanzas › Seminarios` in the individual's area (ADR-0019): the same
 * read-only summary an academy reads in the portal, over the individual's own
 * owner row — its seminar inscriptions with their status and its `Saldo
 * disponible`. Administration records and allocates the money; the individual
 * only reads it. Its payments are on `Movimientos`.
 */
export const individualFinancesPath = `${INDIVIDUAL_AREA_PATH}/finanzas`;

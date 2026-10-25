import { INDIVIDUAL_AREA_PATH } from "@/lib/auth/user-role.shared";

/**
 * `Movimientos` in the individual's area (ADR-0019): the payments administration
 * recorded against the individual's owner row in the active event, under the
 * event's `Instrucciones de pago`, as an academy reads them on the portal's
 * `Movimientos`.
 */
export const individualMovementsPath = `${INDIVIDUAL_AREA_PATH}/movimientos`;

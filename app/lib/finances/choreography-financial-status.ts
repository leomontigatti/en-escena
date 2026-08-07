import type {
  InscriptionAnomaly,
  InscriptionFinancialStatus,
  InscriptionStatusBadge,
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

/**
 * `Retirada` es un eje derivado aparte —como `Facturada`—, no un cuarto valor del
 * enum de estado, así que tiene su propia etiqueta y su propia variante. Neutra
 * a propósito: una inscripción retirada no pide que nadie haga nada, sólo dice
 * que la plata que tiene encima quedó retenida.
 */
const withdrawnInscriptionLabel = "Retirada";
const withdrawnInscriptionBadgeVariant = "secondary";

/**
 * El único traductor del badge de la columna `Estado`: la precedencia entre ejes
 * la decide `resolveInscriptionStatusBadge`, y acá se le pone etiqueta, variante
 * y la clave con la que filtra. `value` es la misma cadena para las tres formas
 * porque los tres espacios de valores son disjuntos, y es lo que hace que el
 * filtro de la columna no pueda divergir de lo que la celda muestra.
 */
type FormattedInscriptionStatusBadge = {
  kind: InscriptionStatusBadge["kind"];
  label: string;
  value: string;
  variant:
    | (typeof inscriptionFinancialStatusBadgeVariants)[InscriptionFinancialStatus]
    | (typeof inscriptionAnomalyBadgeVariants)[InscriptionAnomaly]
    | typeof withdrawnInscriptionBadgeVariant;
};

export function formatInscriptionStatusBadge(
  badge: InscriptionStatusBadge,
): FormattedInscriptionStatusBadge {
  if (badge.kind === "withdrawn") {
    return {
      kind: badge.kind,
      label: withdrawnInscriptionLabel,
      value: "withdrawn",
      variant: withdrawnInscriptionBadgeVariant,
    };
  }

  if (badge.kind === "anomaly") {
    return {
      kind: badge.kind,
      label: inscriptionAnomalyLabels[badge.anomaly],
      value: badge.anomaly,
      variant: inscriptionAnomalyBadgeVariants[badge.anomaly],
    };
  }

  return {
    kind: badge.kind,
    label: inscriptionFinancialStatusLabels[badge.status],
    value: badge.status,
    variant: inscriptionFinancialStatusBadgeVariants[badge.status],
  };
}

/**
 * Las opciones del filtro `Estado` de la lista financiera: exactamente los badges
 * que esa columna puede mostrar. Filtrar por lo que se ve es la única lectura
 * posible de un filtro sobre una columna, y una fila badgeada `Sobreasignada` que
 * apareciera bajo `Señada` sería una contradicción en pantalla.
 *
 * `Retirada` no está: una coreografía no se retira —se retiran inscripciones—, y
 * ofrecer una opción que nunca puede coincidir es ofrecer una lista vacía.
 */
export const choreographyStatusFilterOptions = [
  ...inscriptionFinancialStatusOptions,
  { label: inscriptionAnomalyLabels.overAllocated, value: "overAllocated" },
] as const satisfies ReadonlyArray<{ label: string; value: string }>;

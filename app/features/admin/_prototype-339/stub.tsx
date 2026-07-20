/**
 * PROTOTIPO #339 — datos y helpers stub (throwaway).
 *
 * El backend de comprobantes ARCA todavía NO existe (el mapa #320 es plan-not-do:
 * #326/#328 sólo diseñaron el modelo). Este módulo simula el modelo del
 * comprobante derivado para poder reaccionar a la UI. Nada de esto persiste ni
 * habla con ARCA. Borrar junto con el resto del prototipo.
 */

import { Badge } from "@/components/ui/badge";
import { formatAmount } from "@/features/admin/academies/account-current/formatters";

// --- Modelo stub (espejo de #326/#328) -------------------------------------

export type PortionKey = "seña" | "saldo" | "total";
export type ComprobanteEstado = "vigente" | "anulada";
export type TipoComprobante = "factura" | "nota-credito"; // WSFEv1 11 | 13

/**
 * Estado único de display para la lista: colapsa `estado` + `desactualizada` en
 * un solo eje de tres valores (una NC nunca queda desactualizada).
 */
export type DisplayEstado = "vigente" | "desactualizada" | "anulada";

export type StubComprobante = {
  id: string;
  tipoComprobante: TipoComprobante;
  cbteTipoCodigo: 11 | 13;
  porcion: PortionKey;
  choreographyName: string;
  academyName: string;
  ptoVta: number; // 5 dígitos
  cbteNro: number; // 8 dígitos
  cae: string; // 14 dígitos
  caeVto: string; // ISO date
  fechaEmision: string; // ISO date
  impTotalSnapshot: number; // congelado al emitir
  estado: ComprobanteEstado; // derivado (vigente / anulada por NC)
  relacionadoId?: string; // NC → factura, factura → NC
};

/** Facturación de una porción (seña/saldo): sin facturar, o con comprobante. */
export type PortionBilling = {
  comprobante: StubComprobante | null;
  estadoDisplay: DisplayEstado | null; // null ⟺ sin facturar
};

export const SIN_FACTURAR: PortionBilling = {
  comprobante: null,
  estadoDisplay: null,
};

/**
 * Estado del detalle de UNA coreografía en los dos ejes del negocio: pago
 * (seña → saldo, secuencial) y facturación (seña → saldo, secuencial).
 */
export type DetailState = {
  señaPagada: boolean;
  saldoPagado: boolean;
  seña: PortionBilling;
  saldo: PortionBilling;
};

export type DetailAction =
  | "pagar-seña"
  | "pagar-saldo"
  | "facturar-seña"
  | "facturar-saldo";

/** Una porción cuenta como facturada "activa" si bloquea re-facturar (no anulada). */
export function esFacturadaActiva(b: PortionBilling): boolean {
  return b.estadoDisplay === "vigente" || b.estadoDisplay === "desactualizada";
}

/**
 * Acciones del menú del header, derivadas del estado (reglas secuenciales:
 * pago seña→saldo, facturación seña→saldo, y solo se factura lo ya pagado).
 */
export function availableActions(s: DetailState): DetailAction[] {
  const actions: DetailAction[] = [];
  if (!s.señaPagada) actions.push("pagar-seña");
  else if (!s.saldoPagado) actions.push("pagar-saldo");
  if (s.señaPagada && !esFacturadaActiva(s.seña)) actions.push("facturar-seña");
  if (
    s.saldoPagado &&
    esFacturadaActiva(s.seña) &&
    !esFacturadaActiva(s.saldo)
  ) {
    actions.push("facturar-saldo");
  }
  return actions;
}

export type ScenarioKey =
  | "impaga"
  | "señada"
  | "pagada"
  | "desactualizada"
  | "anulada";

export const scenarioOptions: { key: ScenarioKey; label: string }[] = [
  { key: "impaga", label: "Impaga" },
  { key: "señada", label: "Señada" },
  { key: "pagada", label: "Pagada" },
  { key: "desactualizada", label: "Seña desactualizada" },
  { key: "anulada", label: "Seña anulada" },
];

// Montos derivados de referencia para la coreografía del detalle.
const DERIVADO: Record<PortionKey, number> = {
  seña: 42000,
  saldo: 98000,
  total: 140000,
};

/** Monto derivado fijo por porción (el valor de la MetricCard no depende del estado). */
export const derivedMonto: Record<PortionKey, number> = DERIVADO;

const CHOREO = "Fuego — Jazz Juvenil";
const ACADEMY = "Estudio Danza Norte";

function comprobante(
  over: Partial<StubComprobante> & Pick<StubComprobante, "porcion">,
): StubComprobante {
  return {
    id: crypto.randomUUID(),
    tipoComprobante: "factura",
    cbteTipoCodigo: 11,
    choreographyName: CHOREO,
    academyName: ACADEMY,
    ptoVta: 5,
    cbteNro: 128,
    cae: "75123456789012",
    caeVto: "2026-08-05",
    fechaEmision: "2026-07-15",
    impTotalSnapshot: DERIVADO[over.porcion],
    estado: "vigente",
    ...over,
  };
}

/** Crea una factura C vigente para una porción (al facturar en el prototipo). */
export function buildFactura(
  porcion: PortionKey,
  cbteNro: number,
): StubComprobante {
  return comprobante({ porcion, cbteNro });
}

/** Semilla del detalle de UNA coreografía según el escenario. */
export function seedDetail(scenario: ScenarioKey): DetailState {
  const base = {
    señaPagada: false,
    saldoPagado: false,
    seña: { ...SIN_FACTURAR },
    saldo: { ...SIN_FACTURAR },
  };

  if (scenario === "impaga") return base;
  if (scenario === "señada") return { ...base, señaPagada: true };
  if (scenario === "pagada") {
    return { ...base, señaPagada: true, saldoPagado: true };
  }

  if (scenario === "desactualizada") {
    // Facturó 42000, pero el roster cambió y el importe derivado hoy es otro.
    const c = comprobante({ porcion: "seña", cbteNro: 128 });
    return {
      señaPagada: true,
      saldoPagado: true,
      seña: { comprobante: c, estadoDisplay: "desactualizada" },
      saldo: { ...SIN_FACTURAR },
    };
  }

  // anulada: la factura de la seña fue anulada con NC (liberada → re-facturable).
  const c = comprobante({ porcion: "seña", cbteNro: 128, estado: "anulada" });
  return {
    señaPagada: true,
    saldoPagado: true,
    seña: { comprobante: c, estadoDisplay: "anulada" },
    saldo: { ...SIN_FACTURAR },
  };
}

/** Comprobantes de la lista global (varias academias/coreografías). */
export function buildComprobanteList(): (StubComprobante & {
  desactualizada?: boolean;
})[] {
  return [
    {
      ...comprobante({ porcion: "seña" }),
      academyName: "Estudio Danza Norte",
      choreographyName: "Fuego — Jazz Juvenil",
      cbteNro: 128,
      fechaEmision: "2026-07-15",
      desactualizada: true,
    },
    {
      ...comprobante({ porcion: "total" }),
      academyName: "Ballet del Sur",
      choreographyName: "Cisnes — Clásico",
      cbteNro: 127,
      impTotalSnapshot: 210000,
      fechaEmision: "2026-07-14",
    },
    {
      ...comprobante({ porcion: "saldo" }),
      academyName: "Academia Ritmo",
      choreographyName: "Urban Crew — Hip Hop",
      cbteNro: 126,
      impTotalSnapshot: 88000,
      fechaEmision: "2026-07-12",
    },
    {
      ...comprobante({ porcion: "seña", estado: "anulada" }),
      academyName: "Estudio Danza Norte",
      choreographyName: "Luna — Contemporáneo",
      cbteNro: 125,
      impTotalSnapshot: 36000,
      fechaEmision: "2026-07-10",
    },
    {
      ...comprobante({
        porcion: "seña",
        tipoComprobante: "nota-credito",
        cbteTipoCodigo: 13,
        cbteNro: 3,
        fechaEmision: "2026-07-11",
      }),
      academyName: "Estudio Danza Norte",
      choreographyName: "Luna — Contemporáneo",
      impTotalSnapshot: 36000,
    },
    {
      ...comprobante({ porcion: "total" }),
      academyName: "Ballet del Sur",
      choreographyName: "Coppélia — Clásico",
      cbteNro: 124,
      impTotalSnapshot: 175000,
      fechaEmision: "2026-07-08",
    },
  ];
}

// --- Helpers de formato -----------------------------------------------------

/** Numeración legal PtoVta-CbteNro = 5 + 8 dígitos (research #334). */
export function formatComprobanteNumero(ptoVta: number, cbteNro: number) {
  return `${String(ptoVta).padStart(5, "0")}-${String(cbteNro).padStart(8, "0")}`;
}

export function tipoComprobanteLabel(t: TipoComprobante) {
  return t === "factura" ? "Factura C" : "Nota de crédito C";
}

export function porcionLabel(p: PortionKey) {
  return p === "seña" ? "Seña" : p === "saldo" ? "Saldo" : "Total";
}

/** Colapsa estado + desactualizada en un único estado de display. */
export function deriveDisplayEstado(c: {
  estado: ComprobanteEstado;
  desactualizada?: boolean;
  tipoComprobante: TipoComprobante;
}): DisplayEstado {
  if (c.estado === "anulada") return "anulada";
  if (c.tipoComprobante === "factura" && c.desactualizada) {
    return "desactualizada";
  }
  return "vigente";
}

// Opciones de filtro facetado (el `value` debe coincidir con el valor crudo de
// la fila; el matching es por igualdad normalizada).
export const estadoFilterOptions = [
  { label: "Vigente", value: "vigente" },
  { label: "Desactualizada", value: "desactualizada" },
  { label: "Anulada", value: "anulada" },
] as const;

export const tipoFilterOptions = [
  { label: "Factura", value: "factura" },
  { label: "Nota de crédito", value: "nota-credito" },
] as const;

export const porcionFilterOptions = [
  { label: "Seña", value: "seña" },
  { label: "Saldo", value: "saldo" },
  { label: "Total", value: "total" },
] as const;

const dateFmt = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});
export function formatComprobanteDate(iso: string) {
  return dateFmt.format(new Date(`${iso}T00:00:00Z`));
}

export { formatAmount };

// --- Badges compartidos -----------------------------------------------------

export function EstadoBadge({ estado }: { estado: ComprobanteEstado }) {
  return estado === "vigente" ? (
    <Badge variant="success">Vigente</Badge>
  ) : (
    <Badge variant="secondary">Anulada</Badge>
  );
}

/** Badge único para la columna Estado de la lista (tres estados de display). */
export function DisplayEstadoBadge({ estado }: { estado: DisplayEstado }) {
  if (estado === "anulada") return <Badge variant="secondary">Anulada</Badge>;
  if (estado === "desactualizada") {
    return <Badge variant="warning">Desactualizada</Badge>;
  }
  return <Badge variant="success">Vigente</Badge>;
}

export function TipoBadge({
  tipo,
  short = false,
}: {
  tipo: TipoComprobante;
  short?: boolean;
}) {
  return tipo === "factura" ? (
    <Badge variant="info">{short ? "FC" : "Factura C"}</Badge>
  ) : (
    <Badge variant="warning">{short ? "NC" : "Nota de crédito C"}</Badge>
  );
}

export function DesactualizadaBadge() {
  return <Badge variant="warning">Desactualizada</Badge>;
}

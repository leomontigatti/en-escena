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

/**
 * Estado de cada porción {seña, saldo, total} en una coreografía, tal como lo
 * derivaría el backend a partir de los comprobantes vigentes + la matriz
 * anti-doble-cobro (#323).
 */
export type PortionState =
  | { key: PortionKey; kind: "facturable"; montoDerivado: number }
  | { key: PortionKey; kind: "bloqueada"; motivo: string }
  | { key: PortionKey; kind: "no-uniforme"; motivo: string }
  | {
      key: PortionKey;
      kind: "facturada";
      comprobante: StubComprobante;
      montoDerivado: number;
      desactualizada: boolean; // snapshot impTotal ≠ monto derivado (roster cambió)
    };

export type ScenarioKey = "limpio" | "mix" | "total" | "anulada";

export const scenarioOptions: { key: ScenarioKey; label: string }[] = [
  { key: "mix", label: "Seña facturada + desactualizada" },
  { key: "limpio", label: "Sin facturar" },
  { key: "total", label: "Total facturado" },
  { key: "anulada", label: "Anulada por NC (liberada)" },
];

// Montos derivados de referencia para la coreografía del detalle.
const DERIVADO: Record<PortionKey, number> = {
  seña: 42000,
  saldo: 98000,
  total: 140000,
};

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

/** Escenario del detalle de UNA coreografía. */
export function buildDetailScenario(scenario: ScenarioKey): {
  comprobantes: StubComprobante[];
  portions: PortionState[];
} {
  if (scenario === "limpio") {
    return {
      comprobantes: [],
      portions: (["seña", "saldo", "total"] as PortionKey[]).map((key) => ({
        key,
        kind: "facturable",
        montoDerivado: DERIVADO[key],
      })),
    };
  }

  if (scenario === "total") {
    const c = comprobante({ porcion: "total" });
    return {
      comprobantes: [c],
      portions: [
        {
          key: "seña",
          kind: "bloqueada",
          motivo: "El total ya tiene comprobante vigente.",
        },
        {
          key: "saldo",
          kind: "bloqueada",
          motivo: "El total ya tiene comprobante vigente.",
        },
        {
          key: "total",
          kind: "facturada",
          comprobante: c,
          montoDerivado: DERIVADO.total,
          desactualizada: false,
        },
      ],
    };
  }

  if (scenario === "anulada") {
    const factura = comprobante({
      porcion: "seña",
      estado: "anulada",
      cbteNro: 128,
    });
    const nc = comprobante({
      porcion: "seña",
      tipoComprobante: "nota-credito",
      cbteTipoCodigo: 13,
      cbteNro: 3,
      cae: "75987654321098",
      fechaEmision: "2026-07-16",
      relacionadoId: factura.id,
    });
    factura.relacionadoId = nc.id;
    return {
      comprobantes: [factura, nc],
      // Anular liberó la porción: vuelve a ser facturable, y con nada vigente el total también.
      portions: (["seña", "saldo", "total"] as PortionKey[]).map((key) => ({
        key,
        kind: "facturable",
        montoDerivado: DERIVADO[key],
      })),
    };
  }

  // mix (default): seña facturada + desactualizada, saldo facturable, total bloqueado.
  const c = comprobante({ porcion: "seña", impTotalSnapshot: 42000 });
  return {
    comprobantes: [c],
    portions: [
      {
        key: "seña",
        kind: "facturada",
        comprobante: c,
        montoDerivado: 49000,
        desactualizada: true,
      },
      { key: "saldo", kind: "facturable", montoDerivado: DERIVADO.saldo },
      {
        key: "total",
        kind: "bloqueada",
        motivo: "La seña ya tiene comprobante vigente.",
      },
    ],
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

export function TipoBadge({ tipo }: { tipo: TipoComprobante }) {
  return tipo === "factura" ? (
    <Badge variant="info">Factura C</Badge>
  ) : (
    <Badge variant="warning">Nota de crédito C</Badge>
  );
}

export function DesactualizadaBadge() {
  return <Badge variant="warning">Desactualizada</Badge>;
}

/**
 * PROTOTIPO #339 — piezas compartidas entre las variantes del detalle y los
 * diálogos de emisión/anulación. Throwaway.
 */

import type { ReactNode } from "react";

import {
  formatComprobanteDate,
  formatComprobanteNumero,
  type PortionKey,
  type PortionState,
  type StubComprobante,
} from "./stub";

export type SimResult = "exito" | "rechazo" | "timeout";

export type SharedProps = {
  portions: PortionState[];
  comprobantes: StubComprobante[];
  onEmit: (p: PortionKey) => void;
  onAnular: (id: string) => void;
};

export function PreviewRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}

export function ComprobanteMeta({ c }: { c: StubComprobante }) {
  return (
    <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
      <span className="font-mono">
        {formatComprobanteNumero(c.ptoVta, c.cbteNro)}
      </span>
      <span>
        CAE {c.cae} · vto {formatComprobanteDate(c.caeVto)}
      </span>
    </div>
  );
}

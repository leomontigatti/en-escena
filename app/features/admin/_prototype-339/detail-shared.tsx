/**
 * PROTOTIPO #339 — piezas compartidas entre las variantes del detalle y los
 * diálogos de emisión/anulación. Throwaway.
 */

import type { ReactNode } from "react";

export type SimResult = "exito" | "rechazo" | "timeout";

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

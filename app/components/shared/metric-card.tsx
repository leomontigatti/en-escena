import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type MetricCardProps = {
  // Ícono opcional: sin `icon` ni `slot` la card no muestra indicador (sólo
  // título y valor).
  icon?: LucideIcon;
  title: string;
  value: string;
  // Slot opcional (badge + botón) que REEMPLAZA al ícono cuando se provee
  // (ADR-0011). Opcional para no afectar los usos que sólo muestran el ícono.
  slot?: ReactNode;
};

export function MetricCard({
  icon: Icon,
  title,
  value,
  slot,
}: MetricCardProps) {
  const indicator =
    slot ??
    (Icon ? (
      <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
    ) : null);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {indicator}
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
      </CardContent>
    </Card>
  );
}

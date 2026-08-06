/**
 * THROWAWAY PROTOTYPE — ticket #585 of map #547. View 3 of 3.
 *
 * The emitted factura, on its own screen — the destination `Ver factura`
 * navigates to. It stands in for `/administracion/comprobantes/:id`, which today
 * shows the fiscal snapshot and **no lines at all** (`comprobantes/detail/server.ts`
 * never reads `comprobante_inscription`); #554 gives it one line per inscription
 * at the net amount, and this is that screen.
 *
 * Three decisions meet here, none of which had a surface before:
 *
 * 1. **#554: the factura lists its adjustments.** A factura badged `Ajustada`
 *    with no path to the documents that adjusted it is a dead end on the one
 *    screen where it matters. The star is anchored here and depth is permanently
 *    1 (#599), so the list is a flat read.
 * 2. **#599: status belongs to the factura and only to it** — `Vigente` until an
 *    amendment exists, `Ajustada` after. NDs and NCs carry no status of their own.
 * 3. **#600: this is an evidence-showing surface.** A withdrawn inscription the
 *    document names stays on it — filtering it would stop the detail summing to
 *    the authorised total.
 */
import { Link, useSearchParams } from "react-router";

import {
  AdminResourceFormCard,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { formatAmount } from "../formatters";
import type { InscriptionReading } from "./fixtures";
import type { ChoreographyReading } from "./rollup";
import { usePrototype } from "./store";

export function ComprobantePrototypeView() {
  const [searchParams] = useSearchParams();
  const prototype = usePrototype();

  const choreographyId = searchParams.get("coreografia") ?? "";
  const choreography = prototype.choreographies.find(
    (row) => row.id === choreographyId,
  );
  const detailHref = `/administracion/finanzas/prototipo-asignacion/coreografia?coreografia=${choreographyId}`;

  if (choreography?.comprobante == null) {
    return (
      <AdminResourceLayout
        title="Comprobante"
        description="Prototipo descartable del ticket #585."
        requireSelectedEvent={false}
      >
        <AdminResourceFormCard
          contentClassName="gap-4"
          footer={
            <Button asChild variant="outline">
              <Link to={detailHref}>Volver</Link>
            </Button>
          }
        >
          <p className="text-sm text-muted-foreground">
            Esta coreografía todavía no tiene una factura emitida.
          </p>
        </AdminResourceFormCard>
      </AdminResourceLayout>
    );
  }

  const { comprobante } = choreography;
  const isAdjusted = comprobante.amendments.length > 0;

  return (
    <AdminResourceLayout
      title={comprobante.label}
      description={`${choreography.name} · ${choreography.groupType}. Prototipo descartable del ticket #585; los datos están en memoria.`}
      requireSelectedEvent={false}
      headerAction={
        <ResourceActionsMenu contentClassName="w-56">
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              window.print();
            }}
          >
            Imprimir
          </DropdownMenuItem>
        </ResourceActionsMenu>
      }
    >
      <AdminResourceFormCard
        contentClassName="gap-4"
        footer={
          <Button asChild variant="outline">
            <Link to={detailHref}>Volver a la coreografía</Link>
          </Button>
        }
      >
        <DetailRow
          label="Estado"
          value={
            <Badge variant={isAdjusted ? "warning" : "success"}>
              {isAdjusted ? "Ajustada" : "Vigente"}
            </Badge>
          }
        />
        <DetailRow label="Fecha de emisión" value={comprobante.emittedOn} />
        <DetailRow label="Coreografía" value={choreography.name} />

        <ComprobanteLines
          choreography={choreography}
          lines={comprobante.lines}
        />

        {isAdjusted ? (
          <AmendmentList amendments={comprobante.amendments} />
        ) : null}
      </AdminResourceFormCard>
    </AdminResourceLayout>
  );
}

/**
 * One line per inscription, at the **net** amount (#554). The discount is never
 * a line item: it is already inside each figure, which is why the roster's
 * tooltip has to exist at all.
 */
function ComprobanteLines({
  choreography,
  lines,
}: {
  choreography: ChoreographyReading;
  lines: { inscriptionId: string; amount: number }[];
}) {
  const nameOf = (inscriptionId: string) =>
    choreography.inscriptions.find(
      (row: InscriptionReading) => row.id === inscriptionId,
    )?.dancerName ?? "Inscripción dada de baja";
  const total = lines.reduce((sum, line) => sum + line.amount, 0);

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">Detalle</span>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Concepto</TableHead>
            <TableHead className="text-right">Importe</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line) => (
            <TableRow key={line.inscriptionId}>
              <TableCell>Inscripción — {nameOf(line.inscriptionId)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatAmount(line.amount)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {/*
        The sum of the lines **is** the authorised total, never a re-derivation:
        each line is one inscription's rounded net amount and the total only ever
        adds them up. Re-applying the percentage to the sum is what would put the
        two a peso apart.
      */}
      <DetailRow label="Importe total" strong value={formatAmount(total)} />
    </div>
  );
}

function AmendmentList({
  amendments,
}: {
  amendments: { label: string; emittedOn: string; amount: number }[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">Ajustes</span>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Comprobante</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead className="text-right">Importe</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {amendments.map((amendment) => (
            <TableRow key={amendment.label}>
              <TableCell>{amendment.label}</TableCell>
              <TableCell>{amendment.emittedOn}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatAmount(Math.abs(amendment.amount))}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function DetailRow({
  label,
  strong = false,
  value,
}: {
  label: string;
  strong?: boolean;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span
        className={
          strong
            ? "text-sm font-medium tabular-nums"
            : "text-right text-sm tabular-nums"
        }
      >
        {value}
      </span>
    </div>
  );
}

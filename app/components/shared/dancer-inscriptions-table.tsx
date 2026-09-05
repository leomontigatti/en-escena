import { DataTableLink } from "@/components/shared/data-table-link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DancerInscription } from "@/lib/dancers/inscriptions";
import { formatEventSequenceNumber } from "@/lib/events/sequence-number";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";
import { formatPrimaryAndSecondaryValue } from "@/lib/shared/format-primary-and-secondary-value";

const moneyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

/**
 * The inscriptions a dancer holds in the active event. Administration and the
 * academy portal read the same columns; each passes the choreography detail it
 * can reach.
 */
export function DancerInscriptionsTable({
  buildChoreographyHref,
  inscriptions,
}: {
  buildChoreographyHref: (choreographyId: string) => string;
  inscriptions: DancerInscription[];
}) {
  return (
    <div className="rounded-lg border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="px-3">#</TableHead>
            <TableHead className="px-3">Coreografía</TableHead>
            <TableHead className="px-3">Categoría / Tipo de grupo</TableHead>
            <TableHead className="px-3">Precio base</TableHead>
            <TableHead className="px-3">Descuento</TableHead>
            <TableHead className="px-3">Subtotal estimado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {inscriptions.map((inscription) => (
            <TableRow key={inscription.id}>
              <TableCell className="px-3 font-medium tabular-nums">
                <DataTableLink to={buildChoreographyHref(inscription.id)}>
                  {formatEventSequenceNumber(inscription.choreographyNumber)}
                </DataTableLink>
              </TableCell>
              <TableCell className="px-3">
                {inscription.choreographyName}
              </TableCell>
              <TableCell className="px-3 text-muted-foreground">
                {formatPrimaryAndSecondaryValue(
                  inscription.categoryName ?? "Sin asignar",
                  formatGroupTypeLabel(inscription.groupType),
                )}
              </TableCell>
              <TableCell className="px-3">
                {formatMoney(inscription.basePriceAmount)}
              </TableCell>
              <TableCell className="px-3">
                {formatMoney(inscription.discountAmount)}
              </TableCell>
              <TableCell className="px-3">
                {formatMoney(inscription.estimatedSubtotalAmount)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function formatMoney(amount: number | null) {
  if (amount === null) {
    return "Sin precio";
  }

  return moneyFormatter.format(amount);
}

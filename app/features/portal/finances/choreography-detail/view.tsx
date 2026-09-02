import { AlertTriangle } from "lucide-react";

import { PortalListPage } from "@/components/portal/ui";
import { AlertStack } from "@/components/shared/alert-stack";
import {
  ClientDataTable,
  type DataTableColumn,
  type DataTableFacetedFilter,
} from "@/components/shared/data-table";
import { MetricCard } from "@/components/shared/metric-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { formatDancerName } from "@/features/admin/finances/academy-choreographies/choreography-detail/shared";
import {
  formatAmount,
  formatOperationalAmount,
} from "@/features/admin/finances/formatters";
import type { loadPortalChoreographyFinanceDetail } from "@/features/portal/finances/choreography-detail/server";
import { formatEventSequenceNumber } from "@/lib/events/sequence-number";
import {
  formatInscriptionStatusBadge,
  inscriptionStatusFilterOptions,
} from "@/lib/finances/choreography-financial-status";
import { resolveInscriptionStatusBadge } from "@/lib/finances/inscription-financial-status";

type PortalChoreographyFinanceDetailLoaderData = Awaited<
  ReturnType<typeof loadPortalChoreographyFinanceDetail>
>;

type InscriptionRow =
  PortalChoreographyFinanceDetailLoaderData["inscriptions"][number];

const inscriptionFacetedFilters: DataTableFacetedFilter[] = [
  {
    id: "estado",
    label: "Estado",
    options: [...inscriptionStatusFilterOptions],
  },
];

/**
 * The academy's financial detail is the administrator's, minus what only the
 * administrator can do: there is no `Emitir factura` here, and the dancer's name
 * is plain text because the money dialog behind it is a write.
 *
 * Everything that is a *reading* —the title, the five metrics, the alerts and
 * every column of the inscriptions table— is the same on both screens. That is
 * the point: when the academy calls asking about a figure, both parties are
 * looking at the same one.
 */
export function PortalChoreographyFinanceDetailRouteView({
  loaderData,
}: {
  loaderData: PortalChoreographyFinanceDetailLoaderData;
}) {
  const choreography = loaderData.choreography;

  return (
    <PortalListPage
      titleId="finanzas-coreografia-title"
      title={`${choreography.name} # ${formatEventSequenceNumber(
        choreography.choreographyNumber,
      )}`}
      description="Revisá los importes de esta coreografía y de cada bailarín inscripto."
    >
      <ChoreographyAlerts choreography={choreography} />

      {/* The same five metrics as the list, narrowed to this choreography: each
          threshold with its owed figure beside it. `Saldo disponible` is the
          exception and stays the academy's —unallocated money belongs to no
          choreography— and it is the pool this choreography gets paid from. */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <MetricCard
          title="Seña total"
          value={formatOperationalAmount(choreography.depositAmount)}
        />
        <MetricCard
          title="Seña adeudada"
          value={formatOperationalAmount(choreography.owedDepositAmount)}
        />
        <MetricCard
          title="Total"
          value={formatOperationalAmount(choreography.totalAmount)}
        />
        <MetricCard
          title="Saldo adeudado"
          value={formatOperationalAmount(choreography.owedBalanceAmount)}
        />
        <MetricCard
          title="Saldo disponible"
          value={formatAmount(loaderData.availableBalanceAmount)}
        />
      </section>

      <InscriptionsTable inscriptions={loaderData.inscriptions} />
    </PortalListPage>
  );
}

function ChoreographyAlerts({
  choreography,
}: {
  choreography: PortalChoreographyFinanceDetailLoaderData["choreography"];
}) {
  const missingPrice = choreography.depositAmount.status === "incomplete";
  const overAllocated = choreography.anomalies.includes("overAllocated");

  if (!missingPrice && !overAllocated) {
    return null;
  }

  return (
    <AlertStack>
      {overAllocated ? <OverAllocatedAlert /> : null}
      {missingPrice ? (
        <Alert variant="warning">
          <AlertTriangle aria-hidden="true" />
          <AlertDescription>
            Esta coreografía todavía no tiene un precio configurado: hasta que
            administración lo cargue no se puede calcular lo que adeuda.
          </AlertDescription>
        </Alert>
      ) : null}
    </AlertStack>
  );
}

/**
 * The `Sobreasignada` anomaly, as an alert and not as a badge, exactly as on the
 * administrator's detail: money in excess is something somebody has to resolve.
 *
 * What changes is who. The academy cannot move an allocation, so the alert names
 * the money and points at administración instead of sending the reader to a list
 * they cannot act on. It is self-resolving —it is derived from today's money— so
 * there is nothing to dismiss.
 */
function OverAllocatedAlert() {
  return (
    <Alert variant="destructive">
      <AlertTriangle aria-hidden="true" />
      <AlertDescription>
        Hay inscripciones con más dinero asignado que su total. Escribile a
        administración para que lo corrija.
      </AlertDescription>
    </Alert>
  );
}

function InscriptionsTable({
  inscriptions,
}: {
  inscriptions: InscriptionRow[];
}) {
  return (
    <section aria-label="Inscripciones">
      <ClientDataTable
        rows={inscriptions}
        columns={inscriptionColumns}
        facetedFilters={inscriptionFacetedFilters}
        getRowKey={(inscription) => inscription.dancerId}
        searchPlaceholder="Buscar inscripción por bailarín"
        textFilterColumnId="dancer"
        emptyMessage="No hay inscripciones para mostrar."
      />
    </section>
  );
}

const inscriptionColumns: DataTableColumn<InscriptionRow>[] = [
  {
    // Plain text and not a button: the administrator's name cell opens the money
    // dialog, which is a write the academy does not have.
    id: "dancer",
    header: "Bailarín",
    className: "font-medium",
    cell: (inscription) => formatDancerName(inscription),
    filterValue: (inscription) => formatDancerName(inscription),
    sortValue: (inscription) => formatDancerName(inscription),
  },
  {
    // The name of the price row and not its amount: the amount is already in
    // `Total`, and what could not be read anywhere was *which* of the event's
    // prices governs this inscription. It is the effective price, the same one
    // the row's figures are calculated with.
    id: "price",
    header: "Precio",
    cell: (inscription) =>
      inscription.effectivePrice === null ? (
        "Sin precio"
      ) : (
        <Badge variant="secondary">{inscription.effectivePrice.name}</Badge>
      ),
    // No `filterValue`: the price's name is not an option of the `Estado`
    // filter, and the facets gather the values of every column.
    sortValue: (inscription) => inscription.effectivePrice?.name ?? "",
  },
  {
    id: "deposit",
    header: "Seña",
    className: "text-right tabular-nums",
    headerClassName: "text-right",
    cell: (inscription) => formatInscriptionAmount(inscription.depositAmount),
  },
  {
    // Decorative and unconditional: `Total` is the context column — what the debt
    // is measured against — so the whole of it is muted. Never per row: no figure
    // is provisional, and a grey that varies goes back to meaning something.
    id: "total",
    header: "Total",
    className: "text-right tabular-nums text-muted-foreground",
    headerClassName: "text-right",
    cell: (inscription) => formatInscriptionAmount(inscription.totalAmount),
  },
  {
    // The row's only actionable figure, highlighted by column.
    id: "owedBalance",
    header: "Saldo adeudado",
    className: "text-right font-medium tabular-nums",
    headerClassName: "text-right",
    cell: (inscription) =>
      formatInscriptionAmount(inscription.owedBalanceAmount),
  },
  {
    // Last, after the money: the status is derived from the row's figures, so it
    // reads as their conclusion and not as their heading.
    id: "financialStatus",
    header: "Estado",
    cell: (inscription) => <InscriptionStatusCell inscription={inscription} />,
    // The filter comes from the same badge the cell shows and not from
    // `financialStatus`: a row badged `Retirada` that showed up when filtering
    // by `Pagada` would contradict itself on screen.
    filterValue: (inscription) => resolveStatusBadge(inscription).value,
  },
];

/**
 * The badge of the `Estado` column, resolved exactly as the administrator's:
 * `Retirada` **replaces** the status, just as an anomaly does, and it carries
 * the retained amount inside because that is half of the fact — the row is still
 * there *because* money was left on it. The money is the academy's, so the
 * academy reads the same badge.
 */
function resolveStatusBadge(inscription: InscriptionRow) {
  return formatInscriptionStatusBadge(
    resolveInscriptionStatusBadge({
      anomalies: inscription.anomalies,
      financialStatus: inscription.financialStatus,
      withdrawn: inscription.withdrawn,
    }),
  );
}

function InscriptionStatusCell({
  inscription,
}: {
  inscription: InscriptionRow;
}) {
  const badge = resolveStatusBadge(inscription);

  return (
    <Badge variant={badge.variant}>
      {badge.kind === "withdrawn"
        ? `${badge.label} · ${formatAmount(inscription.allocatedAmount)}`
        : badge.label}
    </Badge>
  );
}

function formatInscriptionAmount(amount: number | null) {
  return amount === null ? "Sin precio" : formatAmount(amount);
}

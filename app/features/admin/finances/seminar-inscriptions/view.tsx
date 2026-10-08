import { Building2, Presentation } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { AdminResourceLayout } from "@/components/admin/resource-layout";
import {
  ClientDataTable,
  type DataTableColumn,
  type DataTableFacetedFiltersOf,
} from "@/components/shared/data-table";
import type { DataTableFacetedFilterOption } from "@/components/shared/data-table.shared";
import { MetricCard } from "@/components/shared/metric-card";
import { Button } from "@/components/ui/button";
import { InscriptionMoneyDialog } from "@/features/admin/finances/inscription-money/dialog";
import { formatDate } from "@/features/admin/schedules/view-shared";
import {
  formatDancerName,
  formatOperationalAmount,
} from "@/lib/finances/formatters";
import {
  inscriptionFinanceColumns,
  inscriptionFinanceFacetedFilters,
} from "@/lib/finances/inscription-finance-columns";
import { sumInscriptionFinanceAmounts } from "@/lib/finances/operational-summary";
import { matchesListSearch } from "@/lib/list-query/list-query";

import type { loadSeminarInscriptionFinances } from "./server";

type SeminarInscriptionFinancesLoaderData = Awaited<
  ReturnType<typeof loadSeminarInscriptionFinances>
>;

type InscriptionRow =
  SeminarInscriptionFinancesLoaderData["inscriptions"][number];

/** The facets' parameter names, which the route's revalidation rule reads. */
export const seminarInscriptionFinanceFacetedFilterIds = [
  "academia",
  "docente",
  "estado",
] as const;

/**
 * Every seminar inscription of the event, across academies: the place to see
 * who owes what for seminars without opening one `(seminar, academy)` detail
 * after another. The figures above the table sum the rows the search and the
 * filters leave, so narrowing to one academy or one instructor answers what
 * they owe.
 *
 * The person's name is the row's only control and opens the same money dialog
 * the detail does; the rest of the row is reading.
 */
export function SeminarInscriptionFinancesView({
  loaderData,
}: {
  loaderData: SeminarInscriptionFinancesLoaderData;
}) {
  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Seminarios"
      description="Inscripciones a seminarios de todas las academias en el evento activo: seña, total y saldo adeudado."
      eventRequiredEmptyState={{
        title: "Elegí un evento activo para revisar los seminarios",
        description:
          "Activá un evento para consultar lo que adeuda cada inscripción a un seminario.",
      }}
    >
      <InscriptionsTable
        inscriptions={loaderData.inscriptions}
        priceOptionsByInscription={loaderData.priceOptionsByInscription}
      />
    </AdminResourceLayout>
  );
}

/**
 * The money dialog lives **next to** the table and not inside the row that
 * opened it, as on the detail: a cell is remounted by every revalidation,
 * which would take a refused write's message with it (#708).
 */
function InscriptionsTable({
  inscriptions,
  priceOptionsByInscription,
}: {
  inscriptions: InscriptionRow[];
  priceOptionsByInscription: SeminarInscriptionFinancesLoaderData["priceOptionsByInscription"];
}) {
  const [openInscriptionId, setOpenInscriptionId] = useState<string | null>(
    null,
  );
  const openMoneyDialog = useCallback((inscriptionId: string) => {
    setOpenInscriptionId(inscriptionId);
  }, []);
  const closeMoneyDialog = useCallback((open: boolean) => {
    if (!open) {
      setOpenInscriptionId(null);
    }
  }, []);
  const columns = useMemo(
    () => buildInscriptionColumns(openMoneyDialog),
    [openMoneyDialog],
  );
  const facetedFilters = useMemo(
    () => buildFacetedFilters(inscriptions),
    [inscriptions],
  );
  const openInscription =
    inscriptions.find(
      (inscription) => inscription.inscriptionId === openInscriptionId,
    ) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <ClientDataTable
        rows={inscriptions}
        columns={columns}
        facetedFilters={facetedFilters}
        getRowKey={(inscription) => inscription.inscriptionId}
        // The person alone: academy and instructor are facets, and a search
        // that also matched them would answer a question the filters already
        // ask.
        matchesSearch={matchesPersonName}
        pageSize={25}
        renderFilteredSummary={(rows) => <FilteredMetrics rows={rows} />}
        searchPlaceholder="Buscar por nombre"
        emptyMessage="No hay inscripciones a seminarios para mostrar."
      />
      {openInscription ? (
        <InscriptionMoneyDialog
          key={openInscription.inscriptionId}
          inscription={openInscription}
          onOpenChange={closeMoneyDialog}
          priceOptions={
            priceOptionsByInscription[openInscription.inscriptionId] ?? []
          }
          targetKind="seminar"
        />
      ) : null}
    </div>
  );
}

/**
 * `Seña total`, `Total` and `Saldo adeudado` over the rows on screen. There is
 * no `Saldo disponible`: unallocated money is each academy's pool, and summing
 * pools across academies answers nothing about seminars.
 */
function FilteredMetrics({ rows }: { rows: InscriptionRow[] }) {
  return (
    <section className="grid gap-4 sm:grid-cols-3">
      <MetricCard
        title="Seña total"
        value={formatOperationalAmount(
          sumInscriptionFinanceAmounts(rows.map((row) => row.depositAmount)),
        )}
      />
      <MetricCard
        title="Total"
        value={formatOperationalAmount(
          sumInscriptionFinanceAmounts(rows.map((row) => row.totalAmount)),
        )}
      />
      <MetricCard
        title="Saldo adeudado"
        value={formatOperationalAmount(
          sumInscriptionFinanceAmounts(
            rows.map((row) => row.owedBalanceAmount),
          ),
        )}
      />
    </section>
  );
}

function matchesPersonName(inscription: InscriptionRow, search: string) {
  return matchesListSearch(search, [formatDancerName(inscription)]);
}

// The price column stays on the detail: across seminars the row's name says
// less than its amounts, and the list is about what is owed.
const moneyColumns = inscriptionFinanceColumns.filter(
  (column) => column.id !== "price",
);

function buildInscriptionColumns(
  onOpenMoneyDialog: (inscriptionId: string) => void,
): DataTableColumn<InscriptionRow>[] {
  return [
    {
      id: "academy",
      header: "Academia",
      cell: (inscription) => inscription.academyName,
      // The id and not the name: the facet's values are pooled across columns,
      // and an id cannot collide with an instructor's name.
      filterValue: (inscription) => inscription.academyId,
      sortValue: (inscription) => inscription.academyName,
    },
    {
      id: "person",
      header: "Inscripto",
      className: "font-medium",
      cell: (inscription) => (
        <Button
          type="button"
          variant="link"
          className="h-auto p-0 text-left font-medium"
          onClick={() => onOpenMoneyDialog(inscription.inscriptionId)}
        >
          {formatDancerName(inscription)}
        </Button>
      ),
      sortValue: (inscription) => formatDancerName(inscription),
    },
    {
      id: "seminar",
      header: "Seminario",
      // A seminar is named by who teaches it; the date tells two seminars of
      // the same instructor apart.
      cell: (inscription) =>
        `${inscription.instructorName} · ${formatDate(inscription.scheduledDate)}`,
      filterValue: (inscription) => inscription.instructorName,
      sortValue: (inscription) =>
        `${inscription.scheduledDate} ${inscription.instructorName}`,
    },
    ...moneyColumns,
  ];
}

function buildFacetedFilters(
  inscriptions: InscriptionRow[],
): DataTableFacetedFiltersOf<typeof seminarInscriptionFinanceFacetedFilterIds> {
  return [
    {
      id: "academia",
      icon: Building2,
      label: "Academia",
      options: distinctOptions(
        inscriptions.map((inscription) => ({
          label: inscription.academyName,
          value: inscription.academyId,
        })),
      ),
    },
    {
      id: "docente",
      icon: Presentation,
      label: "Docente",
      options: distinctOptions(
        inscriptions.map((inscription) => ({
          label: inscription.instructorName,
          value: inscription.instructorName,
        })),
      ),
    },
    ...inscriptionFinanceFacetedFilters.map((filter) => ({
      ...filter,
      id: "estado" as const,
    })),
  ];
}

function distinctOptions(
  options: DataTableFacetedFilterOption[],
): DataTableFacetedFilterOption[] {
  const byValue = new Map(options.map((option) => [option.value, option]));

  return [...byValue.values()].sort((first, second) =>
    first.label.localeCompare(second.label, "es-AR"),
  );
}

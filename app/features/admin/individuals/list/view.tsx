import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import {
  ServerDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { IndividualLinkStateBadge } from "@/components/shared/individual-link-state-badge";
import {
  formatIndividualLinkStateLabel,
  individualLinkStateOptions,
  isIndividualLinkState,
} from "@/lib/individuals/link-state";
import {
  activeListFacets,
  describeEmptyList,
} from "@/lib/list-query/list-query";
import { toIndividualFullName } from "@/lib/individuals/personal-data";
import { formatIdentityDocument } from "@/lib/roster/identity-document";

import {
  buildIndividualDetailHref,
  toIndividualListFacets,
  type IndividualListFilters,
  type IndividualListItem,
} from "../shared";

import type { loadIndividualsList } from "./server";

type LoaderData = Awaited<ReturnType<typeof loadIndividualsList>>;

const emptyIndividualList = describeEmptyList(
  "particulares",
  "search-and-filters",
);

export function IndividualsListRouteView({
  loaderData,
}: {
  loaderData: LoaderData;
}) {
  return (
    <AdminResourceLayout
      requireSelectedEvent={false}
      title="Particulares"
      description="Compará la foto del documento de cada particular con sus datos y confirmá su vínculo con las academias."
    >
      {loaderData.individuals.length > 0 ||
      hasActiveIndividualFilters(loaderData.filters) ? (
        <IndividualsTable loaderData={loaderData} />
      ) : (
        <AdminEmptyState
          title={emptyIndividualList.nothingYet}
          description="Cuando alguien abra una cuenta de Particular, vas a poder revisarla desde este listado."
        />
      )}
    </AdminResourceLayout>
  );
}

/**
 * Whether the reader narrowed this list rather than landed on it. The page
 * narrows nothing: a page past the last one is clamped.
 */
function hasActiveIndividualFilters(filters: IndividualListFilters) {
  return (
    filters.query.length > 0 ||
    Object.keys(activeListFacets(toIndividualListFacets(filters))).length > 0
  );
}

function IndividualsTable({ loaderData }: { loaderData: LoaderData }) {
  const { filters, individuals } = loaderData;
  const columns: DataTableColumn<IndividualListItem>[] = [
    {
      id: "name",
      header: "Nombre",
      className: "align-top whitespace-normal",
      cell: (individual) => (
        <DataTableLink
          recordTitle
          to={buildIndividualDetailHref(filters, individual.id)}
          className="w-fit"
        >
          {toIndividualFullName(individual)}
        </DataTableLink>
      ),
      filterValue: toIndividualFullName,
    },
    {
      id: "document",
      header: "Documento",
      className: "align-top whitespace-normal text-muted-foreground",
      cell: (individual) => <span>{formatIdentityDocument(individual)}</span>,
      filterValue: (individual) => formatIdentityDocument(individual) ?? "",
    },
    {
      id: "linkState",
      header: "Vínculo",
      className: "align-top whitespace-normal",
      cell: (individual) => (
        <IndividualLinkStateBadge state={individual.linkState} />
      ),
      filterValues: (individual) => [individual.linkState],
      filterValue: (individual) =>
        formatIndividualLinkStateLabel(individual.linkState),
    },
  ];

  return (
    <ServerDataTable
      rows={individuals}
      columns={columns}
      getRowKey={(individual) => individual.id}
      searchPlaceholder="Buscar por nombre o documento"
      initialSearchValue={filters.query}
      facetedFilters={[
        {
          id: "estado",
          label: "Vínculo",
          options: individualLinkStateOptions,
          renderValue: (option) =>
            isIndividualLinkState(option.value) ? (
              <IndividualLinkStateBadge state={option.value} />
            ) : (
              option.label
            ),
        },
      ]}
      initialFacetedFilterValues={buildInitialFilterValues(filters)}
      emptyMessage={emptyIndividualList.nothingMatched}
      currentPage={filters.page}
      totalPages={loaderData.totalPages}
      totalRows={loaderData.totalCount}
    />
  );
}

function buildInitialFilterValues(
  filters: IndividualListFilters,
): Record<string, Record<string, string>> {
  const values = activeListFacets(toIndividualListFacets(filters));

  return Object.keys(values).length > 0 ? { filters: values } : {};
}

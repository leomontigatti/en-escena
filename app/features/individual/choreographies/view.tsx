import { Link } from "react-router";

import { PortalEmptyState, PortalListPage } from "@/components/portal/ui";
import { AwardBadge } from "@/components/shared/award-badge";
import {
  ClientDataTable,
  DataTableTruncatedText,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { individualPersonalDataPath } from "@/features/individual/shell/view";
import type { IndividualLinkState } from "@/lib/individuals/link-state";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";
import { rosterPersonNoun } from "@/lib/roster/roster-person-kind.shared";
import { formatPrimaryAndSecondaryValue } from "@/lib/shared/format-primary-and-secondary-value";

import type {
  IndividualChoreographiesLoaderData,
  IndividualChoreographyRow,
} from "./server";

/**
 * `Mis coreografías`: the active event's choreographies the individual takes
 * part in, with the owning academy and, once published, the result as that
 * academy reads it. On a phone each row is a card, as on the portal's
 * `Resultados`.
 */
const choreographyColumns: DataTableColumn<IndividualChoreographyRow>[] = [
  {
    id: "name",
    header: "Nombre",
    width: 18,
    className: "font-medium",
    cell: (row) => <DataTableTruncatedText value={row.name} />,
    sortValue: (row) => row.name,
  },
  {
    id: "academy",
    header: "Academia",
    width: 16,
    cell: (row) => <DataTableTruncatedText value={row.academyName} />,
    sortValue: (row) => row.academyName,
  },
  {
    id: "roles",
    header: "Participación",
    width: 12,
    className: "text-muted-foreground",
    cell: formatRoles,
  },
  {
    id: "modality",
    header: "Modalidad / Submodalidad",
    width: 16,
    className: "text-muted-foreground",
    cell: (row) => (
      <DataTableTruncatedText
        value={formatPrimaryAndSecondaryValue(
          row.modalityName,
          row.submodalityName,
        )}
      />
    ),
  },
  {
    id: "categoryGroup",
    header: "Categoría / Tipo de grupo",
    width: 16,
    className: "text-muted-foreground",
    cell: (row) => (
      <DataTableTruncatedText value={formatCategoryAndGroup(row)} />
    ),
  },
  {
    id: "award",
    header: "Premio",
    width: 12,
    cell: (row) => <ResultAward row={row} />,
  },
  {
    id: "average",
    header: "Promedio",
    width: 8,
    className: "tabular-nums",
    cell: formatAverage,
  },
  {
    id: "scores",
    header: "Puntajes",
    width: 16,
    className: "tabular-nums text-muted-foreground",
    cell: (row) => <DataTableTruncatedText value={formatScores(row)} />,
  },
];

export function IndividualChoreographiesView({
  loaderData,
}: {
  loaderData: IndividualChoreographiesLoaderData;
}) {
  const emptyState = selectEmptyState(loaderData);

  return (
    <PortalListPage
      titleId="individual-choreographies-title"
      title="Mis coreografías"
      description="Consultá las coreografías del evento activo en las que participás, en cualquier academia, y su resultado cuando se publique."
    >
      {emptyState ? (
        <PortalEmptyState {...emptyState} />
      ) : (
        <ClientDataTable
          rows={loaderData.choreographies}
          columns={choreographyColumns}
          getRowKey={(row) => row.choreographyId}
          layout="fit"
          matchesSearch={(row, search) => {
            const needle = search.toLocaleLowerCase("es");

            return [row.name, row.academyName].some((value) =>
              value.toLocaleLowerCase("es").includes(needle),
            );
          }}
          renderCard={(row) => <IndividualChoreographyCard row={row} />}
          searchPlaceholder="Buscar por nombre o academia"
          initialSort={{ columnId: "academy", direction: "asc" }}
          emptyMessage="No hay coreografías que coincidan con la búsqueda."
        />
      )}
    </PortalListPage>
  );
}

/** A row on a phone: what it is first, its result last. */
function IndividualChoreographyCard({
  row,
}: {
  row: IndividualChoreographyRow;
}) {
  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 font-medium wrap-break-word">{row.name}</span>
        <span className="shrink-0 text-sm text-muted-foreground">
          {formatRoles(row)}
        </span>
      </div>
      <p className="text-xs wrap-break-word text-muted-foreground">
        {[
          row.academyName,
          formatPrimaryAndSecondaryValue(row.modalityName, row.submodalityName),
          formatCategoryAndGroup(row),
        ].join(" · ")}
      </p>
      <div className="flex items-center justify-between gap-3">
        <ResultAward row={row} />
        <span className="text-sm font-medium tabular-nums">
          {formatAverage(row)}
        </span>
      </div>
      {row.result && row.result.scores.length > 0 ? (
        <p className="text-xs wrap-break-word text-muted-foreground tabular-nums">
          {formatScores(row)}
        </p>
      ) : null}
    </>
  );
}

/** An unpublished result reads as such, never as an empty award. */
function ResultAward({ row }: { row: IndividualChoreographyRow }) {
  if (!row.result) {
    return <span className="text-muted-foreground">Sin publicar</span>;
  }

  return (
    <AwardBadge
      award={row.result.award}
      disqualified={row.result.disqualified}
    />
  );
}

function formatRoles(row: IndividualChoreographyRow) {
  return row.roles
    .map((role) => rosterPersonNoun(role, "singularCapitalized"))
    .join(" y ");
}

function formatCategoryAndGroup(row: IndividualChoreographyRow) {
  return formatPrimaryAndSecondaryValue(
    row.categoryName,
    formatGroupTypeLabel(row.groupType),
  );
}

/** The average reads the way scores do everywhere: with a point, as stored. */
function formatAverage(row: IndividualChoreographyRow) {
  return row.result?.average == null ? "—" : String(row.result.average);
}

/** Each judge's score by name; a disqualification has none. */
function formatScores(row: IndividualChoreographyRow) {
  return (
    (row.result?.scores ?? [])
      .map((score) => `${score.judgeName}: ${score.value ?? "—"}`)
      .join(" · ") || "—"
  );
}

const unlinkedDescriptions = {
  pending:
    "Administración todavía no confirmó tu documento. Cuando lo confirme, vas a ver acá las coreografías en las que participás.",
  unlinked:
    "Para ver tus coreografías, subí una foto de tu documento en Mis datos y esperá a que administración confirme el vínculo.",
} as const satisfies Record<Exclude<IndividualLinkState, "linked">, string>;

function selectEmptyState(loaderData: IndividualChoreographiesLoaderData) {
  if (loaderData.linkState !== "linked") {
    return {
      title: "Tu cuenta todavía no está vinculada",
      description: (
        <>
          {unlinkedDescriptions[loaderData.linkState]}{" "}
          <Link
            className="underline underline-offset-4"
            to={individualPersonalDataPath}
          >
            Ir a Mis datos
          </Link>
        </>
      ),
    };
  }

  if (!loaderData.hasActiveEvent) {
    return {
      title: "No hay un evento activo",
      description:
        "Cuando la organización active un evento vas a ver acá tus coreografías.",
    };
  }

  if (loaderData.choreographies.length === 0) {
    return {
      title: "No participás de ninguna coreografía",
      description:
        "Cuando una academia te sume a una coreografía del evento activo con tu número de documento, va a aparecer acá.",
    };
  }

  return null;
}

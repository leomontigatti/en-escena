import { Fragment, useState } from "react";
import { Link } from "react-router";

import { PortalEmptyState, PortalListPage } from "@/components/portal/ui";
import { AwardBadge } from "@/components/shared/award-badge";
import {
  ClientDataTable,
  DataTableTruncatedText,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { individualProfilePath } from "@/features/individual/shell/view";
import type { IndividualLinkState } from "@/lib/individuals/link-state";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";
import { rosterPersonNoun } from "@/lib/roster/roster-person-kind.shared";
import { formatPrimaryAndSecondaryValue } from "@/lib/shared/format-primary-and-secondary-value";

import type {
  IndividualChoreographiesLoaderData,
  IndividualChoreographyRow,
} from "./server";

/**
 * `Coreografías`: the active event's choreographies the individual takes
 * part in, with the owning academy and, once published, the result as that
 * academy reads it. The table keeps the portal `Resultados` columns, which is
 * all a row has room for at 1280 px; the name opens the rest, how the
 * individual takes part and each judge's score (`ChoreographyDialog`). On a
 * phone each row is a card that holds it all.
 */
function buildChoreographyColumns(
  onOpen: (row: IndividualChoreographyRow) => void,
): DataTableColumn<IndividualChoreographyRow>[] {
  return [
    {
      id: "name",
      header: "Nombre",
      width: 21,
      className: "font-medium",
      cell: (row) => (
        <DataTableTruncatedText value={row.name}>
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 text-left font-medium"
            onClick={() => onOpen(row)}
          >
            {row.name}
          </Button>
        </DataTableTruncatedText>
      ),
      sortValue: (row) => row.name,
    },
    {
      id: "academy",
      header: "Academia",
      width: 14,
      className: "text-muted-foreground",
      cell: (row) => <DataTableTruncatedText value={row.academyName} />,
      sortValue: (row) => row.academyName,
    },
    {
      id: "modality",
      header: "Modalidad / Submodalidad",
      width: 21,
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
      width: 20,
      className: "text-muted-foreground",
      cell: (row) => (
        <DataTableTruncatedText value={formatCategoryAndGroup(row)} />
      ),
    },
    {
      id: "award",
      header: "Premio",
      width: 15,
      cell: (row) => <ResultAward row={row} />,
    },
    {
      id: "average",
      header: "Promedio",
      width: 9,
      className: "tabular-nums",
      cell: formatAverage,
    },
  ];
}

export function IndividualChoreographiesView({
  loaderData,
}: {
  loaderData: IndividualChoreographiesLoaderData;
}) {
  const emptyState = selectEmptyState(loaderData);
  const [openRow, setOpenRow] = useState<IndividualChoreographyRow | null>(
    null,
  );

  return (
    <PortalListPage
      titleId="individual-choreographies-title"
      title="Coreografías"
      description="Consultá las coreografías del evento activo en las que participás, en cualquier academia, y su resultado cuando se publique."
    >
      {emptyState ? (
        <PortalEmptyState {...emptyState} />
      ) : (
        <ClientDataTable
          rows={loaderData.choreographies}
          columns={buildChoreographyColumns(setOpenRow)}
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
      <ChoreographyDialog row={openRow} onClose={() => setOpenRow(null)} />
    </PortalListPage>
  );
}

/**
 * What a row has no column for: how the individual takes part and, once
 * published, the result as the owning academy reads it on its evaluation,
 * with each judge's score. A disqualification has no figures.
 */
function ChoreographyDialog({
  onClose,
  row,
}: {
  onClose: () => void;
  row: IndividualChoreographyRow | null;
}) {
  return (
    <Dialog
      open={row !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{row?.name}</DialogTitle>
          <DialogDescription>
            {row ? `${row.academyName} · ${formatRoles(row)}` : null}
          </DialogDescription>
        </DialogHeader>
        {row ? <ChoreographyResult row={row} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ChoreographyResult({ row }: { row: IndividualChoreographyRow }) {
  const { result } = row;

  if (!result) {
    return (
      <p className="text-sm text-muted-foreground">
        El resultado todavía no se publicó.
      </p>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <ResultAward row={row} />
        {result.average === null ? null : (
          <p className="text-xl font-semibold tabular-nums">
            {result.average}
            <span className="text-sm font-normal text-muted-foreground">
              {" "}
              / 100
            </span>
          </p>
        )}
      </div>
      {result.scores.length > 0 ? (
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
          {result.scores.map((score) => (
            <Fragment key={score.judgeId}>
              <dt className="text-muted-foreground">{score.judgeName}</dt>
              <dd className="text-right font-medium tabular-nums">
                {score.value ?? "—"}
              </dd>
            </Fragment>
          ))}
        </dl>
      ) : result.disqualified ? null : (
        <p className="text-sm text-muted-foreground">
          Esta presentación no tiene puntajes para mostrar.
        </p>
      )}
    </>
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
    "Para ver tus coreografías, subí una foto de tu documento en tu perfil y esperá a que administración confirme el vínculo.",
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
            to={individualProfilePath}
          >
            Ir a mi perfil
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

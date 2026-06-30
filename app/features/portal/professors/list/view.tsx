import { Plus } from "lucide-react";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import { useFetcher } from "react-router";

import { PortalEmptyState, PortalListPage } from "@/components/portal/ui";
import {
  ClientDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePortalRecordTitleLinkTransitionStyle } from "@/lib/shared/view-transitions";
import { CreateProfessorDialog } from "@/features/portal/professors/create/dialog";
import { type CreateProfessorActionData } from "@/features/portal/professors/create/shared";
import { type PortalProfessorsListLoaderData } from "@/features/portal/professors/list/shared";

type LoaderData = PortalProfessorsListLoaderData;
type ActionData = CreateProfessorActionData;
type ProfessorRow = LoaderData["professors"][number];
type ProfessorBadge = {
  label: string;
  variant: ComponentProps<typeof Badge>["variant"];
};

const baseProfessorFilters = {
  filters: {
    archivo: "active",
  },
};

export function PortalProfessorsListRouteView({
  loaderData,
  actionData: providedActionData,
}: {
  loaderData: LoaderData;
  actionData?: ActionData;
}) {
  const createProfessorFetcher = useFetcher<ActionData>();
  const actionData =
    createProfessorFetcher.data?.status === "error"
      ? createProfessorFetcher.data
      : providedActionData;
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(
    actionData?.modalOpen === true,
  );
  const [dismissServerState, setDismissServerState] = useState(false);
  const [dialogResetKey, setDialogResetKey] = useState(0);
  const previousCreateProfessorFetcherState = useRef(
    createProfessorFetcher.state,
  );

  useEffect(() => {
    if (actionData?.modalOpen === true) {
      setIsCreateDialogOpen(true);
      setDismissServerState(false);
    }
  }, [actionData]);

  useEffect(() => {
    const previousState = previousCreateProfessorFetcherState.current;
    previousCreateProfessorFetcherState.current = createProfessorFetcher.state;

    if (
      previousState !== "idle" &&
      createProfessorFetcher.state === "idle" &&
      createProfessorFetcher.data?.status !== "error"
    ) {
      setIsCreateDialogOpen(false);
      setDismissServerState(true);
      setDialogResetKey((currentValue) => currentValue + 1);
    }
  }, [createProfessorFetcher.data, createProfessorFetcher.state]);

  const visibleActionData = dismissServerState ? undefined : actionData;

  return (
    <>
      <PortalListPage
        titleId="profesores-title"
        title="Profesores"
        description="Gestioná los profesores de tu academia y completá su identificación cuando tengas los datos."
        action={
          <Button
            type="button"
            onClick={() => {
              setDismissServerState(true);
              setIsCreateDialogOpen(true);
            }}
          >
            <Plus aria-hidden="true" data-icon />
            Nuevo profesor
          </Button>
        }
      >
        {loaderData.professors.length > 0 ? (
          <ProfessorsTable professors={loaderData.professors} />
        ) : (
          <PortalEmptyState
            title="Todavía no cargaste profesores"
            description="Sumá el plantel docente de tu academia para empezar a vincularlo en las coreografías."
          />
        )}
      </PortalListPage>

      <CreateProfessorDialog
        key={dialogResetKey}
        actionData={visibleActionData}
        isOpen={isCreateDialogOpen}
        isSubmitting={createProfessorFetcher.state !== "idle"}
        onOpenChange={(nextOpen) => {
          setIsCreateDialogOpen(nextOpen);

          if (!nextOpen) {
            setDismissServerState(true);
            setDialogResetKey((currentValue) => currentValue + 1);
          }
        }}
        submit={createProfessorFetcher.submit}
      />
    </>
  );
}

function ProfessorsTable({ professors }: { professors: ProfessorRow[] }) {
  const columns: DataTableColumn<ProfessorRow>[] = [
    {
      id: "name",
      header: "Nombre",
      className: "w-1/2 font-medium",
      headerClassName: "w-1/2",
      cell: (professor) => <ProfessorDetailLink professor={professor} />,
      filterValue: (professor) =>
        `${professor.firstName} ${professor.lastName} ${professor.documentNumber ?? ""}`,
      sortValue: (professor) => `${professor.firstName} ${professor.lastName}`,
    },
    {
      id: "document",
      header: "Documento",
      className: "w-1/4 text-muted-foreground",
      headerClassName: "w-1/4",
      cell: (professor) => formatProfessorDocument(professor),
      filterValue: (professor) => professor.documentNumber ?? "",
    },
    {
      id: "status",
      header: "Estado",
      className: "w-1/4",
      headerClassName: "w-1/4",
      cell: (professor) => (
        <div className="flex flex-wrap gap-2">
          {getProfessorStateBadges(professor).map((badge) => (
            <Badge key={badge.label} variant={badge.variant}>
              {badge.label}
            </Badge>
          ))}
        </div>
      ),
      filterValues: (professor) => [
        professor.active ? "active" : "archived",
        professor.participationStatus,
        professor.isIncomplete ? "incomplete" : "complete",
      ],
    },
  ];

  return (
    <ClientDataTable
      rows={professors}
      columns={columns}
      getRowKey={(professor) => professor.id}
      searchPlaceholder="Buscar profesor por nombre o número de documento"
      textFilterColumnId="name"
      facetedFilters={[
        {
          label: "Participación",
          options: [
            { label: "Participando", value: "participating" },
            { label: "No participando", value: "not-participating" },
          ],
        },
        {
          label: "Completitud",
          options: [
            { label: "Completo", value: "complete" },
            { label: "Incompleto", value: "incomplete" },
          ],
        },
        {
          id: "archivo",
          label: "Archivo",
          options: [{ label: "Archivado", value: "archived" }],
        },
      ]}
      baseFacetedFilterValues={baseProfessorFilters}
      emptyMessage="No hay profesores que coincidan con la búsqueda o los filtros."
      initialSort={{ columnId: "name", direction: "asc" }}
    />
  );
}

function ProfessorDetailLink({ professor }: { professor: ProfessorRow }) {
  const href = `/portal/profesores/${professor.id}`;
  const viewTransitionStyle = usePortalRecordTitleLinkTransitionStyle(href);

  return (
    <DataTableLink to={href} viewTransition style={viewTransitionStyle}>
      {professor.firstName} {professor.lastName}
    </DataTableLink>
  );
}

function formatProfessorDocument(professor: ProfessorRow) {
  if (!professor.documentType || !professor.documentNumber) {
    return <span className="text-muted-foreground">Sin documento</span>;
  }

  if (professor.documentType === "dni") {
    return `DNI ${professor.documentNumber}`;
  }

  if (professor.documentType === "passport") {
    return `Pasaporte ${professor.documentNumber}`;
  }

  return `Otro ${professor.documentNumber}`;
}

function getProfessorStateBadges(professor: ProfessorRow) {
  const badges: ProfessorBadge[] = [
    {
      label: getProfessorParticipationLabel(professor.participationStatus),
      variant:
        professor.participationStatus === "participating"
          ? ("success" as const)
          : ("secondary" as const),
    },
  ];

  if (!professor.active) {
    badges.unshift({ label: "Archivado", variant: "destructive" as const });
  }

  badges.push(
    professor.isIncomplete
      ? { label: "Incompleto", variant: "warning" as const }
      : { label: "Completo", variant: "success" as const },
  );

  return badges;
}

function getProfessorParticipationLabel(
  status: ProfessorRow["participationStatus"],
) {
  if (status === "participating") {
    return "Participando";
  }

  return "No participando";
}

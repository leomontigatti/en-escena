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
import { CreateDancerDialog } from "@/features/portal/dancers/create/dialog";
import { type CreateDancerActionData } from "@/features/portal/dancers/create/shared";
import { type PortalDancersListLoaderData } from "@/features/portal/dancers/list/shared";

type LoaderData = PortalDancersListLoaderData;
type ActionData = CreateDancerActionData;
type DancerRow = LoaderData["dancers"][number];

const baseDancerFilters = {
  filters: {
    archivo: "active",
  },
};

type DancerBadge = {
  label: string;
  variant: ComponentProps<typeof Badge>["variant"];
};

export function PortalDancersListRouteView({
  loaderData,
  actionData: providedActionData,
}: {
  loaderData: LoaderData;
  actionData?: ActionData;
}) {
  const createDancerFetcher = useFetcher<ActionData>();
  const actionData =
    createDancerFetcher.data?.status === "error"
      ? createDancerFetcher.data
      : providedActionData;
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(
    actionData?.modalOpen === true,
  );
  const [dismissServerState, setDismissServerState] = useState(false);
  const [dialogResetKey, setDialogResetKey] = useState(0);
  const previousCreateDancerFetcherState = useRef(createDancerFetcher.state);

  useEffect(() => {
    if (actionData?.modalOpen === true) {
      setIsCreateDialogOpen(true);
      setDismissServerState(false);
    }
  }, [actionData]);

  useEffect(() => {
    const previousState = previousCreateDancerFetcherState.current;
    previousCreateDancerFetcherState.current = createDancerFetcher.state;

    if (
      previousState !== "idle" &&
      createDancerFetcher.state === "idle" &&
      createDancerFetcher.data?.status !== "error"
    ) {
      setIsCreateDialogOpen(false);
      setDismissServerState(true);
      setDialogResetKey((currentValue) => currentValue + 1);
    }
  }, [createDancerFetcher.data, createDancerFetcher.state]);

  const visibleActionData = dismissServerState ? undefined : actionData;

  return (
    <>
      <PortalListPage
        titleId="bailarines-title"
        title="Bailarines"
        description="Gestioná los bailarines de tu academia y priorizá los registros que todavía necesitan documento o imágenes."
        action={
          <Button
            type="button"
            onClick={() => {
              setDismissServerState(true);
              setIsCreateDialogOpen(true);
            }}
          >
            <Plus aria-hidden="true" data-icon />
            Nuevo bailarín
          </Button>
        }
      >
        {loaderData.dancers.length > 0 ? (
          <DancersTable dancers={loaderData.dancers} />
        ) : (
          <PortalEmptyState
            title="Todavía no cargaste bailarines"
            description="Cuando cargues bailarines, van a aparecer en esta lista para usarlos en coreografías."
          />
        )}
      </PortalListPage>

      <CreateDancerDialog
        key={dialogResetKey}
        actionData={visibleActionData}
        isOpen={isCreateDialogOpen}
        isSubmitting={createDancerFetcher.state !== "idle"}
        onOpenChange={(nextOpen) => {
          setIsCreateDialogOpen(nextOpen);

          if (!nextOpen) {
            setDismissServerState(true);
            setDialogResetKey((currentValue) => currentValue + 1);
          }
        }}
        submit={createDancerFetcher.submit}
      />
    </>
  );
}

function DancersTable({ dancers }: { dancers: DancerRow[] }) {
  const columns: DataTableColumn<DancerRow>[] = [
    {
      id: "name",
      header: "Nombre",
      className: "w-1/2 font-medium",
      headerClassName: "w-1/2",
      cell: (dancer) => <DancerDetailLink dancer={dancer} />,
      filterValue: (dancer) =>
        `${dancer.firstName} ${dancer.lastName} ${dancer.documentNumber ?? ""}`,
      sortValue: (dancer) => `${dancer.firstName} ${dancer.lastName}`,
    },
    {
      id: "document",
      header: "Documento",
      className: "w-1/4 text-muted-foreground",
      headerClassName: "w-1/4",
      cell: (dancer) => formatDocument(dancer),
      filterValue: (dancer) => dancer.documentNumber ?? "",
    },
    {
      id: "status",
      header: "Estado",
      className: "w-1/4",
      headerClassName: "w-1/4",
      cell: (dancer) => (
        <div className="flex flex-wrap gap-2">
          {getDancerStateBadges(dancer).map((badge) => (
            <Badge key={badge.label} variant={badge.variant}>
              {badge.label}
            </Badge>
          ))}
        </div>
      ),
      filterValues: (dancer) => [
        dancer.active ? "active" : "archived",
        dancer.participationStatus,
        dancer.verificationStatus,
      ],
    },
  ];

  return (
    <ClientDataTable
      rows={dancers}
      columns={columns}
      getRowKey={(dancer) => dancer.id}
      searchPlaceholder="Buscar bailarín por nombre o número de documento"
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
          label: "Verificación",
          options: [
            { label: "Incompleto", value: "incomplete" },
            { label: "Sin verificar", value: "unverified" },
            { label: "Verificado", value: "verified" },
          ],
        },
        {
          id: "archivo",
          label: "Archivo",
          options: [{ label: "Archivado", value: "archived" }],
        },
      ]}
      baseFacetedFilterValues={baseDancerFilters}
      emptyMessage="No hay bailarines que coincidan con la búsqueda o los filtros."
      initialSort={{ columnId: "name", direction: "asc" }}
    />
  );
}

function DancerDetailLink({ dancer }: { dancer: DancerRow }) {
  const href = `/portal/bailarines/${dancer.id}`;
  const viewTransitionStyle = usePortalRecordTitleLinkTransitionStyle(href);

  return (
    <DataTableLink to={href} viewTransition style={viewTransitionStyle}>
      {dancer.firstName} {dancer.lastName}
    </DataTableLink>
  );
}

function getDancerStateBadges(dancer: DancerRow) {
  const badges: DancerBadge[] = [];

  if (!dancer.active) {
    badges.push({ label: "Archivado", variant: "destructive" });
  }

  badges.push({
    label: getDancerParticipationLabel(dancer.participationStatus),
    variant:
      dancer.participationStatus === "participating" ? "success" : "secondary",
  });

  badges.push({
    label: getDancerVerificationLabel(dancer.verificationStatus),
    variant: getDancerVerificationBadgeVariant(dancer.verificationStatus),
  });

  return badges;
}

function getDancerVerificationBadgeVariant(
  status: DancerRow["verificationStatus"],
): DancerBadge["variant"] {
  switch (status) {
    case "verified":
      return "success";
    case "unverified":
      return "info";
    case "incomplete":
      return "warning";
  }
}

function getDancerParticipationLabel(status: DancerRow["participationStatus"]) {
  if (status === "participating") {
    return "Participando";
  }

  return "No participando";
}

function getDancerVerificationLabel(status: DancerRow["verificationStatus"]) {
  switch (status) {
    case "verified":
      return "Verificado";
    case "unverified":
      return "Sin verificar";
    case "incomplete":
      return "Incompleto";
  }
}

function formatDocument(dancer: DancerRow) {
  if (!dancer.documentType || !dancer.documentNumber) {
    return <span className="text-muted-foreground">Sin documento</span>;
  }

  switch (dancer.documentType) {
    case "dni":
      return `DNI ${dancer.documentNumber}`;
    case "passport":
      return `Pasaporte ${dancer.documentNumber}`;
    default:
      return `Otro ${dancer.documentNumber}`;
  }
}

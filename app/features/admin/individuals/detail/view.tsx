import { Info } from "lucide-react";
import { useState } from "react";

import {
  AdminResourceFormCard,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { AlertStack } from "@/components/shared/alert-stack";
import {
  ClientDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { FormActions } from "@/components/shared/form-actions";
import { IndividualLinkStateBadge } from "@/components/shared/individual-link-state-badge";
import { ReadOnlyDocumentImageField } from "@/components/shared/read-only-document-image-field";
import {
  ReadOnlyField,
  ReadOnlySelectField,
} from "@/components/shared/read-only-field";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { RosterPersonStatusBadge } from "@/components/shared/roster-person-status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { FieldGroup } from "@/components/ui/field";
import type { IndividualLinkState } from "@/lib/individuals/link-state";
import type { LinkedRosterRow } from "@/lib/individuals/link.server";
import { toIndividualFullName } from "@/lib/individuals/personal-data";
import {
  documentTypeEmptyLabel,
  documentTypeOptions,
  formatIdentityDocument,
} from "@/lib/roster/identity-document";
import {
  rosterPersonListPath,
  rosterPersonNoun,
} from "@/lib/roster/roster-person-kind.shared";
import { formatBusinessDate } from "@/lib/shared/business-time-zone";
import { useServerActionToast } from "@/lib/shared/toasts";

import { LinkDialogs, type LinkDialog } from "./link-dialogs";
import type {
  IndividualDetailActionData,
  IndividualDetailLoaderData,
} from "./shared";

export function IndividualDetailRouteView({
  actionData,
  loaderData,
}: {
  actionData?: IndividualDetailActionData;
  loaderData: IndividualDetailLoaderData;
}) {
  const { canWrite, individual, linkState } = loaderData;
  const fullName = toIndividualFullName(individual);
  const [dialog, setDialog] = useState<LinkDialog>(null);

  useServerActionToast(actionData, {
    toastId: "administracion-particular:feedback",
  });

  return (
    <AdminResourceLayout
      requireSelectedEvent={false}
      title={fullName}
      titleBadge={<IndividualLinkStateBadge state={linkState} />}
      description="Compará la foto del documento con los datos de la cuenta antes de confirmar el vínculo con las academias."
      headerAction={
        canWrite ? (
          <LinkActionsMenu linkState={linkState} onSelect={setDialog} />
        ) : undefined
      }
    >
      <LinkStateAlert loaderData={loaderData} />
      <IndividualDataCard loaderData={loaderData} />
      <ReachedRowsSection linkState={linkState} rows={loaderData.reachedRows} />
      {canWrite ? (
        <LinkDialogs
          dialog={dialog}
          documentLabel={formatIdentityDocument(individual) ?? ""}
          documentNumber={individual.documentNumber}
          documentPhotoStorageKey={loaderData.documentPhotoStorageKey}
          fullName={fullName}
          onClose={() => setDialog(null)}
          reachedRowCount={loaderData.reachedRows.length}
        />
      ) : null}
    </AdminResourceLayout>
  );
}

/**
 * One item, the one the state calls for: `Revocar vínculo` once linked,
 * `Confirmar vínculo` otherwise, which opens the blocked dialog without a
 * photo rather than being disabled.
 */
function LinkActionsMenu({
  linkState,
  onSelect,
}: {
  linkState: IndividualLinkState;
  onSelect: (dialog: LinkDialog) => void;
}) {
  return (
    <ResourceActionsMenu>
      {linkState === "linked" ? (
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => onSelect("revoke")}
        >
          Revocar vínculo
        </DropdownMenuItem>
      ) : (
        <DropdownMenuItem
          onSelect={() =>
            onSelect(linkState === "unlinked" ? "blocked" : "confirm")
          }
        >
          Confirmar vínculo
        </DropdownMenuItem>
      )}
    </ResourceActionsMenu>
  );
}

/** Who confirmed the link and when, or why it cannot be confirmed yet. */
function LinkStateAlert({
  loaderData: { confirmation, linkState },
}: {
  loaderData: IndividualDetailLoaderData;
}) {
  if (linkState === "pending") {
    return null;
  }

  return (
    <AlertStack>
      <Alert variant="info">
        <Info aria-hidden="true" />
        {confirmation ? (
          <>
            <AlertTitle>Vínculo confirmado</AlertTitle>
            <AlertDescription>
              {describeConfirmation(confirmation)} Si el particular cambia su
              documento, vuelve a quedar pendiente.
            </AlertDescription>
          </>
        ) : (
          <>
            <AlertTitle>Sin foto del documento</AlertTitle>
            <AlertDescription>
              El vínculo se puede confirmar cuando el particular suba la foto de
              su documento desde Mis datos.
            </AlertDescription>
          </>
        )}
      </Alert>
    </AlertStack>
  );
}

function describeConfirmation(
  confirmation: NonNullable<IndividualDetailLoaderData["confirmation"]>,
) {
  const day = formatBusinessDate(confirmation.confirmedAt);

  // The confirming user can be gone; the confirmation stays.
  return confirmation.confirmedByName
    ? `Lo confirmó ${confirmation.confirmedByName} el ${day}.`
    : `Se confirmó el ${day}.`;
}

function IndividualDataCard({
  loaderData,
}: {
  loaderData: IndividualDetailLoaderData;
}) {
  const { individual } = loaderData;

  return (
    <AdminResourceFormCard
      footer={
        <FormActions
          backTo={loaderData.backToList}
          canEdit={false}
          hasChanges={false}
          isPending={false}
          onDiscard={() => undefined}
        />
      }
    >
      <FieldGroup className="grid gap-5 md:grid-cols-2">
        <ReadOnlyField label="Nombre" value={individual.firstName} />
        <ReadOnlyField label="Apellido" value={individual.lastName} />
        <ReadOnlySelectField
          emptyLabel={documentTypeEmptyLabel}
          label="Tipo de documento"
          options={documentTypeOptions}
          value={individual.documentType}
        />
        <ReadOnlyField
          label="Número de documento"
          value={individual.documentNumber}
        />
        <ReadOnlyField label="Teléfono" value={individual.phone} />
        <ReadOnlyField
          autoComplete="email"
          label="Email de acceso"
          type="email"
          value={individual.email}
        />
        <ReadOnlyDocumentImageField
          label="Foto del documento"
          storageKey={loaderData.documentPhotoStorageKey}
          url={loaderData.documentPhotoUrl}
        />
      </FieldGroup>
    </AdminResourceFormCard>
  );
}

const reachedRowsDescriptions = {
  linked:
    "Los bailarines y profesores de cualquier academia con este documento: el particular lee su participación.",
  pending:
    "Los bailarines y profesores de cualquier academia con este documento: lo que el particular va a leer cuando se confirme el vínculo.",
  unlinked:
    "Los bailarines y profesores de cualquier academia con este documento: lo que el particular va a leer cuando se confirme el vínculo.",
} as const satisfies Record<IndividualLinkState, string>;

const reachedRowColumns: DataTableColumn<LinkedRosterRow>[] = [
  {
    id: "name",
    header: "Nombre",
    cell: (row) => (
      <DataTableLink to={`${rosterPersonListPath(row.kind)}/${row.id}`}>
        {row.firstName} {row.lastName}
      </DataTableLink>
    ),
    filterValue: (row) => `${row.firstName} ${row.lastName}`,
  },
  {
    id: "kind",
    header: "Tipo",
    cell: (row) => rosterPersonNoun(row.kind, "singularCapitalized"),
    filterValue: (row) => rosterPersonNoun(row.kind, "singular"),
  },
  {
    id: "academyName",
    header: "Academia",
    cell: (row) => row.academyName,
    filterValue: (row) => row.academyName,
  },
  {
    id: "status",
    header: "Estado de alta",
    cell: (row) => <RosterPersonStatusBadge status={row.status} />,
  },
];

function ReachedRowsSection({
  linkState,
  rows,
}: {
  linkState: IndividualLinkState;
  rows: LinkedRosterRow[];
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Filas de academia</h2>
        <p className="text-sm text-muted-foreground">
          {reachedRowsDescriptions[linkState]}
        </p>
      </div>
      <ClientDataTable
        rows={rows}
        columns={reachedRowColumns}
        getRowKey={(row) => `${row.kind}:${row.id}`}
        searchPlaceholder="Buscar por nombre o academia"
        emptyMessage="Ninguna academia cargó un bailarín o un profesor con este documento."
        initialSort={{ columnId: "academyName", direction: "asc" }}
      />
    </section>
  );
}

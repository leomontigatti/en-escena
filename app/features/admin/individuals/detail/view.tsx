import { Info } from "lucide-react";
import { useState } from "react";

import {
  AdminResourceFormCard,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { AlertStack } from "@/components/shared/alert-stack";
import { FormActions } from "@/components/shared/form-actions";
import { ReadOnlyDocumentImageField } from "@/components/shared/read-only-document-image-field";
import {
  ReadOnlyField,
  ReadOnlySelectField,
} from "@/components/shared/read-only-field";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { FieldGroup } from "@/components/ui/field";
import { toIndividualFullName } from "@/lib/individuals/personal-data";
import {
  documentTypeEmptyLabel,
  documentTypeOptions,
  formatIdentityDocument,
} from "@/lib/roster/identity-document";
import { formatBusinessDate } from "@/lib/shared/business-time-zone";
import { useServerActionToast } from "@/lib/shared/toasts";

import { IndividualLinkReviewBadge } from "../link-review-badge";

import { LinkDialogs, type LinkDialog } from "./link-dialogs";
import type {
  IndividualDetailActionData,
  IndividualDetailLoaderData,
  IndividualLinkDetail,
} from "./shared";

export function IndividualDetailRouteView({
  actionData,
  loaderData,
}: {
  actionData?: IndividualDetailActionData;
  loaderData: IndividualDetailLoaderData;
}) {
  const { canWrite, individual } = loaderData;

  useServerActionToast(actionData, {
    toastId: "administracion-particular:feedback",
  });

  return (
    <AdminResourceLayout
      requireSelectedEvent={false}
      title={toIndividualFullName(individual)}
      titleBadge={<IndividualLinkReviewBadge state={individual.linkState} />}
      description={
        canWrite
          ? "Compará la foto del documento con los datos de la cuenta antes de confirmar el vínculo con las academias."
          : "Consultá los datos del particular y el vínculo de su documento en modo solo lectura."
      }
      headerAction={
        canWrite ? <IndividualLinkActions individual={individual} /> : undefined
      }
    >
      <IndividualLinkAlert individual={individual} />
      <IndividualDataCard
        backToList={loaderData.backToList}
        individual={individual}
      />
    </AdminResourceLayout>
  );
}

/**
 * The `Acciones` menu of an individual, with the one item its link
 * state calls for: `Revocar vínculo` once linked, `Confirmar vínculo`
 * otherwise, which opens the blocked dialog without a photo rather than being
 * disabled. Administration's alone: the detail renders it only to a writer.
 */
function IndividualLinkActions({
  individual,
}: {
  individual: IndividualLinkDetail;
}) {
  const [dialog, setDialog] = useState<LinkDialog>(null);
  const { linkState } = individual;

  return (
    <>
      <ResourceActionsMenu>
        {linkState === "linked" ? (
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setDialog("revoke")}
          >
            Revocar vínculo
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            onSelect={() =>
              setDialog(linkState === "unlinked" ? "blocked" : "confirm")
            }
          >
            Confirmar vínculo
          </DropdownMenuItem>
        )}
      </ResourceActionsMenu>
      <LinkDialogs
        dialog={dialog}
        documentLabel={formatIdentityDocument(individual) ?? ""}
        documentNumber={individual.documentNumber}
        documentPhotoStorageKey={individual.documentPhotoStorageKey}
        fullName={toIndividualFullName(individual)}
        onClose={() => setDialog(null)}
      />
    </>
  );
}

/** Who confirmed the link and when, or why it cannot be confirmed yet. */
function IndividualLinkAlert({
  individual: { confirmation, linkState },
}: {
  individual: IndividualLinkDetail;
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
              documento, vuelve a quedar sin verificar.
            </AlertDescription>
          </>
        ) : (
          <>
            <AlertTitle>Sin foto del documento</AlertTitle>
            <AlertDescription>
              El vínculo se puede confirmar cuando el particular suba la foto de
              su documento desde su perfil.
            </AlertDescription>
          </>
        )}
      </Alert>
    </AlertStack>
  );
}

function describeConfirmation(
  confirmation: NonNullable<IndividualLinkDetail["confirmation"]>,
) {
  const day = formatBusinessDate(confirmation.confirmedAt);

  // The confirming user can be gone; the confirmation stays.
  return confirmation.confirmedByName
    ? `Lo confirmó ${confirmation.confirmedByName} el ${day}.`
    : `Se confirmó el ${day}.`;
}

/** The individual's data and document photo, read-only. */
function IndividualDataCard({
  backToList,
  individual,
}: {
  backToList: string;
  individual: IndividualLinkDetail;
}) {
  return (
    <AdminResourceFormCard
      footer={
        <FormActions
          backTo={backToList}
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
          storageKey={individual.documentPhotoStorageKey}
          url={individual.documentPhotoUrl}
        />
      </FieldGroup>
    </AdminResourceFormCard>
  );
}

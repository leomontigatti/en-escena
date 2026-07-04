import { Check, Pencil, TriangleAlert } from "lucide-react";
import type { FormEventHandler, ReactNode } from "react";
import { Link } from "react-router";

import {
  AdminEmptyState,
  AdminResourceFormCard,
} from "@/components/admin/resource-layout";
import { AlertStack } from "@/components/shared/alert-stack";
import { ArchivedPersonAlert } from "@/components/shared/archived-person-alert";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { FieldGroup } from "@/components/ui/field";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";

import {
  DancerBirthDateField,
  DancerDocumentTypeField,
  DancerTextField,
  ReadOnlyDateField,
  ReadOnlyDocumentImageField,
  ReadOnlyField,
  type DancerEditFormController,
} from "./form";
import {
  formatDancerDocumentType,
  type DancerDetailLoaderData,
  type DancerDialogIntent,
  type DancerStatusAction,
} from "./shared";

export type InscriptionsSectionProps = {
  inscriptions: DancerDetailLoaderData["dancer"]["inscriptions"];
  selectedEventId: string | null;
};

const moneyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});

export function DancerDetailHeaderActions({
  canEdit,
  canVerifyIdentity,
  onSelectIntent,
  statusAction,
}: {
  canEdit: boolean;
  canVerifyIdentity: boolean;
  onSelectIntent: (intent: DancerDialogIntent) => void;
  statusAction: DancerStatusAction;
}) {
  if (!canEdit) {
    return null;
  }

  return (
    <ResourceActionsMenu>
      {canVerifyIdentity ? (
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            onSelectIntent("verify");
          }}
        >
          Verificar
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuItem
        variant={
          statusAction.intent === "archive-dancer" ? "destructive" : "default"
        }
        onSelect={(event) => {
          event.preventDefault();
          onSelectIntent(statusAction.intent);
        }}
      >
        {statusAction.label}
      </DropdownMenuItem>
    </ResourceActionsMenu>
  );
}

export function DancerDetailAlerts({
  active,
  canEdit,
  canVerifyIdentity,
  identificationAlert,
  identificationAlertVariant,
  onSelectIntent,
}: {
  active: boolean;
  canEdit: boolean;
  canVerifyIdentity: boolean;
  identificationAlert: string | null;
  identificationAlertVariant: "info" | "warning";
  onSelectIntent: (intent: DancerDialogIntent) => void;
}) {
  return (
    <AlertStack>
      {!active ? (
        <ArchivedPersonAlert
          personLabel="bailarín"
          onReactivate={
            canEdit ? () => onSelectIntent("reactivate-dancer") : undefined
          }
        />
      ) : null}
      {identificationAlert ? (
        <DancerAlert
          variant={identificationAlertVariant}
          action={
            canVerifyIdentity
              ? {
                  label: "Verificar",
                  onClick: () => {
                    onSelectIntent("verify");
                  },
                }
              : undefined
          }
        >
          {identificationAlert}
        </DancerAlert>
      ) : null}
    </AlertStack>
  );
}

export function DancerDetailCard({
  backToList,
  cancelHref,
  canEdit,
  dancer,
  documentImageUrls,
  editForm,
  editFormId,
  editHref,
  isEditing,
  onConfirmSave,
  onSubmit,
  selectedEventId,
  shouldConfirmSave,
}: {
  backToList: string;
  cancelHref: string;
  canEdit: boolean;
  dancer: DancerDetailLoaderData["dancer"];
  documentImageUrls: DancerDetailLoaderData["documentImageUrls"];
  editForm: DancerEditFormController;
  editFormId: string;
  editHref: string;
  isEditing: boolean;
  onConfirmSave: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  selectedEventId: string | null;
  shouldConfirmSave: boolean;
}) {
  return (
    <AdminResourceFormCard
      footer={
        <DancerDetailFooterActions
          backToList={backToList}
          canEdit={canEdit}
          cancelHref={cancelHref}
          editFormId={editFormId}
          editHref={editHref}
          isEditing={isEditing}
          onConfirmSave={onConfirmSave}
          shouldConfirmSave={shouldConfirmSave}
        />
      }
    >
      <form
        id={editFormId}
        method="post"
        noValidate
        onSubmit={onSubmit}
        className="flex flex-col gap-6"
      >
        <input type="hidden" name="intent" value="update-dancer" />
        <DancerAdministrativeDataSection
          dancer={dancer}
          editForm={editForm}
          isEditing={isEditing}
        />
        <DancerDetailTabs
          dancer={dancer}
          documentImageUrls={documentImageUrls}
          editForm={editForm}
          isEditing={isEditing}
          selectedEventId={selectedEventId}
        />
      </form>
    </AdminResourceFormCard>
  );
}

function DancerAdministrativeDataSection({
  dancer,
  editForm,
  isEditing,
}: {
  dancer: DancerDetailLoaderData["dancer"];
  editForm: DancerEditFormController;
  isEditing: boolean;
}) {
  return (
    <FieldGroup className="grid gap-5 md:grid-cols-2">
      <ReadOnlyField
        className="md:col-span-2"
        label="Academia"
        value={dancer.academy.name}
      />
      {isEditing ? (
        <>
          <DancerTextField
            form={editForm.form}
            label="Nombre"
            name="firstName"
          />
          <DancerTextField
            form={editForm.form}
            label="Apellido"
            name="lastName"
          />
        </>
      ) : (
        <>
          <ReadOnlyField label="Nombre" value={dancer.firstName} />
          <ReadOnlyField label="Apellido" value={dancer.lastName} />
        </>
      )}
    </FieldGroup>
  );
}

function DancerDetailTabs({
  dancer,
  documentImageUrls,
  editForm,
  isEditing,
  selectedEventId,
}: {
  dancer: DancerDetailLoaderData["dancer"];
  documentImageUrls: DancerDetailLoaderData["documentImageUrls"];
  editForm: DancerEditFormController;
  isEditing: boolean;
  selectedEventId: string | null;
}) {
  return (
    <Tabs defaultValue="identificacion">
      <TabsList variant="line">
        <TabsTrigger value="identificacion">Identificación</TabsTrigger>
        <TabsTrigger value="inscripciones">Inscripciones</TabsTrigger>
      </TabsList>
      <TabsContent value="identificacion" className="pt-2">
        <DancerIdentificationSection
          dancer={dancer}
          documentImageUrls={documentImageUrls}
          editForm={editForm}
          isEditing={isEditing}
        />
      </TabsContent>
      <TabsContent value="inscripciones" className="pt-2">
        <InscriptionsSection
          inscriptions={dancer.inscriptions}
          selectedEventId={selectedEventId}
        />
      </TabsContent>
    </Tabs>
  );
}

function DancerIdentificationSection({
  dancer,
  documentImageUrls,
  editForm,
  isEditing,
}: {
  dancer: DancerDetailLoaderData["dancer"];
  documentImageUrls: DancerDetailLoaderData["documentImageUrls"];
  editForm: DancerEditFormController;
  isEditing: boolean;
}) {
  return (
    <FieldGroup className="grid gap-5 md:grid-cols-2">
      {isEditing ? (
        <>
          <DancerBirthDateField form={editForm.form} />
          <div aria-hidden="true" className="hidden md:block" />
          <DancerDocumentTypeField form={editForm.form} />
          <DancerTextField
            form={editForm.form}
            label="Número de documento"
            name="documentNumber"
          />
          <ReadOnlyDocumentImageField
            label="Imagen frente del documento"
            name="documentFrontImageStorageKey"
            storageKey={dancer.documentFrontImageStorageKey}
            url={documentImageUrls.front}
          />
          <ReadOnlyDocumentImageField
            label="Imagen dorso del documento"
            name="documentBackImageStorageKey"
            storageKey={dancer.documentBackImageStorageKey}
            url={documentImageUrls.back}
          />
        </>
      ) : (
        <>
          <ReadOnlyDateField value={dancer.birthDate} />
          <div aria-hidden="true" className="hidden md:block" />
          <ReadOnlyField
            label="Tipo de documento"
            value={formatDancerDocumentType(dancer.documentType)}
          />
          <ReadOnlyField
            label="Número de documento"
            value={dancer.documentNumber ?? ""}
          />
          <ReadOnlyDocumentImageField
            label="Imagen frente del documento"
            storageKey={dancer.documentFrontImageStorageKey}
            url={documentImageUrls.front}
          />
          <ReadOnlyDocumentImageField
            label="Imagen dorso del documento"
            storageKey={dancer.documentBackImageStorageKey}
            url={documentImageUrls.back}
          />
        </>
      )}
    </FieldGroup>
  );
}

function DancerDetailFooterActions({
  backToList,
  canEdit,
  cancelHref,
  editFormId,
  editHref,
  isEditing,
  onConfirmSave,
  shouldConfirmSave,
}: {
  backToList: string;
  canEdit: boolean;
  cancelHref: string;
  editFormId: string;
  editHref: string;
  isEditing: boolean;
  onConfirmSave: () => void;
  shouldConfirmSave: boolean;
}) {
  return (
    <>
      <Button asChild variant="outline">
        <Link to={isEditing ? cancelHref : backToList}>
          {isEditing ? "Cancelar" : "Volver"}
        </Link>
      </Button>
      <DancerPrimaryFooterAction
        canEdit={canEdit}
        editFormId={editFormId}
        editHref={editHref}
        isEditing={isEditing}
        onConfirmSave={onConfirmSave}
        shouldConfirmSave={shouldConfirmSave}
      />
    </>
  );
}

function DancerPrimaryFooterAction({
  canEdit,
  editFormId,
  editHref,
  isEditing,
  onConfirmSave,
  shouldConfirmSave,
}: {
  canEdit: boolean;
  editFormId: string;
  editHref: string;
  isEditing: boolean;
  onConfirmSave: () => void;
  shouldConfirmSave: boolean;
}) {
  if (!canEdit) {
    return null;
  }

  if (!isEditing) {
    return (
      <Button asChild>
        <Link to={editHref}>
          <Pencil aria-hidden="true" data-icon="inline-start" />
          Editar
        </Link>
      </Button>
    );
  }

  if (shouldConfirmSave) {
    return (
      <Button type="button" onClick={onConfirmSave}>
        <Check aria-hidden="true" data-icon="inline-start" />
        Guardar
      </Button>
    );
  }

  return (
    <Button type="submit" form={editFormId}>
      <Check aria-hidden="true" data-icon="inline-start" />
      Guardar
    </Button>
  );
}

function DancerAlert({
  action,
  children,
  variant = "warning",
}: {
  action?: {
    label: string;
    onClick: () => void;
  };
  children: ReactNode;
  variant?: "destructive" | "info" | "warning";
}) {
  return (
    <Alert variant={variant}>
      <TriangleAlert aria-hidden="true" />
      <AlertDescription>{children}</AlertDescription>
      {action ? (
        <AlertAction className="top-1/2 -translate-y-1/2">
          <Button type="button" variant="link" onClick={action.onClick}>
            {action.label}
          </Button>
        </AlertAction>
      ) : null}
    </Alert>
  );
}

export function InscriptionsSection({
  inscriptions,
  selectedEventId,
}: InscriptionsSectionProps) {
  if (!selectedEventId) {
    return (
      <AdminEmptyState
        title="Sin evento activo"
        description="No hay un evento activo seleccionado para revisar inscripciones."
      />
    );
  }

  if (inscriptions.length === 0) {
    return (
      <AdminEmptyState
        title="Sin inscripciones en el evento activo"
        description="Este bailarín no tiene inscripciones en el evento activo."
      />
    );
  }

  return (
    <div className="rounded-lg border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="px-3">Nombre coreografía</TableHead>
            <TableHead className="px-3">Tipo de grupo</TableHead>
            <TableHead className="px-3">Precio base</TableHead>
            <TableHead className="px-3">Descuento</TableHead>
            <TableHead className="px-3">Subtotal estimado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {inscriptions.map((inscription) => (
            <TableRow key={inscription.id}>
              <TableCell className="px-3">
                {inscription.choreographyName}
              </TableCell>
              <TableCell className="px-3 text-muted-foreground">
                {formatGroupTypeLabel(inscription.groupType)}
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

import { Archive, Info, RotateCcw, TriangleAlert } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link, useNavigation, useSubmit } from "react-router";

import { SubmitButton } from "@/components/shared/action-buttons";
import { AlertStack } from "@/components/shared/alert-stack";
import { ArchivedPersonAlert } from "@/components/shared/archived-person-alert";
import {
  documentTypeEmptyLabel,
  documentTypeOptions,
} from "@/components/shared/document-type-options";
import {
  ReadOnlyDateField,
  ReadOnlyField,
  ReadOnlySelectField,
} from "@/components/shared/read-only-field";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { SelectField } from "@/components/shared/select-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { FieldGroup } from "@/components/ui/field";
import {
  formatDancerIdentificationPendingItemLabel,
  getDancerIdentificationPendingItems,
  getDancerVerificationStatus,
  type DancerIdentificationPendingItem,
} from "@/lib/dancers/verification";
import { useServerActionToast } from "@/lib/shared/toasts";
import { usePortalRecordTitleDetailTransitionStyle } from "@/lib/shared/view-transitions";

import {
  PortalDancerBirthDateField,
  PortalDancerDocumentImageFields,
  PortalDancerTextField,
  usePortalDancerForm,
} from "./form";
import {
  buildPortalDancerDetailViewModel,
  getDocumentImageStateLabel,
  getGeneralActionError,
  getPortalDancerFormValues,
  getPortalDancerStatusFormId,
  portalDancerFormId,
  portalDancerStatusActions,
  type PortalDancerDetailActionData,
  type PortalDancerDetailLoaderData,
  type PortalDancerStatusIntent,
} from "./shared";

export type PortalDancerDetailRouteViewProps = {
  loaderData: PortalDancerDetailLoaderData;
  actionData?: PortalDancerDetailActionData;
  initialStatusDialogIntent?: PortalDancerStatusIntent | null;
};

export function PortalDancerDetailRouteView({
  loaderData,
  actionData,
  initialStatusDialogIntent = null,
}: PortalDancerDetailRouteViewProps) {
  const submit = useSubmit();
  const navigation = useNavigation();
  const formValues = getPortalDancerFormValues({
    actionData,
    dancer: loaderData.dancer,
  });
  const form = usePortalDancerForm({
    submit,
    values: formValues,
  });
  const [statusDialogIntent, setStatusDialogIntent] =
    useState<PortalDancerStatusIntent | null>(initialStatusDialogIntent);
  const verificationStatus = getDancerVerificationStatus(loaderData.dancer);
  const identificationPendingItems = getDancerIdentificationPendingItems(
    loaderData.dancer,
  );
  const viewModel = buildPortalDancerDetailViewModel({
    dancer: loaderData.dancer,
    formValues,
    identificationPendingItems,
    verificationStatus,
  });
  const isSubmitting =
    navigation.state !== "idle" &&
    navigation.formData?.get("intent") === "update-dancer";
  const viewTransitionStyle = usePortalRecordTitleDetailTransitionStyle({
    detailHref: viewModel.detailHref,
    listHref: "/portal/bailarines",
  });

  useServerActionToast(getGeneralActionError(actionData), {
    toastId: "portal-bailarin-detail:error",
  });

  return (
    <>
      <section
        className="flex flex-col gap-6"
        aria-labelledby="bailarin-detail-title"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-1">
            <h1
              id="bailarin-detail-title"
              className="text-xl font-semibold"
              style={viewTransitionStyle}
            >
              {viewModel.title}
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              Actualizá los datos de este bailarín.
            </p>
          </div>
          <ResourceActionsMenu contentClassName="w-40">
            <DropdownMenuItem
              variant={viewModel.statusAction.confirmButtonVariant}
              onSelect={(event) => {
                event.preventDefault();
                setStatusDialogIntent(viewModel.statusAction.intent);
              }}
            >
              {viewModel.statusAction.label}
            </DropdownMenuItem>
          </ResourceActionsMenu>
        </div>

        <PortalDancerAlertsSection
          dancerActive={loaderData.dancer.active}
          identificationPendingItems={viewModel.identificationPendingItems}
          onReactivate={() => {
            setStatusDialogIntent("reactivate-dancer");
          }}
          showsIdentificationAlert={viewModel.showsIdentificationAlert}
          showsPendingVerificationAlert={
            viewModel.showsPendingVerificationAlert
          }
          showsVerifiedIdentityAlert={viewModel.showsVerifiedIdentityAlert}
        />

        <PortalDancerFormSection>
          <CardContent>
            <form
              id={portalDancerFormId}
              method="post"
              encType="multipart/form-data"
              noValidate
              onSubmit={form.handleSubmit}
            >
              <input type="hidden" name="intent" value="update-dancer" />
              <FieldGroup className="grid gap-5 md:grid-cols-2">
                <PortalDancerTextField
                  form={form.form}
                  label="Nombre"
                  name="firstName"
                />
                <PortalDancerTextField
                  form={form.form}
                  label="Apellido"
                  name="lastName"
                />
                {viewModel.isIdentityVerified ? (
                  <ReadOnlyDateField
                    label="Fecha de nacimiento"
                    name="birthDate"
                    value={viewModel.identityFieldValues.birthDate}
                  />
                ) : (
                  <PortalDancerBirthDateField form={form.form} />
                )}
                <div className="hidden md:block" aria-hidden="true" />
                {viewModel.isIdentityVerified ? (
                  <ReadOnlySelectField
                    label="Tipo de documento"
                    name="documentType"
                    options={documentTypeOptions}
                    value={viewModel.identityFieldValues.documentType}
                  />
                ) : (
                  <SelectField
                    allowEmpty
                    control={form.form.control}
                    emptyLabel={documentTypeEmptyLabel}
                    label="Tipo de documento"
                    name="documentType"
                    options={documentTypeOptions}
                    placeholder={documentTypeEmptyLabel}
                  />
                )}
                {viewModel.isIdentityVerified ? (
                  <ReadOnlyField
                    label="Número de documento"
                    name="documentNumber"
                    value={viewModel.identityFieldValues.documentNumber}
                  />
                ) : (
                  <PortalDancerTextField
                    form={form.form}
                    label="Número de documento"
                    name="documentNumber"
                  />
                )}
                {viewModel.isIdentityVerified ? (
                  <>
                    <ReadOnlyField
                      label="Frente del documento"
                      name="documentFrontImageStorageKey"
                      value={
                        viewModel.identityFieldValues
                          .documentFrontImageStorageKey
                      }
                      displayValue={getDocumentImageStateLabel(
                        viewModel.identityFieldValues
                          .documentFrontImageStorageKey,
                      )}
                    />
                    <ReadOnlyField
                      label="Dorso del documento"
                      name="documentBackImageStorageKey"
                      value={
                        viewModel.identityFieldValues
                          .documentBackImageStorageKey
                      }
                      displayValue={getDocumentImageStateLabel(
                        viewModel.identityFieldValues
                          .documentBackImageStorageKey,
                      )}
                    />
                  </>
                ) : (
                  <PortalDancerDocumentImageFields
                    form={form.form}
                    imageUrls={loaderData.documentImageUrls}
                  />
                )}
              </FieldGroup>
            </form>
          </CardContent>
          <CardFooter className="justify-end gap-3 border-0 bg-transparent pt-0">
            <Button asChild variant="outline" size="lg">
              <Link to="/portal/bailarines" viewTransition>
                Volver
              </Link>
            </Button>
            <SubmitButton
              form={portalDancerFormId}
              size="lg"
              isPending={isSubmitting}
            />
          </CardFooter>
        </PortalDancerFormSection>
      </section>

      <PortalDancerStatusDialog
        intent={statusDialogIntent}
        onOpenChange={(open) => {
          if (!open) {
            setStatusDialogIntent(null);
          }
        }}
      />
    </>
  );
}

function PortalDancerAlertsSection({
  dancerActive,
  identificationPendingItems,
  onReactivate,
  showsIdentificationAlert,
  showsPendingVerificationAlert,
  showsVerifiedIdentityAlert,
}: {
  dancerActive: boolean;
  identificationPendingItems: DancerIdentificationPendingItem[];
  onReactivate: () => void;
  showsIdentificationAlert: boolean;
  showsPendingVerificationAlert: boolean;
  showsVerifiedIdentityAlert: boolean;
}) {
  return (
    <section
      aria-labelledby="bailarin-detail-alerts-title"
      className="flex flex-col gap-6"
    >
      <h2 id="bailarin-detail-alerts-title" className="sr-only">
        Alertas de la ficha del bailarín
      </h2>
      <AlertStack>
        {!dancerActive ? (
          <ArchivedPersonAlert
            personLabel="bailarín"
            onReactivate={onReactivate}
          />
        ) : null}
        {showsIdentificationAlert ? (
          <Alert variant="warning">
            <TriangleAlert aria-hidden="true" />
            <AlertDescription>
              {formatIdentificationPendingAlert(identificationPendingItems)}
            </AlertDescription>
          </Alert>
        ) : null}
        {showsPendingVerificationAlert ? (
          <Alert variant="info">
            <Info aria-hidden="true" />
            <AlertDescription>
              La identidad del bailarín está sin verificar.
            </AlertDescription>
          </Alert>
        ) : null}
        {showsVerifiedIdentityAlert ? (
          <Alert variant="info">
            <Info aria-hidden="true" />
            <AlertDescription>
              La identidad del bailarín está verificada. Comunicate con nosotros
              si necesitás realizar algún cambio.
            </AlertDescription>
          </Alert>
        ) : null}
      </AlertStack>
    </section>
  );
}

function PortalDancerFormSection({ children }: { children: ReactNode }) {
  return (
    <section
      aria-labelledby="bailarin-detail-form-title"
      className="flex flex-col"
    >
      <h2 id="bailarin-detail-form-title" className="sr-only">
        Ficha del bailarín
      </h2>
      <Card>{children}</Card>
    </section>
  );
}

function PortalDancerStatusDialog({
  intent,
  onOpenChange,
}: {
  intent: PortalDancerStatusIntent | null;
  onOpenChange: (open: boolean) => void;
}) {
  const action = intent ? portalDancerStatusActions[intent] : null;
  const isOpen = action !== null;
  const dialogFormId = getPortalDancerStatusFormId(intent);

  return (
    <>
      {action ? (
        <div className="sr-only">
          <p>{action.confirmTitle}</p>
          <p>{action.confirmDescription}</p>
        </div>
      ) : null}
      <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
        {action ? (
          <AlertDialogContent
            forceMount
            className="w-[calc(100%-2rem)] max-w-lg gap-4 p-6 sm:max-w-lg"
          >
            <AlertDialogHeader className="flex flex-col items-start gap-1.5 text-left">
              <AlertDialogTitle>{action.confirmTitle}</AlertDialogTitle>
              <AlertDialogDescription>
                {action.confirmDescription}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="m-0 rounded-none border-0 bg-transparent p-0">
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <form id={dialogFormId} method="post">
                <input type="hidden" name="intent" value={action.intent} />
                <Button type="submit" variant={action.confirmButtonVariant}>
                  <PortalDancerStatusActionIcon intent={action.intent} />
                  {action.confirmButtonLabel}
                </Button>
              </form>
            </AlertDialogFooter>
          </AlertDialogContent>
        ) : null}
      </AlertDialog>
    </>
  );
}

function formatIdentificationPendingAlert(
  pendingItems: DancerIdentificationPendingItem[],
) {
  return `${
    pendingItems.length === 1 ? "Falta" : "Faltan"
  } completar ${formatIdentificationPendingItems(
    pendingItems,
  )} para poder verificar la identidad del bailarín.`;
}

function formatIdentificationPendingItems(
  pendingItems: DancerIdentificationPendingItem[],
) {
  return formatList(
    pendingItems.map(formatDancerIdentificationPendingItemLabel),
  );
}

function formatList(items: string[]) {
  if (items.length <= 1) {
    return items[0] ?? "";
  }

  return `${items.slice(0, -1).join(", ")} y ${items.at(-1)}`;
}

function PortalDancerStatusActionIcon({
  intent,
}: {
  intent: PortalDancerStatusIntent;
}) {
  if (intent === "archive-dancer") {
    return <Archive aria-hidden="true" data-icon="inline-start" />;
  }

  return <RotateCcw aria-hidden="true" data-icon="inline-start" />;
}

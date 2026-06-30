import {
  Archive,
  CircleAlert,
  Info,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigation, useSubmit } from "react-router";

import { SubmitButton } from "@/components/shared/action-buttons";
import { AlertStack } from "@/components/shared/alert-stack";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
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
import { getDancerVerificationStatus } from "@/lib/dancers/verification";
import { useServerActionToast } from "@/lib/shared/toasts";
import { usePortalRecordTitleDetailTransitionStyle } from "@/lib/shared/view-transitions";

import {
  PortalDancerBirthDateField,
  PortalDancerDocumentImageFields,
  PortalDancerDocumentTypeField,
  PortalDancerTextField,
  ReadonlyLockedFormField,
  usePortalDancerForm,
} from "./form";
import {
  formatDateOnlyLabel,
  formatDocumentTypeLabel,
  getDocumentImageStateLabel,
  getGeneralActionError,
  getPortalDancerFormValues,
  getPortalDancerStatusAction,
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
    fieldErrors: actionData?.fieldErrors,
    submit,
    values: formValues,
  });
  const [statusDialogIntent, setStatusDialogIntent] =
    useState<PortalDancerStatusIntent | null>(initialStatusDialogIntent);
  const statusAction = getPortalDancerStatusAction(loaderData.dancer.active);
  const verificationStatus = getDancerVerificationStatus(loaderData.dancer);
  const isIdentityVerified = verificationStatus === "verified";
  const identityFieldValues = isIdentityVerified
    ? {
        birthDate: loaderData.dancer.birthDate,
        documentType: loaderData.dancer.documentType ?? "",
        documentNumber: loaderData.dancer.documentNumber ?? "",
      }
    : formValues;
  const showsIdentificationAlert = verificationStatus === "incomplete";
  const showsPendingVerificationAlert = verificationStatus === "unverified";
  const isSubmitting =
    navigation.state !== "idle" &&
    navigation.formData?.get("intent") === "update-dancer";
  const detailHref = `/portal/bailarines/${loaderData.dancer.id}`;
  const viewTransitionStyle = usePortalRecordTitleDetailTransitionStyle({
    detailHref,
    listHref: "/portal/bailarines",
  });
  const title = `${loaderData.dancer.firstName} ${loaderData.dancer.lastName}`;

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
              {title}
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              Actualizá los datos de este bailarín.
            </p>
          </div>
          <ResourceActionsMenu contentClassName="w-40">
            <DropdownMenuItem
              variant={statusAction.confirmButtonVariant}
              onSelect={(event) => {
                event.preventDefault();
                setStatusDialogIntent(statusAction.intent);
              }}
            >
              {statusAction.label}
            </DropdownMenuItem>
          </ResourceActionsMenu>
        </div>

        <AlertStack>
          {!loaderData.dancer.active ? (
            <Alert variant="destructive">
              <CircleAlert aria-hidden="true" />
              <AlertDescription>
                Este bailarín está archivado. Reactivalo para que vuelva a
                aparecer en las listas activas y en próximas selecciones de
                coreografías.
              </AlertDescription>
              <AlertAction className="top-1/2 -translate-y-1/2">
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  onClick={() => {
                    setStatusDialogIntent("reactivate-dancer");
                  }}
                >
                  Reactivar
                </Button>
              </AlertAction>
            </Alert>
          ) : null}
          {showsIdentificationAlert ? (
            <Alert variant="warning">
              <TriangleAlert aria-hidden="true" />
              <AlertDescription>
                Completá los datos e imágenes del documento para poder verificar
                la identidad del bailarín.
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
        </AlertStack>

        <Card>
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
                  error={actionData?.fieldErrors.firstName}
                  label="Nombre"
                  name="firstName"
                />
                <PortalDancerTextField
                  form={form.form}
                  error={actionData?.fieldErrors.lastName}
                  label="Apellido"
                  name="lastName"
                />
                {isIdentityVerified ? (
                  <ReadonlyLockedFormField
                    label="Fecha de nacimiento"
                    name="birthDate"
                    value={identityFieldValues.birthDate}
                    displayValue={formatDateOnlyLabel(
                      identityFieldValues.birthDate,
                    )}
                  />
                ) : (
                  <PortalDancerBirthDateField
                    form={form.form}
                    error={actionData?.fieldErrors.birthDate}
                  />
                )}
                <div className="hidden md:block" aria-hidden="true" />
                {isIdentityVerified ? (
                  <ReadonlyLockedFormField
                    label="Tipo de documento"
                    name="documentType"
                    value={identityFieldValues.documentType}
                    displayValue={formatDocumentTypeLabel(
                      identityFieldValues.documentType,
                    )}
                  />
                ) : (
                  <PortalDancerDocumentTypeField
                    form={form.form}
                    error={actionData?.fieldErrors.documentType}
                  />
                )}
                {isIdentityVerified ? (
                  <ReadonlyLockedFormField
                    label="Número de documento"
                    name="documentNumber"
                    value={identityFieldValues.documentNumber}
                  />
                ) : (
                  <PortalDancerTextField
                    form={form.form}
                    error={actionData?.fieldErrors.documentNumber}
                    label="Número de documento"
                    name="documentNumber"
                  />
                )}
                {isIdentityVerified ? (
                  <>
                    <ReadonlyLockedFormField
                      label="Frente del documento"
                      name="documentFrontImageStorageKey"
                      value={formValues.documentFrontImageStorageKey}
                      displayValue={getDocumentImageStateLabel(
                        formValues.documentFrontImageStorageKey,
                      )}
                    />
                    <ReadonlyLockedFormField
                      label="Dorso del documento"
                      name="documentBackImageStorageKey"
                      value={formValues.documentBackImageStorageKey}
                      displayValue={getDocumentImageStateLabel(
                        formValues.documentBackImageStorageKey,
                      )}
                    />
                  </>
                ) : (
                  <PortalDancerDocumentImageFields
                    form={form.form}
                    formValues={formValues}
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
        </Card>
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

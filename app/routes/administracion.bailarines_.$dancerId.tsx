import { zodResolver } from "@hookform/resolvers/zod";
import {
  Check,
  CircleAlert,
  ExternalLink,
  Lock,
  Pencil,
  TriangleAlert,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useId, useState } from "react";
import {
  Controller,
  type FieldPath,
  useForm,
  type UseFormReturn,
} from "react-hook-form";
import { Link, redirect, useActionData } from "react-router";
import { z } from "zod";

import {
  AdminResourceLayout,
  AdminEmptyState,
} from "@/components/admin/resource-layout";
import type { AdminRouteHandle } from "@/components/admin/shell";
import {
  DataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { DateOnlyField } from "@/components/shared/date-only-field";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { Alert, AlertAction, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
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
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  adminDancerCorrectionReasonMessage,
  adminDancerNotFoundMessage,
  type AdminDancerIdentificationStatus,
} from "@/lib/admin/dancers/dancers.shared";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";
import {
  findAdministrativeDancer,
  type AdministrativeDancerFieldErrors,
  type AdministrativeDancerStatusInput,
  type AdministrativeDancerUpdateInput,
  setAdministrativeDancerActiveState,
  updateAdministrativeDancer,
  verifyAdministrativeDancerIdentity,
} from "@/lib/admin/dancers/dancers.server";
import { loadAdminEventContext } from "@/lib/admin/event-context.server";
import {
  requireAdminUser,
  requireInternalUser,
} from "@/lib/auth/internal-access.server";
import { getFieldErrors } from "@/lib/shared/form-validation";
import {
  createValidatedNativeSubmitHandler,
  requiredFieldMessage,
  useApplyServerFieldErrors,
} from "@/lib/shared/forms";
import { createDefaultDancerDocumentStorage } from "@/lib/storage/dancer-documents.server";
import { useServerActionToast } from "@/lib/shared/toasts";
import type { RouteNotificationKey } from "@/lib/shared/route-notification-toasts";

import type { Route } from "./+types/administracion.bailarines_.$dancerId";

type LoaderData = Awaited<ReturnType<typeof loader>>;
type ActionData = Awaited<ReturnType<typeof action>>;
type DancerActionError = {
  status: "error";
  message: string;
  fieldErrors: AdministrativeDancerFieldErrors;
  values: AdministrativeDancerUpdateInput | AdministrativeDancerStatusInput;
};
type DancerFormReturn = UseFormReturn<
  AdministrativeDancerUpdateInput,
  unknown,
  AdministrativeDancerUpdateInput
>;
type DancerStatusFormReturn = UseFormReturn<
  AdministrativeDancerStatusInput,
  unknown,
  AdministrativeDancerStatusInput
>;
type DancerInscription = LoaderData["dancer"]["inscriptions"][number];
type DancerDialogIntent =
  | "archive-dancer"
  | "reactivate-dancer"
  | "save"
  | "verify"
  | null;
type DancerRouteNotification = Extract<
  RouteNotificationKey,
  | "bailarin-archivado"
  | "bailarin-guardado"
  | "bailarin-guardado-requiere-verificacion"
  | "bailarin-reactivado"
  | "bailarin-verificado"
>;

type AdministracionBailarinDetalleRouteProps = {
  loaderData: LoaderData;
  actionData?: ActionData;
};
export type InscriptionsSectionProps = {
  inscriptions: LoaderData["dancer"]["inscriptions"];
  selectedEventId: string | null;
};

const moneyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0,
});
const inscriptionColumns: DataTableColumn<DancerInscription>[] = [
  {
    id: "choreography",
    header: "Nombre coreografía",
    cell: (inscription) => inscription.choreographyName,
    filterValue: (inscription) => inscription.choreographyName,
  },
  {
    id: "groupType",
    header: "Tipo de grupo",
    cell: (inscription) => formatGroupTypeLabel(inscription.groupType),
    filterValue: (inscription) => formatGroupTypeLabel(inscription.groupType),
  },
  {
    id: "basePrice",
    header: "Precio base",
    cell: (inscription) => formatMoney(inscription.basePriceInCents),
  },
  {
    id: "discount",
    header: "Descuento",
    cell: (inscription) => formatMoney(inscription.discountInCents),
  },
  {
    id: "estimatedSubtotal",
    header: "Subtotal estimado",
    cell: (inscription) => formatMoney(inscription.estimatedSubtotalInCents),
  },
];

const correctionReasonMaxLength = 500;
const correctionReasonMinLength = 10;
const noDocumentTypeSelectValue = "sin-documento";
const dancerFieldNames = [
  "firstName",
  "lastName",
  "birthDate",
  "documentType",
  "documentNumber",
  "documentFrontImageStorageKey",
  "documentBackImageStorageKey",
  "correctionReason",
] as const satisfies ReadonlyArray<keyof AdministrativeDancerFieldErrors>;
const emptyDancerFieldErrors: AdministrativeDancerFieldErrors = {};

export const meta: Route.MetaFunction = () => [
  { title: "Bailarín | Panel de administración | En Escena" },
];

export const handle = {
  adminBreadcrumbs: [
    { label: "Bailarines", to: "/administracion/bailarines" },
    (match) => {
      const data = match.data as LoaderData | undefined;
      const dancer = data?.dancer;
      return dancer
        ? { label: `${dancer.firstName} ${dancer.lastName}` }
        : null;
    },
  ],
} satisfies AdminRouteHandle;

export async function loader({ request, params }: Route.LoaderArgs) {
  const user = await requireInternalUser(request, ["admin", "auditor"]);
  const eventContext = await loadAdminEventContext(request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  const dancerId = params.dancerId;

  if (!dancerId) {
    throw new Response(adminDancerNotFoundMessage, { status: 404 });
  }

  const dancer = await findAdministrativeDancer({
    dancerId,
    selectedEventId: eventContext.selectedEventId,
  });

  if (!dancer) {
    throw new Response(adminDancerNotFoundMessage, { status: 404 });
  }

  const url = new URL(request.url);

  return {
    canEdit: user.role === "admin",
    selectedEventId: eventContext.selectedEventId,
    dancer,
    documentImageUrls: await loadDancerDocumentImageUrls(dancer),
    backToList: buildBackToListHref(request.url),
    editHref: buildModeHref(url, dancerId, "editar"),
    cancelHref: buildModeHref(url, dancerId, null),
    isEditing:
      user.role === "admin" && url.searchParams.get("modo") === "editar",
  };
}

async function loadDancerDocumentImageUrls(
  dancer: NonNullable<Awaited<ReturnType<typeof findAdministrativeDancer>>>,
) {
  if (
    !dancer.documentFrontImageStorageKey &&
    !dancer.documentBackImageStorageKey
  ) {
    return {
      back: null,
      front: null,
    };
  }

  try {
    const storage = createDefaultDancerDocumentStorage();

    return {
      back: await createOptionalDocumentImageSignedUrl(
        storage,
        dancer.documentBackImageStorageKey,
      ),
      front: await createOptionalDocumentImageSignedUrl(
        storage,
        dancer.documentFrontImageStorageKey,
      ),
    };
  } catch {
    return {
      back: null,
      front: null,
    };
  }
}

async function createOptionalDocumentImageSignedUrl(
  storage: ReturnType<typeof createDefaultDancerDocumentStorage>,
  storageKey: string | null,
) {
  if (!storageKey) {
    return null;
  }

  try {
    return await storage.createDocumentImageSignedUrl(storageKey);
  } catch {
    return null;
  }
}

export async function action({ request, params }: Route.ActionArgs) {
  const adminUser = await requireAdminUser(request);
  const eventContext = await loadAdminEventContext(request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  const dancerId = params.dancerId;

  if (!dancerId) {
    throw new Response(adminDancerNotFoundMessage, { status: 404 });
  }

  const formData = await request.formData();
  const intent = readFormString(formData, "intent");
  const dancer = await findAdministrativeDancer({
    dancerId,
    selectedEventId: eventContext.selectedEventId,
  });

  if (!dancer) {
    throw new Response(adminDancerNotFoundMessage, { status: 404 });
  }

  if (intent === "archive-dancer" || intent === "reactivate-dancer") {
    const values = readDancerStatusValues(formData);
    const parsed = buildDancerStatusSchema(
      dancer.correctionReasonRequired,
    ).safeParse(values);

    if (!parsed.success) {
      return buildDancerActionError(
        "Revisá los campos marcados.",
        getFieldErrors(parsed.error, dancerFieldNames),
        values,
      );
    }

    const result = await setAdministrativeDancerActiveState({
      action: intent === "archive-dancer" ? "archive" : "reactivate",
      adminUserId: adminUser.id,
      dancerId,
      selectedEventId: eventContext.selectedEventId,
      correctionReason: parsed.data.correctionReason,
    });

    if (!result.ok) {
      return buildDancerActionError(result.message, result.fieldErrors, values);
    }

    throw redirect(
      buildDetailNotificationHref(
        request.url,
        dancerId,
        intent === "archive-dancer"
          ? "bailarin-archivado"
          : "bailarin-reactivado",
      ),
    );
  }

  if (intent === "verify-dancer-identity") {
    await verifyAdministrativeDancerIdentity({
      adminUserId: adminUser.id,
      dancerId,
      selectedEventId: eventContext.selectedEventId,
    });

    throw redirect(
      buildDetailNotificationHref(request.url, dancerId, "bailarin-verificado"),
    );
  }

  const submittedValues = readDancerUpdateValues(formData);
  const values = {
    ...submittedValues,
    documentBackImageStorageKey: dancer.documentBackImageStorageKey ?? "",
    documentFrontImageStorageKey: dancer.documentFrontImageStorageKey ?? "",
  };
  const parsed = buildDancerUpdateSchema(
    dancer.correctionReasonRequired,
  ).safeParse(values);

  if (!parsed.success) {
    return buildDancerActionError(
      "Revisá los campos marcados.",
      getFieldErrors(parsed.error, dancerFieldNames),
      values,
    );
  }

  const result = await updateAdministrativeDancer({
    adminUserId: adminUser.id,
    dancerId,
    selectedEventId: eventContext.selectedEventId,
    values: parsed.data,
  });

  if (!result.ok) {
    return buildDancerActionError(
      result.message,
      result.fieldErrors,
      result.values,
    );
  }

  throw redirect(
    buildDetailNotificationHref(
      request.url,
      dancerId,
      result.verificationInvalidated
        ? "bailarin-guardado-requiere-verificacion"
        : "bailarin-guardado",
    ),
  );
}

export function AdministracionBailarinDetalleRouteView({
  loaderData,
  actionData: actionDataOverride,
}: AdministracionBailarinDetalleRouteProps) {
  const actionData =
    actionDataOverride?.status === "error" ? actionDataOverride : undefined;

  useServerActionToast(actionData, {
    toastId: "admin-dancer-detail:error",
  });

  const dancer = loaderData.dancer;
  const isEditing =
    loaderData.canEdit && (loaderData.isEditing || Boolean(actionData));
  const submittedEditValues = isDancerUpdateValues(actionData?.values)
    ? actionData.values
    : null;
  const editFieldErrors = submittedEditValues
    ? actionData?.fieldErrors
    : emptyDancerFieldErrors;
  const statusFieldErrors =
    !submittedEditValues && actionData?.fieldErrors
      ? actionData.fieldErrors
      : emptyDancerFieldErrors;
  const editValues = {
    firstName: submittedEditValues?.firstName ?? dancer.firstName,
    lastName: submittedEditValues?.lastName ?? dancer.lastName,
    birthDate: submittedEditValues?.birthDate ?? dancer.birthDate,
    documentType:
      submittedEditValues?.documentType ?? dancer.documentType ?? "",
    documentNumber:
      submittedEditValues?.documentNumber ?? dancer.documentNumber ?? "",
    documentFrontImageStorageKey:
      submittedEditValues?.documentFrontImageStorageKey ??
      dancer.documentFrontImageStorageKey ??
      "",
    documentBackImageStorageKey:
      submittedEditValues?.documentBackImageStorageKey ??
      dancer.documentBackImageStorageKey ??
      "",
    correctionReason: submittedEditValues?.correctionReason ?? "",
  };
  const statusValues = {
    correctionReason:
      !submittedEditValues && actionData?.values.correctionReason
        ? actionData.values.correctionReason
        : "",
  };
  const editForm = useDancerEditForm({
    correctionReasonRequired: dancer.correctionReasonRequired,
    fieldErrors: editFieldErrors,
    values: editValues,
  });
  const statusForm = useDancerStatusForm({
    correctionReasonRequired: dancer.correctionReasonRequired,
    fieldErrors: statusFieldErrors,
    values: statusValues,
  });
  const statusAction = dancer.active
    ? {
        description:
          "Archivá este Bailarín para que deje de aparecer en futuras selecciones del portal sin desvincular sus coreografías existentes.",
        intent: "archive-dancer" as const,
        label: "Archivar",
      }
    : {
        description:
          "Reactivá este Bailarín para que vuelva a aparecer en futuras selecciones del portal.",
        intent: "reactivate-dancer" as const,
        label: "Reactivar Bailarín",
      };
  const canVerifyIdentity =
    loaderData.canEdit &&
    hasDancerVerificationMinimumData(dancer) &&
    dancer.identificationStatus !== "verified";
  const initialDialogIntent = getInitialDialogIntent({
    actionData,
    correctionReasonRequired: dancer.correctionReasonRequired,
    hasSubmittedEditValues: submittedEditValues !== null,
    statusIntent: statusAction.intent,
  });
  const [dialogIntent, setDialogIntent] =
    useState<DancerDialogIntent>(initialDialogIntent);
  const editFormId = "admin-dancer-edit-form";
  const statusFormId = "admin-dancer-status-form";
  const verifyFormId = "admin-dancer-verify-form";
  const watchedBirthDate = editForm.form.watch("birthDate");
  const birthDateMayNeedRecalculation =
    isEditing &&
    dancer.participatedInAnyEvent &&
    watchedBirthDate !== dancer.birthDate;
  const shouldConfirmSave =
    dancer.correctionReasonRequired || birthDateMayNeedRecalculation;

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Detalle bailarín"
      description="Consultá y corregí la información administrativa de este bailarín."
      requireSelectedEvent={false}
      headerAction={
        loaderData.canEdit ? (
          <ResourceActionsMenu>
            {canVerifyIdentity ? (
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  setDialogIntent("verify");
                }}
              >
                Verificar
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
              variant={
                statusAction.intent === "archive-dancer"
                  ? "destructive"
                  : "default"
              }
              onSelect={(event) => {
                event.preventDefault();
                setDialogIntent(statusAction.intent);
              }}
            >
              {statusAction.label}
            </DropdownMenuItem>
          </ResourceActionsMenu>
        ) : null
      }
    >
      <section className="flex flex-col gap-6">
        <DancerStatusAlerts
          active={dancer.active}
          canVerifyIdentity={canVerifyIdentity}
          identificationStatus={dancer.identificationStatus}
          onVerifyIdentity={() => {
            setDialogIntent("verify");
          }}
        />

        <Card>
          <CardContent>
            <form
              id={editFormId}
              method="post"
              noValidate
              onSubmit={editForm.handleSubmit}
              className="flex flex-col gap-6"
            >
              <input type="hidden" name="intent" value="update-dancer" />
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

              <Tabs defaultValue="identificacion">
                <TabsList variant="line">
                  <TabsTrigger value="identificacion">
                    Identificación
                  </TabsTrigger>
                  <TabsTrigger value="inscripciones">Inscripciones</TabsTrigger>
                </TabsList>
                <TabsContent value="identificacion" className="pt-2">
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
                          url={loaderData.documentImageUrls.front}
                        />
                        <ReadOnlyDocumentImageField
                          label="Imagen dorso del documento"
                          name="documentBackImageStorageKey"
                          storageKey={dancer.documentBackImageStorageKey}
                          url={loaderData.documentImageUrls.back}
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
                          url={loaderData.documentImageUrls.front}
                        />
                        <ReadOnlyDocumentImageField
                          label="Imagen dorso del documento"
                          storageKey={dancer.documentBackImageStorageKey}
                          url={loaderData.documentImageUrls.back}
                        />
                      </>
                    )}
                  </FieldGroup>
                </TabsContent>
                <TabsContent value="inscripciones" className="pt-2">
                  <InscriptionsSection
                    inscriptions={dancer.inscriptions}
                    selectedEventId={loaderData.selectedEventId}
                  />
                </TabsContent>
              </Tabs>
            </form>
          </CardContent>
          <CardFooter className="justify-end gap-3 border-0 bg-transparent pt-0">
            {isEditing ? (
              <Button asChild variant="outline" size="lg">
                <Link to={loaderData.cancelHref}>Cancelar</Link>
              </Button>
            ) : (
              <Button asChild variant="outline" size="lg">
                <Link to={loaderData.backToList}>Volver</Link>
              </Button>
            )}
            {loaderData.canEdit ? (
              isEditing ? (
                shouldConfirmSave ? (
                  <Button
                    type="button"
                    size="lg"
                    onClick={() => {
                      setDialogIntent("save");
                    }}
                  >
                    <Check aria-hidden="true" data-icon="inline-start" />
                    Guardar
                  </Button>
                ) : (
                  <Button type="submit" form={editFormId} size="lg">
                    <Check aria-hidden="true" data-icon="inline-start" />
                    Guardar
                  </Button>
                )
              ) : (
                <Button asChild size="lg">
                  <Link to={loaderData.editHref}>
                    <Pencil aria-hidden="true" data-icon="inline-start" />
                    Editar
                  </Link>
                </Button>
              )
            ) : null}
          </CardFooter>
        </Card>

        <AlertDialog
          open={dialogIntent === "save"}
          onOpenChange={(open) => {
            if (!open) {
              setDialogIntent(null);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Guardar cambios?</AlertDialogTitle>
              {dancer.correctionReasonRequired ? (
                <AlertDialogDescription>
                  Este bailarín requiere un motivo de corrección para guardar
                  los cambios.
                </AlertDialogDescription>
              ) : (
                <AlertDialogDescription>
                  Confirmá los cambios antes de guardarlos.
                </AlertDialogDescription>
              )}
            </AlertDialogHeader>
            {birthDateMayNeedRecalculation ? (
              <Alert variant="warning">
                <TriangleAlert aria-hidden="true" />
                <AlertDescription>
                  Si cambiás la fecha de nacimiento, las coreografías vinculadas
                  pueden requerir recalcular categoría desde el flujo de
                  Coreografías.
                </AlertDescription>
              </Alert>
            ) : null}
            {dancer.correctionReasonRequired ? (
              <DancerCorrectionReasonField
                form={editForm.form}
                formId={editFormId}
                required={true}
              />
            ) : null}
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction asChild>
                <Button type="submit" form={editFormId}>
                  Guardar
                </Button>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog
          open={dialogIntent === statusAction.intent}
          onOpenChange={(open) => {
            if (!open) {
              setDialogIntent(null);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {statusAction.intent === "archive-dancer"
                  ? "¿Archivar bailarín?"
                  : "¿Reactivar bailarín?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {statusAction.description}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <form
              id={statusFormId}
              method="post"
              noValidate
              onSubmit={statusForm.handleSubmit}
            >
              <input type="hidden" name="intent" value={statusAction.intent} />
              {dancer.correctionReasonRequired ? (
                <DancerCorrectionReasonField
                  form={statusForm.form}
                  formId={statusFormId}
                  required={true}
                />
              ) : null}
            </form>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                asChild
                variant={
                  statusAction.intent === "archive-dancer"
                    ? "destructive"
                    : "default"
                }
              >
                <Button type="submit" form={statusFormId}>
                  {statusAction.label}
                </Button>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog
          open={dialogIntent === "verify"}
          onOpenChange={(open) => {
            if (!open) {
              setDialogIntent(null);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Verificar?</AlertDialogTitle>
              <AlertDialogDescription>
                Confirmá la verificación administrativa de la identidad de este
                bailarín.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <form id={verifyFormId} method="post">
              <input
                type="hidden"
                name="intent"
                value="verify-dancer-identity"
              />
            </form>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction asChild>
                <Button type="submit" form={verifyFormId}>
                  Verificar
                </Button>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>
    </AdminResourceLayout>
  );
}

export default function AdministracionBailarinDetalleRoute({
  loaderData,
}: AdministracionBailarinDetalleRouteProps) {
  const actionData = useActionData<typeof action>();

  return (
    <AdministracionBailarinDetalleRouteView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}

function getInitialDialogIntent({
  actionData,
  correctionReasonRequired,
  hasSubmittedEditValues,
  statusIntent,
}: {
  actionData?: DancerActionError;
  correctionReasonRequired: boolean;
  hasSubmittedEditValues: boolean;
  statusIntent: Exclude<DancerDialogIntent, "save" | "verify" | null>;
}): DancerDialogIntent {
  if (hasSubmittedEditValues && correctionReasonRequired) {
    return "save";
  }

  if (actionData && !hasSubmittedEditValues) {
    return statusIntent;
  }

  return null;
}

function DancerStatusAlerts({
  active,
  canVerifyIdentity,
  identificationStatus,
  onVerifyIdentity,
}: {
  active: boolean;
  canVerifyIdentity: boolean;
  identificationStatus: AdminDancerIdentificationStatus;
  onVerifyIdentity: () => void;
}) {
  const identificationAlert = getIdentificationAlert(identificationStatus);
  const identificationAlertVariant =
    identificationStatus === "pending-verification" ? "info" : "warning";

  if (active && !identificationAlert) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3">
      {!active ? (
        <DancerAlert icon={CircleAlert} variant="destructive">
          Este bailarín está archivado.
        </DancerAlert>
      ) : null}
      {identificationAlert ? (
        <DancerAlert
          variant={identificationAlertVariant}
          action={
            canVerifyIdentity
              ? {
                  label: "Verificar",
                  onClick: onVerifyIdentity,
                }
              : undefined
          }
        >
          {identificationAlert}
        </DancerAlert>
      ) : null}
    </div>
  );
}

function DancerAlert({
  action,
  children,
  icon: Icon = TriangleAlert,
  variant = "warning",
}: {
  action?: {
    label: string;
    onClick: () => void;
  };
  children: ReactNode;
  icon?: typeof TriangleAlert;
  variant?: "destructive" | "info" | "warning";
}) {
  return (
    <Alert variant={variant}>
      <Icon aria-hidden="true" />
      <AlertDescription>{children}</AlertDescription>
      {action ? (
        <AlertAction className="top-1/2 -translate-y-1/2">
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={action.onClick}
          >
            {action.label}
          </Button>
        </AlertAction>
      ) : null}
    </Alert>
  );
}

function getIdentificationAlert(
  identificationStatus: AdminDancerIdentificationStatus,
) {
  switch (identificationStatus) {
    case "incomplete":
      return "Faltan datos de identificación para completar la verificación.";
    case "missing-images":
      return "Faltan imágenes del documento para completar la verificación.";
    case "pending-verification":
      return "La documentación está lista para verificar la identidad del bailarín.";
    case "verified":
      return "La identidad fue verificada. Si corregís datos o imágenes, este bailarín volverá a no verificado.";
  }
}

function useDancerEditForm({
  correctionReasonRequired,
  fieldErrors = emptyDancerFieldErrors,
  values,
}: {
  correctionReasonRequired: boolean;
  fieldErrors?: AdministrativeDancerFieldErrors;
  values: AdministrativeDancerUpdateInput;
}) {
  const form = useForm<
    AdministrativeDancerUpdateInput,
    unknown,
    AdministrativeDancerUpdateInput
  >({
    defaultValues: values,
    mode: "onSubmit",
    resolver: zodResolver(buildDancerUpdateSchema(correctionReasonRequired)),
  });

  useEffect(() => {
    form.reset(values);
  }, [
    form,
    values.birthDate,
    values.correctionReason,
    values.documentBackImageStorageKey,
    values.documentFrontImageStorageKey,
    values.documentNumber,
    values.documentType,
    values.firstName,
    values.lastName,
  ]);

  useApplyServerFieldErrors(form, fieldErrors);

  return { form, handleSubmit: createValidatedNativeSubmitHandler(form) };
}

function useDancerStatusForm({
  correctionReasonRequired,
  fieldErrors = emptyDancerFieldErrors,
  values,
}: {
  correctionReasonRequired: boolean;
  fieldErrors?: AdministrativeDancerFieldErrors;
  values: AdministrativeDancerStatusInput;
}) {
  const form = useForm<
    AdministrativeDancerStatusInput,
    unknown,
    AdministrativeDancerStatusInput
  >({
    defaultValues: values,
    mode: "onSubmit",
    resolver: zodResolver(buildDancerStatusSchema(correctionReasonRequired)),
  });

  useEffect(() => {
    form.reset(values);
  }, [form, values.correctionReason]);

  useApplyServerFieldErrors(form, fieldErrors);

  return { form, handleSubmit: createValidatedNativeSubmitHandler(form) };
}

function DancerTextField({
  form,
  label,
  name,
}: {
  form: DancerFormReturn;
  label: string;
  name:
    | "documentBackImageStorageKey"
    | "documentFrontImageStorageKey"
    | "documentNumber"
    | "firstName"
    | "lastName";
}) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <Controller
      control={form.control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.error ? true : undefined}>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          <FieldContent>
            <Input
              id={id}
              aria-invalid={fieldState.error ? true : undefined}
              aria-describedby={fieldState.error ? errorId : undefined}
              autoComplete="off"
              {...field}
            />
            <FieldError id={errorId}>{fieldState.error?.message}</FieldError>
          </FieldContent>
        </Field>
      )}
    />
  );
}

function DancerBirthDateField({
  className,
  form,
}: {
  className?: string;
  form: DancerFormReturn;
}) {
  const id = useId();

  return (
    <Controller
      control={form.control}
      name="birthDate"
      render={({ field, fieldState }) => (
        <DateOnlyField
          className={className}
          id={id}
          label="Fecha de nacimiento"
          name={field.name}
          defaultValue={field.value}
          error={fieldState.error?.message}
          onBlur={field.onBlur}
          onValueChange={field.onChange}
          value={field.value}
        />
      )}
    />
  );
}

function ReadOnlyDateField({
  className,
  value,
}: {
  className?: string;
  value: string;
}) {
  return (
    <ReadOnlyField
      className={className}
      label="Fecha de nacimiento"
      value={value}
      displayValue={formatDateOnlyLabel(value)}
    />
  );
}

function DancerDocumentTypeField({ form }: { form: DancerFormReturn }) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <Controller
      control={form.control}
      name="documentType"
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.error ? true : undefined}>
          <FieldLabel htmlFor={id}>Tipo de documento</FieldLabel>
          <FieldContent>
            <Select
              value={field.value || noDocumentTypeSelectValue}
              onValueChange={(value) => {
                field.onChange(
                  value === noDocumentTypeSelectValue ? "" : value,
                );
              }}
            >
              <input type="hidden" name={field.name} value={field.value} />
              <SelectTrigger
                id={id}
                aria-invalid={fieldState.error ? true : undefined}
                aria-describedby={fieldState.error ? errorId : undefined}
                className="w-full"
              >
                <SelectValue placeholder="Sin documento" />
              </SelectTrigger>
              <SelectContent align="start" position="popper" side="bottom">
                <SelectItem value={noDocumentTypeSelectValue}>
                  Sin documento
                </SelectItem>
                <SelectItem value="dni">DNI</SelectItem>
                <SelectItem value="passport">Pasaporte</SelectItem>
                <SelectItem value="other">Otro</SelectItem>
              </SelectContent>
            </Select>
            <FieldError id={errorId}>{fieldState.error?.message}</FieldError>
          </FieldContent>
        </Field>
      )}
    />
  );
}

function DancerCorrectionReasonField<
  TFieldValues extends AdministrativeDancerStatusInput,
>({
  form,
  formId,
  required,
}: {
  form: UseFormReturn<TFieldValues, unknown, TFieldValues>;
  formId?: string;
  required: boolean;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  return (
    <Controller
      control={form.control}
      name={"correctionReason" as FieldPath<TFieldValues>}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.error ? true : undefined}>
          <FieldLabel htmlFor={id}>Motivo de corrección</FieldLabel>
          <FieldContent>
            <Textarea
              id={id}
              aria-invalid={fieldState.error ? true : undefined}
              aria-describedby={
                fieldState.error ? `${hintId} ${errorId}` : hintId
              }
              form={formId}
              {...field}
            />
            <FieldDescription id={hintId}>
              {required
                ? "Obligatorio entre 10 y 500 caracteres para este Bailarín."
                : "Opcional. Si lo completás, usá entre 10 y 500 caracteres."}
            </FieldDescription>
            <FieldError id={errorId}>{fieldState.error?.message}</FieldError>
          </FieldContent>
        </Field>
      )}
    />
  );
}

function buildDancerUpdateSchema(correctionReasonRequired: boolean) {
  return z
    .object({
      firstName: z.string().trim().min(1, requiredFieldMessage),
      lastName: z.string().trim().min(1, requiredFieldMessage),
      birthDate: z
        .string()
        .trim()
        .min(1, requiredFieldMessage)
        .superRefine((value, context) => {
          if (value.length === 0) {
            return;
          }

          if (!isDateOnly(value)) {
            context.addIssue({
              code: "custom",
              message: "Usá una fecha válida.",
            });
            return;
          }

          if (isFutureDateOnly(value)) {
            context.addIssue({
              code: "custom",
              message: "La fecha de nacimiento no puede ser futura.",
            });
          }
        }),
      documentType: z.string().trim(),
      documentNumber: z.string().trim(),
      documentFrontImageStorageKey: z.string().trim(),
      documentBackImageStorageKey: z.string().trim(),
      correctionReason: buildCorrectionReasonSchema(correctionReasonRequired),
    })
    .superRefine((values, context) => {
      validateDocumentPair(values.documentType, values.documentNumber, context);
    });
}

function buildDancerStatusSchema(correctionReasonRequired: boolean) {
  return z.object({
    correctionReason: buildCorrectionReasonSchema(correctionReasonRequired),
  });
}

function buildCorrectionReasonSchema(required: boolean) {
  return z
    .string()
    .trim()
    .superRefine((value, context) => {
      if (value.length === 0) {
        if (required) {
          context.addIssue({
            code: "custom",
            message: adminDancerCorrectionReasonMessage,
          });
        }

        return;
      }

      if (
        value.length < correctionReasonMinLength ||
        value.length > correctionReasonMaxLength
      ) {
        context.addIssue({
          code: "custom",
          message: adminDancerCorrectionReasonMessage,
        });
      }
    });
}

function validateDocumentPair(
  documentType: string,
  documentNumber: string,
  context: z.RefinementCtx,
) {
  if (!documentType && !documentNumber) {
    return;
  }

  if (!documentType) {
    context.addIssue({
      code: "custom",
      message: "Seleccioná el tipo de documento.",
      path: ["documentType"],
    });
  }

  if (!documentNumber) {
    context.addIssue({
      code: "custom",
      message: "Ingresá el número de documento.",
      path: ["documentNumber"],
    });
  }

  if (!documentType || !documentNumber) {
    return;
  }

  if (!isDocumentType(documentType)) {
    context.addIssue({
      code: "custom",
      message: "Seleccioná un tipo de documento válido.",
      path: ["documentType"],
    });

    return;
  }

  if (documentType !== "dni") {
    return;
  }

  const normalizedDni = documentNumber.replace(/[.\s-]+/g, "");

  if (!/^\d+$/.test(normalizedDni)) {
    context.addIssue({
      code: "custom",
      message: "Ingresá un DNI válido usando solo números.",
      path: ["documentNumber"],
    });
  }
}

function isDocumentType(value: string): value is "dni" | "other" | "passport" {
  return value === "dni" || value === "passport" || value === "other";
}

function isDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  return parsed.toISOString().slice(0, 10) === value;
}

function isFutureDateOnly(value: string) {
  const today = new Date().toISOString().slice(0, 10);

  return value > today;
}

function ReadOnlyField({
  className,
  displayValue,
  hiddenValue,
  label,
  name,
  value,
}: {
  className?: string;
  displayValue?: string;
  hiddenValue?: string;
  label: string;
  name?: string;
  value: string;
}) {
  const id = useId();

  return (
    <Field className={className} data-disabled>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <FieldContent>
        {name ? (
          <input type="hidden" name={name} value={hiddenValue ?? value} />
        ) : null}
        <div className="relative">
          <Input
            id={id}
            value={displayValue ?? value}
            disabled
            readOnly
            className="pr-9"
          />
          <Lock
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-3 size-3 -translate-y-1/2 text-muted-foreground"
          />
        </div>
      </FieldContent>
    </Field>
  );
}

function ReadOnlyDocumentImageField({
  label,
  name,
  storageKey,
  url,
}: {
  label: string;
  name?: "documentBackImageStorageKey" | "documentFrontImageStorageKey";
  storageKey: string | null;
  url: string | null;
}) {
  const id = useId();
  const hasImage = Boolean(storageKey);

  return (
    <Field data-disabled>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <FieldContent>
        {name ? (
          <input type="hidden" name={name} value={storageKey ?? ""} />
        ) : null}
        <div className="relative">
          <div
            id={id}
            className="flex h-8 w-full min-w-0 items-center rounded-lg border border-input bg-input/50 px-2.5 py-1 pr-9 text-base md:text-sm opacity-50"
          >
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-w-0 items-center gap-1.5 text-primary underline-offset-4 hover:underline"
              >
                <ExternalLink aria-hidden="true" className="size-3.5" />
                <span className="truncate">Abrir imagen</span>
              </a>
            ) : (
              <span className="truncate">
                {hasImage ? "Imagen no disponible" : "Sin imagen"}
              </span>
            )}
          </div>
          <Lock
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-3 size-3 -translate-y-1/2 text-muted-foreground"
          />
        </div>
      </FieldContent>
    </Field>
  );
}

function formatDateOnlyLabel(value: string) {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return value;
  }

  const monthNames = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ];

  return `${day} de ${monthNames[month - 1]} de ${year}`;
}

function formatDancerDocumentType(
  documentType: "dni" | "other" | "passport" | null,
) {
  switch (documentType) {
    case "dni":
      return "DNI";
    case "passport":
      return "Pasaporte";
    case "other":
      return "Otro";
    default:
      return "Sin documento";
  }
}

function hasDancerVerificationMinimumData(dancer: LoaderData["dancer"]) {
  return Boolean(
    dancer.birthDate && dancer.documentType && dancer.documentNumber,
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
    <DataTable
      mode="client"
      rows={inscriptions}
      columns={inscriptionColumns}
      getRowKey={(inscription) => inscription.id}
      searchPlaceholder="Buscar coreografía"
      textFilterColumnId="choreography"
    />
  );
}

function formatMoney(valueInCents: number | null) {
  if (valueInCents === null) {
    return "Sin precio";
  }

  return moneyFormatter.format(valueInCents / 100);
}

function buildBackToListHref(requestUrl: string) {
  const url = new URL(requestUrl);
  const searchParams = new URLSearchParams(url.search);

  searchParams.delete("modo");
  searchParams.delete("evento");
  searchParams.delete("notificacion");
  const search = searchParams.toString();

  return `/administracion/bailarines${search.length > 0 ? `?${search}` : ""}`;
}

function buildModeHref(url: URL, dancerId: string, mode: "editar" | null) {
  const searchParams = new URLSearchParams(url.search);

  searchParams.delete("evento");
  searchParams.delete("notificacion");

  if (mode === null) {
    searchParams.delete("modo");
  } else {
    searchParams.set("modo", mode);
  }

  const search = searchParams.toString();

  return `/administracion/bailarines/${dancerId}${
    search.length > 0 ? `?${search}` : ""
  }`;
}

function buildDetailNotificationHref(
  requestUrl: string,
  dancerId: string,
  notification: DancerRouteNotification,
) {
  const url = new URL(requestUrl);
  const searchParams = new URLSearchParams(url.search);

  searchParams.delete("modo");
  searchParams.delete("evento");
  searchParams.delete("notificacion");
  searchParams.set("notificacion", notification);

  return `/administracion/bailarines/${dancerId}?${searchParams.toString()}`;
}

function readDancerStatusValues(
  formData: FormData,
): AdministrativeDancerStatusInput {
  return {
    correctionReason: readFormString(formData, "correctionReason"),
  };
}

function readDancerUpdateValues(
  formData: FormData,
): AdministrativeDancerUpdateInput {
  return {
    firstName: readFormString(formData, "firstName"),
    lastName: readFormString(formData, "lastName"),
    birthDate: readFormString(formData, "birthDate"),
    documentType: readFormString(formData, "documentType"),
    documentNumber: readFormString(formData, "documentNumber"),
    documentFrontImageStorageKey: readFormString(
      formData,
      "documentFrontImageStorageKey",
    ),
    documentBackImageStorageKey: readFormString(
      formData,
      "documentBackImageStorageKey",
    ),
    correctionReason: readFormString(formData, "correctionReason"),
  };
}

function buildDancerActionError(
  message: string,
  fieldErrors: DancerActionError["fieldErrors"],
  values: DancerActionError["values"],
): DancerActionError {
  return {
    status: "error",
    message,
    fieldErrors,
    values,
  };
}

function isDancerUpdateValues(
  values: DancerActionError["values"] | undefined,
): values is AdministrativeDancerUpdateInput {
  return (
    values !== undefined &&
    "firstName" in values &&
    "lastName" in values &&
    "birthDate" in values &&
    "documentType" in values &&
    "documentNumber" in values &&
    "documentFrontImageStorageKey" in values &&
    "documentBackImageStorageKey" in values
  );
}

function readFormString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

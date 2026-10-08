import { Archive, RotateCcw, TriangleAlert } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Form, useNavigation, useSubmit } from "react-router";

import { PortalEmptyState, PortalPageHeader } from "@/components/portal/ui";
import { useResetListQuery } from "@/components/shared/data-table-url-state";
import { FormActions } from "@/components/shared/form-actions";
import { RosterNameWarningDialog } from "@/components/shared/roster-name-warning";
import { AlertStack } from "@/components/shared/alert-stack";
import { ArchivedPersonAlert } from "@/components/shared/archived-person-alert";
import { useRosterRefusalToast } from "@/components/shared/roster-document-conflict";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { RosterPersonArchiveBlockedDialog } from "@/components/shared/roster-person-archive-blocked-dialog";
import { ProfessorChoreographiesTable } from "@/components/shared/roster-inscriptions-table";
import { RosterSeminarInscriptionsTable } from "@/components/shared/roster-seminar-inscriptions-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { portalSeminarDetailPath } from "@/features/portal/seminars/shared";
import {
  isRouteFormPending,
  useCloseOnceSettled,
  useLatestActionData,
} from "@/lib/shared/forms";
import { useServerActionToast } from "@/lib/shared/toasts";
import {
  PortalProfessorIdentityFields,
  usePortalProfessorForm,
} from "@/features/portal/professors/detail/form";
import {
  archiveProfessorIntent,
  buildPortalProfessorDetailViewModel,
  getPortalProfessorDocumentConflict,
  portalProfessorStatusActions,
  professorDetailFormId,
  splitPortalProfessorActionData,
  reactivateProfessorIntent,
  updateProfessorIntent,
  type PortalProfessorDetailActionData,
  type PortalProfessorDetailLoaderData,
  type ProfessorFormValues,
  type ProfessorStatusIntent,
} from "@/features/portal/professors/detail/shared";

type LoaderData = PortalProfessorDetailLoaderData;
type ActionData = Exclude<PortalProfessorDetailActionData, undefined>;
export type PortalProfessorDetailRouteViewProps = {
  loaderData: LoaderData;
  actionData?: ActionData;
  initialStatusDialogIntent?: ProfessorStatusIntent | null;
};

export function PortalProfessorDetailRouteView({
  loaderData,
  actionData: actionDataOverride,
  initialStatusDialogIntent = null,
}: PortalProfessorDetailRouteViewProps) {
  // A warning keeps the form as it was submitted and asks the academy to
  // confirm, so the values it carries are shown back as an error's are.
  const {
    error: actionData,
    nameWarning,
    success: successData,
  } = splitPortalProfessorActionData(actionDataOverride);
  const savedValues: ProfessorFormValues = {
    firstName: loaderData.professor.firstName,
    lastName: loaderData.professor.lastName,
    documentType: loaderData.professor.documentType ?? "",
    documentNumber: loaderData.professor.documentNumber ?? "",
  };
  // The refused values outlive a search in the other tabs' lists.
  const latestActionData = useLatestActionData(
    actionDataOverride,
    loaderData.professor.id,
  );
  const refused = splitPortalProfessorActionData(latestActionData);
  const formValues =
    refused.error?.values ?? refused.nameWarning?.values ?? savedValues;
  const submit = useSubmit();
  const navigation = useNavigation();
  const form = usePortalProfessorForm({
    savedValues,
    submit,
    values: formValues,
  });
  const [statusDialogIntent, setStatusDialogIntent] =
    useState<ProfessorStatusIntent | null>(initialStatusDialogIntent);
  const { statusAction } = buildPortalProfessorDetailViewModel({
    active: loaderData.professor.active,
    isParticipatingInActiveEvent: loaderData.isParticipatingInActiveEvent,
  });
  const isSubmitting =
    navigation.state !== "idle" &&
    navigation.formData?.get("intent") === updateProfessorIntent;
  const title = `${loaderData.professor.firstName} ${loaderData.professor.lastName}`;

  useRosterRefusalToast({
    conflict: getPortalProfessorDocumentConflict(actionData),
    refusal: actionData,
    toastId: "portal-profesor-detail:error",
  });
  useServerActionToast(successData, {
    toastId: "portal-profesor-detail:success",
  });

  return (
    <>
      <section
        className="flex flex-1 flex-col gap-6"
        aria-labelledby="professor-detail-title"
      >
        <PortalPageHeader
          titleId="professor-detail-title"
          title={title}
          description="Actualizá los datos de este profesor."
          action={
            <ResourceActionsMenu contentClassName="w-40">
              <DropdownMenuItem
                variant={statusAction.confirmButtonVariant}
                onSelect={() => setStatusDialogIntent(statusAction.intent)}
              >
                {statusAction.label}
              </DropdownMenuItem>
            </ResourceActionsMenu>
          }
        />

        <PortalProfessorAlertsSection
          isIncomplete={loaderData.professor.isIncomplete}
          onReactivate={() => {
            setStatusDialogIntent(reactivateProfessorIntent);
          }}
          professorActive={loaderData.professor.active}
        />

        <PortalProfessorDetailTabs loaderData={loaderData}>
          <Card className="overflow-clip">
            <CardContent>
              <form
                id={professorDetailFormId}
                method="post"
                noValidate
                onSubmit={form.handleSubmit}
              >
                <input
                  type="hidden"
                  name="intent"
                  value={updateProfessorIntent}
                />
                <PortalProfessorIdentityFields form={form.form} />
              </form>
            </CardContent>
            <FormActions
              backTo="/portal/profesores"
              form={professorDetailFormId}
              hasChanges={form.form.formState.isDirty}
              isPending={isSubmitting}
              onDiscard={form.discard}
            />
          </Card>
        </PortalProfessorDetailTabs>
        {nameWarning ? (
          <RosterNameWarningDialog
            formId={professorDetailFormId}
            isPending={isSubmitting}
            warning={nameWarning.warning}
          />
        ) : null}
      </section>

      <ProfessorStatusDialogs
        intent={statusDialogIntent}
        isArchiveBlocked={statusAction.isBlocked}
        onClose={() => setStatusDialogIntent(null)}
      />
    </>
  );
}

/**
 * The professor's three tabs, the dancer's twin. `Identificación` is the form
 * it is given, kept mounted behind the other tabs so the leave guard in
 * `Guardar`'s footer still covers the draft from there; `Inscripciones` and
 * `Seminarios` are tables of their own.
 */
function PortalProfessorDetailTabs({
  children,
  loaderData,
}: {
  children: ReactNode;
  loaderData: LoaderData;
}) {
  const resetListQuery = useResetListQuery();

  return (
    <Tabs defaultValue="identification" onValueChange={resetListQuery}>
      <TabsList variant="line">
        <TabsTrigger value="identification">Identificación</TabsTrigger>
        <TabsTrigger value="inscriptions">Inscripciones</TabsTrigger>
        <TabsTrigger value="seminars">Seminarios</TabsTrigger>
      </TabsList>
      <TabsContent
        forceMount
        value="identification"
        className="pt-2 data-[state=inactive]:hidden"
      >
        {children}
      </TabsContent>
      <TabsContent value="inscriptions" className="pt-2">
        {loaderData.selectedEventId ? (
          <ProfessorChoreographiesTable
            buildChoreographyHref={(choreographyId) =>
              `/portal/coreografias/${choreographyId}`
            }
            choreographies={loaderData.choreographies}
          />
        ) : (
          <NoActiveEventState subject="inscripciones" />
        )}
      </TabsContent>
      <TabsContent value="seminars" className="pt-2">
        {loaderData.selectedEventId ? (
          <RosterSeminarInscriptionsTable
            buildSeminarHref={portalSeminarDetailPath}
            inscriptions={loaderData.seminarInscriptions}
            personKind="professor"
          />
        ) : (
          <NoActiveEventState subject="seminarios" />
        )}
      </TabsContent>
    </Tabs>
  );
}

function NoActiveEventState({ subject }: { subject: string }) {
  return (
    <PortalEmptyState
      title="Sin evento activo"
      description={`No hay un evento activo para revisar ${subject}.`}
    />
  );
}

function PortalProfessorAlertsSection({
  isIncomplete,
  onReactivate,
  professorActive,
}: {
  isIncomplete: boolean;
  onReactivate: () => void;
  professorActive: boolean;
}) {
  return (
    <AlertStack>
      {!professorActive ? (
        <ArchivedPersonAlert
          personLabel="profesor"
          onReactivate={onReactivate}
        />
      ) : null}
      {isIncomplete ? (
        <Alert variant="warning">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Faltan datos de identificación</AlertTitle>
          <AlertDescription>
            Completá el tipo y el número de documento.
          </AlertDescription>
        </Alert>
      ) : null}
    </AlertStack>
  );
}

function ProfessorStatusDialog({
  intent,
  onOpenChange,
}: {
  intent: ProfessorStatusIntent | null;
  onOpenChange: (open: boolean) => void;
}) {
  const action = intent ? portalProfessorStatusActions[intent] : null;
  const isOpen = action !== null;
  const dialogFormId = getProfessorStatusFormId(intent);
  const navigation = useNavigation();
  const isPending =
    action !== null &&
    isRouteFormPending(navigation, { intent: action.intent });

  useCloseOnceSettled({ isPending, onClose: () => onOpenChange(false) });

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
          <AlertDialogContent forceMount>
            <AlertDialogHeader>
              <AlertDialogTitle>{action.confirmTitle}</AlertDialogTitle>
              <AlertDialogDescription>
                {action.confirmDescription}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending}>
                Cancelar
              </AlertDialogCancel>
              <Form id={dialogFormId} method="post">
                <input type="hidden" name="intent" value={action.intent} />
                <Button
                  type="submit"
                  variant={action.confirmButtonVariant}
                  disabled={isPending}
                >
                  {isPending ? (
                    <Spinner aria-hidden="true" data-icon="inline-start" />
                  ) : (
                    <ProfessorStatusActionIcon intent={action.intent} />
                  )}
                  {action.confirmButtonLabel}
                </Button>
              </Form>
            </AlertDialogFooter>
          </AlertDialogContent>
        ) : null}
      </AlertDialog>
    </>
  );
}

function ProfessorStatusActionIcon({
  intent,
}: {
  intent: ProfessorStatusIntent;
}) {
  if (intent === archiveProfessorIntent) {
    return <Archive aria-hidden="true" data-icon="inline-start" />;
  }

  return <RotateCcw aria-hidden="true" data-icon="inline-start" />;
}

function getProfessorStatusFormId(intent: ProfessorStatusIntent | null) {
  switch (intent) {
    case archiveProfessorIntent:
      return "portal-profesor-archive-form";
    case reactivateProfessorIntent:
      return "portal-profesor-reactivate-form";
    case null:
      return "portal-profesor-status-form";
  }
}

/**
 * `Archivar` opens the blocked acknowledgment instead of its confirmation
 * while the professor takes part in the active event; every other intent opens
 * the confirmation.
 */
function ProfessorStatusDialogs({
  intent,
  isArchiveBlocked,
  onClose,
}: {
  intent: ProfessorStatusIntent | null;
  isArchiveBlocked: boolean;
  onClose: () => void;
}) {
  const isBlockedOpen = intent === archiveProfessorIntent && isArchiveBlocked;
  const closeOnDismiss = (open: boolean) => {
    if (!open) {
      onClose();
    }
  };

  return (
    <>
      <RosterPersonArchiveBlockedDialog
        kind="professor"
        onOpenChange={closeOnDismiss}
        open={isBlockedOpen}
      />
      <ProfessorStatusDialog
        intent={isBlockedOpen ? null : intent}
        onOpenChange={closeOnDismiss}
      />
    </>
  );
}

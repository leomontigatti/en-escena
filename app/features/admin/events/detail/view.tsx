import { Info, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Form, Link } from "react-router";

import {
  EventFormFields,
  useEventForm,
  type EventFormController,
} from "@/components/admin/events/form";
import {
  AdminResourceFormCard,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { AlertStack } from "@/components/shared/alert-stack";
import { DeleteDialog } from "@/components/shared/delete-dialog";
import { FormActions } from "@/components/shared/form-actions";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { ReasonList } from "@/components/shared/reason-list";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  eventFormValues,
  paymentInstructionsFields,
} from "@/lib/admin/events/form-values";
import {
  isRouteFormPending,
  useOptionalNavigation,
  useSavedFormValues,
} from "@/lib/shared/forms";
import { notificationToastIds } from "@/lib/shared/notification-toasts";
import { useServerActionToast } from "@/lib/shared/toasts";

import {
  EventDocumentsFields,
  useEventDocumentsForm,
} from "./documents-fields";
import { EventPaymentInstructionsFields } from "./payment-instructions-fields";
// PROTOTYPE — throwaway, do not merge
import { GrandFinalCutoffPrototype } from "./grand-final-cutoff-prototype";
import {
  eventDocumentDeclarations,
  type EventDocumentKind,
} from "@/lib/events/event-documents";
import type { EventRegistrationMissingCode } from "@/lib/events/registration-readiness";

import {
  eventActionPath,
  getEventDeleteBlockReasons,
  getMissingItemAdminPath,
  getMissingItemLinkLabel,
  getMissingItemSummary,
  type EventDetailActionData,
  type EventDetailLoaderData,
} from "./shared";

export type EventDetailViewProps = {
  actionData?: EventDetailActionData;
  loaderData: EventDetailLoaderData;
  initialDeleteDialogOpen?: boolean;
};

export function EventDetailView({
  loaderData,
  actionData,
  initialDeleteDialogOpen = false,
}: EventDetailViewProps) {
  const errorData = actionData?.status === "error" ? actionData : undefined;
  const successData = actionData?.status === "success" ? actionData : undefined;

  useServerActionToast(errorData, {
    toastId: notificationToastIds["event-form-error"],
  });
  useServerActionToast(successData, {
    toastId: "admin-evento-detail:success",
  });

  return (
    <AdminResourceLayout
      title={loaderData.event.name}
      description="Editá fechas, visibilidad y estado operativo del evento."
      requireSelectedEvent={false}
      headerAction={
        <EventActions
          deleteBlockReasons={getEventDeleteBlockReasons(loaderData)}
          event={loaderData.event}
          initialDeleteDialogOpen={initialDeleteDialogOpen}
        />
      }
    >
      <EditEventPanel
        event={loaderData.event}
        actionData={errorData}
        documents={loaderData.documents}
        registrationReadiness={loaderData.registrationReadiness}
        isStructureLocked={loaderData.hasChoreographies}
        grandFinalCategoriesPrototype={
          loaderData.grandFinalCategoriesPrototype ?? []
        }
      />
    </AdminResourceLayout>
  );
}

function EventRegistrationReadinessAlert({
  readiness,
}: {
  readiness: EventDetailLoaderData["registrationReadiness"];
}) {
  if (readiness.isReady) {
    return null;
  }

  return (
    <Alert variant="warning">
      <TriangleAlert aria-hidden="true" />
      <AlertTitle>
        Este evento no está listo para inscribir coreografías.
      </AlertTitle>
      <AlertDescription>
        <ul className="list-disc pl-5">
          {summarizeMissingItems(readiness.missingItems).map((item) => (
            <li key={item.message}>
              {item.message}{" "}
              <Link to={getMissingItemAdminPath(item.code)}>
                Revisar {item.linkLabel}
              </Link>
              .
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

/**
 * One bullet per distinct message rather than per item: several rows share a
 * code and a generic summary, and repeating it once per offending path would
 * bury the ones that differ. An age-coverage row carries its own detail, so
 * each of them earns a bullet.
 */
function summarizeMissingItems(
  missingItems: EventDetailLoaderData["registrationReadiness"]["missingItems"],
) {
  const summaries = new Map<
    string,
    { code: EventRegistrationMissingCode; linkLabel: string; message: string }
  >();

  for (const item of missingItems) {
    const message = getMissingItemSummary(item);

    if (summaries.has(message)) {
      continue;
    }

    summaries.set(message, {
      code: item.code,
      linkLabel: getMissingItemLinkLabel(item.code),
      message,
    });
  }

  return Array.from(summaries.values());
}

/**
 * One form, one "Guardar". The three documents are fields of it rather than
 * three upload forms of their own, which is what lets the card carry a single
 * button — and is why nothing here may nest a `<form>`.
 */
function EditEventPanel({
  event,
  actionData,
  documents,
  registrationReadiness,
  isStructureLocked,
  grandFinalCategoriesPrototype,
}: {
  event: EventDetailLoaderData["event"];
  actionData?: Extract<EventDetailActionData, { status: "error" }>;
  documents: EventDetailLoaderData["documents"];
  registrationReadiness: EventDetailLoaderData["registrationReadiness"];
  /** Choreographies were inscribed and priced against the dates and deposit. */
  isStructureLocked: boolean;
  /** PROTOTYPE — throwaway, do not merge. */
  grandFinalCategoriesPrototype: NonNullable<
    EventDetailLoaderData["grandFinalCategoriesPrototype"]
  >;
}) {
  const savedValues = eventFormValues(event);
  const eventForm = useEventForm({
    values: savedValues,
    pendingScope: { intent: "update" },
  });

  // What a refused save sent back goes on top of what is saved, so it still
  // counts as a change.
  useSavedFormValues(eventForm.form, savedValues, actionData?.values);
  const documentsForm = useEventDocumentsForm(documents);
  const removal = useDocumentRemovalConfirmation({
    handleSubmit: eventForm.handleSubmit,
    removedKinds: documentsForm.removedKinds,
  });
  const hasChanges =
    eventForm.form.formState.isDirty || documentsForm.hasPendingChanges;

  return (
    <>
      {/* Above the card, never inside it: an alert about the whole event is not
          a field, and the stack owns the spacing between however many there
          are. */}
      <AlertStack>
        {!registrationReadiness.isReady ? (
          <EventRegistrationReadinessAlert readiness={registrationReadiness} />
        ) : null}
        {/* One reason only, so it is a sentence, not a one-item list. */}
        {isStructureLocked ? (
          <Alert variant="info">
            <Info aria-hidden="true" />
            <AlertTitle>Las fechas y la seña no se pueden cambiar</AlertTitle>
            <AlertDescription>
              El evento ya tiene coreografías inscriptas. Se van a poder cambiar
              si se eliminan todas.
            </AlertDescription>
          </Alert>
        ) : null}
      </AlertStack>
      <form
        ref={removal.formRef}
        method="post"
        action={eventActionPath(event.id)}
        encType="multipart/form-data"
        noValidate
        className="flex flex-1 flex-col gap-6"
        onSubmit={removal.onSubmit}
      >
        <input type="hidden" name="intent" value="update" />
        <AdminResourceFormCard
          footer={
            <FormActions
              backTo="/administracion/eventos"
              hasChanges={hasChanges}
              isPending={eventForm.isPending}
              onDiscard={() => {
                eventForm.form.reset();
                documentsForm.discard();
              }}
            />
          }
        >
          <EventFormFields
            controller={eventForm}
            lockedValues={isStructureLocked ? savedValues : undefined}
          />
          {/* PROTOTYPE — throwaway, do not merge */}
          <GrandFinalCutoffPrototype
            categories={grandFinalCategoriesPrototype}
          />
          <EventFormTabs
            controller={eventForm}
            documentsPanel={
              <EventDocumentsFields
                controller={documentsForm}
                documents={documents}
              />
            }
          />
        </AdminResourceFormCard>
      </form>
      <RemoveDocumentsDialog
        isPending={eventForm.isPending}
        onConfirm={removal.confirm}
        onOpenChange={removal.setIsConfirmOpen}
        open={removal.isConfirmOpen}
        removedKinds={documentsForm.removedKinds}
      />
    </>
  );
}

const documentsTabValue = "documentos";
const paymentInstructionsTabValue = "instrucciones-de-pago";

/**
 * The two non-scalar halves of the event form, below the event's own fields and
 * inside the same `<form>`: "Guardar" stays in the pinned footer, outside the
 * tabs, and an invalid identifier is a field error on submit, not a dead
 * button.
 */
function EventFormTabs({
  controller,
  documentsPanel,
}: {
  controller: EventFormController;
  documentsPanel: React.ReactNode;
}) {
  // "Documentos" leads and lands: it is what the administration edits today,
  // and the instructions are the addition.
  const [tab, setTab] = useState(documentsTabValue);
  const erroredTab = getErroredTab(controller);
  const { submitCount } = controller.form.formState;

  // A failed submission pulls its tab forward, so an error never lands on a
  // panel nobody can see. Keyed by the submit count rather than by the errors:
  // watching those would yank the tab back the moment a field is fixed
  // mid-typing, and would also switch tabs with no submit at all when the live
  // 2000-character cap raises its error. `erroredTab` stays a dependency for
  // the linter, but the ref makes every run that is not a new submit a no-op —
  // and re-submitting the same broken form still switches, because the count
  // rises either way.
  const handledSubmitCount = useRef(0);

  useEffect(() => {
    if (submitCount === handledSubmitCount.current) {
      return;
    }

    handledSubmitCount.current = submitCount;

    if (erroredTab) {
      setTab(erroredTab);
    }
  }, [erroredTab, submitCount]);

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList variant="line">
        <TabsTrigger value={documentsTabValue}>Documentos</TabsTrigger>
        <TabsTrigger value={paymentInstructionsTabValue}>
          Instrucciones de pago
          {erroredTab === paymentInstructionsTabValue ? (
            <TriangleAlert
              aria-hidden="true"
              className="text-destructive"
              data-icon="inline-end"
            />
          ) : null}
        </TabsTrigger>
      </TabsList>
      {/* `forceMount` on both, the inactive one hidden: Radix unmounts an
          inactive panel by default, and an unmounted input is not submitted —
          the identifiers would post empty and clear themselves, and a PDF
          chosen in a native file input would be lost on a tab switch. */}
      <TabsContent
        forceMount
        value={documentsTabValue}
        className="pt-2 data-[state=inactive]:hidden"
      >
        {documentsPanel}
      </TabsContent>
      <TabsContent
        forceMount
        value={paymentInstructionsTabValue}
        className="pt-2 data-[state=inactive]:hidden"
      >
        <EventPaymentInstructionsFields controller={controller} />
      </TabsContent>
    </Tabs>
  );
}

/**
 * Which tab holds the first error, or `null` when none does. The documents are
 * file inputs with no schema of their own, so the instructions panel is the only
 * tab that can carry one; the event's own fields sit above the tabs and stay
 * visible whichever tab is open.
 */
function getErroredTab(controller: EventFormController) {
  const erroredFields = Object.keys(controller.form.formState.errors);

  return paymentInstructionsFields.some((field) =>
    erroredFields.includes(field),
  )
    ? paymentInstructionsTabValue
    : null;
}

/**
 * Removing a document deletes the PDF the academies download, and folding it
 * into "Guardar" is what removed the per-document button — so the confirmation
 * the delete dialog used to give moves here rather than disappearing.
 */
function useDocumentRemovalConfirmation({
  handleSubmit,
  removedKinds,
}: {
  handleSubmit: (event: React.SubmitEvent<HTMLFormElement>) => void;
  removedKinds: EventDocumentKind[];
}) {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const isConfirmedRef = useRef(false);

  return {
    confirm,
    formRef,
    isConfirmOpen,
    onSubmit,
    setIsConfirmOpen,
  };

  function onSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    if (removedKinds.length > 0 && !isConfirmedRef.current) {
      event.preventDefault();
      setIsConfirmOpen(true);
      return;
    }

    isConfirmedRef.current = false;
    handleSubmit(event);
  }

  function confirm() {
    setIsConfirmOpen(false);
    isConfirmedRef.current = true;
    formRef.current?.requestSubmit();
  }
}

function RemoveDocumentsDialog({
  isPending,
  onConfirm,
  onOpenChange,
  open,
  removedKinds,
}: {
  isPending: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  removedKinds: EventDocumentKind[];
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Confirmar los cambios</AlertDialogTitle>
          <AlertDialogDescription>
            Guardar elimina estos documentos. La acción no se puede deshacer y
            las academias van a dejar de verlos.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul className="list-disc pl-5 text-sm text-muted-foreground">
          {removedKinds.map((kind) => (
            <li key={kind}>{eventDocumentDeclarations[kind].label}</li>
          ))}
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
          {/* Destructive, not the default: pressing this deletes the PDFs the
              academies download, even though the submission it triggers is the
              same "Guardar" the rest of the form uses. */}
          <AlertDialogAction
            disabled={isPending}
            variant="destructive"
            onClick={onConfirm}
          >
            {isPending ? (
              <Spinner aria-hidden="true" data-icon="inline-start" />
            ) : null}
            Eliminar y guardar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function EventActions({
  deleteBlockReasons,
  event,
  initialDeleteDialogOpen = false,
}: {
  /** Why `Eliminar` answers with the acknowledgment instead of confirming. */
  deleteBlockReasons: string[];
  event: EventDetailLoaderData["event"];
  initialDeleteDialogOpen?: boolean;
}) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(
    initialDeleteDialogOpen,
  );

  return (
    <>
      <ResourceActionsMenu contentClassName="w-48">
        <DropdownMenuGroup>
          <EventActionItem
            action={eventActionPath(event.id)}
            intent={event.active ? "deactivate" : "activate"}
            confirmName={event.active ? "confirmDeactivation" : undefined}
            confirmValue={event.active ? event.id : undefined}
            label={event.active ? "Desactivar" : "Activar"}
          />
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setDeleteDialogOpen(true)}
          >
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </ResourceActionsMenu>
      <DeleteDialog
        title="¿Eliminar el evento?"
        blockedTitle="No se puede eliminar el evento"
        description={
          deleteBlockReasons.length > 0
            ? "Se puede eliminar cuando no sea el evento activo y no tenga coreografías inscriptas."
            : `Esta acción no se puede deshacer. Se va a eliminar ${event.name}.`
        }
        isBlocked={deleteBlockReasons.length > 0}
        blockedDescription={<ReasonList reasons={deleteBlockReasons} />}
        intentValue="delete"
        recordId={event.id}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      />
    </>
  );
}

function EventActionItem({
  action,
  confirmName,
  confirmValue,
  intent,
  label,
  variant,
}: {
  action: string;
  confirmName?: string;
  confirmValue?: string;
  intent: string;
  label: string;
  variant?: "destructive";
}) {
  const navigation = useOptionalNavigation();
  const isPending = isRouteFormPending(navigation, { intent });

  return (
    <Form method="post" action={action}>
      <input type="hidden" name="intent" value={intent} />
      {confirmName && confirmValue ? (
        <input type="hidden" name={confirmName} value={confirmValue} />
      ) : null}
      <DropdownMenuItem asChild variant={variant}>
        <button
          type="submit"
          disabled={isPending}
          className="w-full justify-start whitespace-nowrap"
        >
          <span className="inline-flex items-center gap-2">
            {isPending ? (
              <Spinner aria-hidden="true" data-icon="inline-start" />
            ) : null}
            {label}
          </span>
        </button>
      </DropdownMenuItem>
    </Form>
  );
}

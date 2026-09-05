import { TriangleAlert } from "lucide-react";
import { useRef, useState } from "react";
import { Link } from "react-router";

import { EventFormFields, useEventForm } from "@/components/admin/events/form";
import {
  AdminResourceFormCard,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { SubmitButton } from "@/components/shared/action-buttons";
import { AlertStack } from "@/components/shared/alert-stack";
import { DeleteDialog } from "@/components/shared/delete-dialog";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { eventFormValues } from "@/lib/admin/events/form-values";
import { isRouteFormPending, useOptionalNavigation } from "@/lib/shared/forms";
import { notificationToastIds } from "@/lib/shared/notification-toasts";
import { useServerActionToast } from "@/lib/shared/toasts";

import {
  EventDocumentsFields,
  useEventDocumentsForm,
} from "./documents-fields";
import {
  eventDocumentDeclarations,
  type EventDocumentKind,
} from "@/lib/events/event-documents";

import {
  eventActionPath,
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
      title="Editar evento"
      description="Editá fechas, visibilidad y estado operativo del evento."
      requireSelectedEvent={false}
      headerAction={
        <EventActions
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
      <TriangleAlert
        aria-hidden="true"
        className="self-center !translate-y-0"
      />
      <AlertDescription className="[&_p:not(:last-child)]:mb-1">
        <p>Este evento no está listo para inscribir coreografías.</p>
        <ul className="list-disc pl-5">
          {summarizeMissingItems(readiness.missingItems).map((item) => (
            <li key={item.code}>
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

function summarizeMissingItems(
  missingItems: EventDetailLoaderData["registrationReadiness"]["missingItems"],
) {
  const missingCodes = Array.from(
    new Set(missingItems.map((item) => item.code)),
  );

  return missingCodes.map((code) => ({
    code,
    linkLabel: getMissingItemLinkLabel(code),
    message: getMissingItemSummary(code),
  }));
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
}: {
  event: EventDetailLoaderData["event"];
  actionData?: Extract<EventDetailActionData, { status: "error" }>;
  documents: EventDetailLoaderData["documents"];
  registrationReadiness: EventDetailLoaderData["registrationReadiness"];
}) {
  const defaultValues = actionData?.values ?? eventFormValues(event);
  const eventForm = useEventForm({
    values: defaultValues,
    pendingScope: { intent: "update" },
  });
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
      </AlertStack>
      <form
        ref={removal.formRef}
        method="post"
        action={eventActionPath(event.id)}
        encType="multipart/form-data"
        noValidate
        onSubmit={removal.onSubmit}
      >
        <input type="hidden" name="intent" value="update" />
        <AdminResourceFormCard
          footer={
            <>
              <Button asChild variant="outline">
                <Link to="/administracion/eventos">Volver</Link>
              </Button>
              <SubmitButton
                disabled={!hasChanges}
                isPending={eventForm.isPending}
              />
            </>
          }
        >
          <EventFormFields controller={eventForm} />
          <EventDocumentsFields
            controller={documentsForm}
            documents={documents}
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
      <AlertDialogContent>
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
            {isPending ? <Spinner aria-hidden="true" data-icon /> : null}
            Eliminar y guardar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function EventActions({
  event,
  initialDeleteDialogOpen = false,
}: {
  event: EventDetailLoaderData["event"];
  initialDeleteDialogOpen?: boolean;
}) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(
    initialDeleteDialogOpen,
  );

  return (
    <>
      <ResourceActionsMenu
        contentClassName="w-48"
        contentProps={{ forceMount: true }}
      >
        <DropdownMenuGroup>
          <EventActionItem
            action={eventActionPath(event.id)}
            intent={event.active ? "deactivate" : "activate"}
            confirmName={event.active ? "confirmDeactivation" : undefined}
            confirmValue={event.active ? event.id : undefined}
            label={event.active ? "Desactivar" : "Activar"}
          />
          <EventActionItem
            action={eventActionPath(event.id)}
            intent="set-program-visibility"
            value={event.programVisible ? "false" : "true"}
            label={
              event.programVisible ? "Ocultar programa" : "Mostrar programa"
            }
          />
          <EventActionItem
            action={eventActionPath(event.id)}
            intent="set-results-visibility"
            value={event.resultsVisible ? "false" : "true"}
            label={
              event.resultsVisible ? "Ocultar resultados" : "Mostrar resultados"
            }
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
        title="Eliminar evento"
        description={`Esta acción no se puede deshacer. Se va a eliminar ${event.name}.`}
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
  value,
  variant,
}: {
  action: string;
  confirmName?: string;
  confirmValue?: string;
  intent: string;
  label: string;
  value?: string;
  variant?: "destructive";
}) {
  const navigation = useOptionalNavigation();
  const isPending = isRouteFormPending(navigation, {
    intent,
    fields: value ? { value } : undefined,
  });

  return (
    <form method="post" action={action}>
      <input type="hidden" name="intent" value={intent} />
      {value ? <input type="hidden" name="value" value={value} /> : null}
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
            {isPending ? <Spinner aria-hidden="true" data-icon /> : null}
            {label}
          </span>
        </button>
      </DropdownMenuItem>
    </form>
  );
}

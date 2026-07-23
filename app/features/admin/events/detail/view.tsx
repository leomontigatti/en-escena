import { LoaderCircle, TriangleAlert } from "lucide-react";
import { useState } from "react";
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
import { Button } from "@/components/ui/button";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { eventFormValues } from "@/lib/admin/events/form-values";
import { isRouteFormPending, useOptionalNavigation } from "@/lib/shared/forms";
import { notificationToastIds } from "@/lib/shared/notification-toasts";
import { useServerActionToast } from "@/lib/shared/toasts";

import {
  eventActionPath,
  getMissingItemAdminPath,
  getMissingItemLinkLabel,
  getMissingItemSummary,
  type AdministrativeEventDetailActionData,
  type AdministrativeEventDetailLoaderData,
} from "./shared";

export type AdministrativeEventDetailViewProps = {
  actionData?: AdministrativeEventDetailActionData;
  loaderData: AdministrativeEventDetailLoaderData;
  initialDeleteDialogOpen?: boolean;
};

export function AdministrativeEventDetailView({
  loaderData,
  actionData,
  initialDeleteDialogOpen = false,
}: AdministrativeEventDetailViewProps) {
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
      <AlertStack>
        {!loaderData.registrationReadiness.isReady ? (
          <EventRegistrationReadinessAlert
            readiness={loaderData.registrationReadiness}
          />
        ) : null}
      </AlertStack>
      <EditEventPanel event={loaderData.event} actionData={errorData} />
    </AdminResourceLayout>
  );
}

function EventRegistrationReadinessAlert({
  readiness,
}: {
  readiness: AdministrativeEventDetailLoaderData["registrationReadiness"];
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
  missingItems: AdministrativeEventDetailLoaderData["registrationReadiness"]["missingItems"],
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

function EditEventPanel({
  event,
  actionData,
}: {
  event: AdministrativeEventDetailLoaderData["event"];
  actionData?: Extract<
    AdministrativeEventDetailActionData,
    { status: "error" }
  >;
}) {
  const defaultValues = actionData?.values ?? eventFormValues(event);
  const eventForm = useEventForm({
    values: defaultValues,
    pendingScope: { intent: "update" },
  });

  return (
    <form
      method="post"
      action={eventActionPath(event.id)}
      noValidate
      onSubmit={eventForm.handleSubmit}
    >
      <AdminResourceFormCard
        footer={
          <>
            <Button asChild variant="outline">
              <Link to="/administracion/eventos">Volver</Link>
            </Button>
            <SubmitButton isPending={eventForm.isPending} />
          </>
        }
      >
        <input type="hidden" name="intent" value="update" />
        <EventFormFields controller={eventForm} />
      </AdminResourceFormCard>
    </form>
  );
}

function EventActions({
  event,
  initialDeleteDialogOpen = false,
}: {
  event: AdministrativeEventDetailLoaderData["event"];
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
            {isPending ? (
              <LoaderCircle
                aria-hidden="true"
                className="animate-spin"
                data-icon
              />
            ) : null}
            {label}
          </span>
        </button>
      </DropdownMenuItem>
    </form>
  );
}

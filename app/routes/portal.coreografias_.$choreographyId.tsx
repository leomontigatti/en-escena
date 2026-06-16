import { Trash2 } from "lucide-react";
import { useState } from "react";
import { redirect, useActionData, useSearchParams } from "react-router";
import { clsx } from "clsx";

import { AccessNotice } from "@/components/auth/access-ui";
import type { PortalRouteHandle } from "@/components/portal/ui";
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
import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import {
  findChoreographyForAcademyEvent,
  getChoreographyDeletionAvailability,
  listProfessorOptionsForChoreography,
  updateChoreographyProfessors,
  deleteChoreography,
} from "@/lib/portal/choreographies.server";
import { getPortalEventStatusLabel } from "@/lib/portal/route-state";
import {
  formatGroupTypeLabel,
  formatOperationalPendingItemLabel,
  formatOperationalStatusLabel,
} from "@/lib/portal/choreographies";
import { getPortalEventContext } from "@/lib/portal/event-context.server";

const choreographyNotFoundMessage = "No encontramos esa Coreografía.";
const choreographyUpdatedSearchParam = "actualizado";
const choreographyUpdatedSuccessMessage =
  "Profesores actualizados correctamente.";
const choreographyDeletedSearchParam = "eliminada";
const updateChoreographyProfessorsIntent = "update-choreography-professors";
const deleteChoreographyIntent = "delete-choreography";
const readOnlyEventMessage = "Este Evento es de solo lectura.";
const unsupportedActionMessage = "Acción no soportada.";

type ActionData =
  | {
      status: "error";
      message: string;
      selectedProfessorIds: string[];
    }
  | undefined;

type PortalCoreografiaDetalleRouteProps = {
  loaderData: Awaited<ReturnType<typeof loader>>;
  actionData?: ActionData;
  initialDeleteDialogOpen?: boolean;
};

type LoaderData = PortalCoreografiaDetalleRouteProps["loaderData"];
type ChoreographyProfessor = LoaderData["choreography"]["professors"][number];
type ChoreographyProfessorOption = LoaderData["availableProfessors"][number];
type ChoreographyOperationalStatus =
  LoaderData["choreography"]["operationalStatus"];

export const meta = () => [
  { title: "Detalle de Coreografía | Portal de academias | En Escena" },
];

export const handle = {
  portalBreadcrumbs: [
    { label: "Coreografías", to: "/portal/coreografias" },
    (match) => {
      const data = match.data as LoaderData | undefined;

      return data?.choreography ? { label: data.choreography.name } : null;
    },
  ],
} satisfies PortalRouteHandle;

export async function loader({
  request,
  params,
}: {
  request: Request;
  params: { choreographyId?: string };
}) {
  const { academy } = await requireAcademyUser(request);
  const choreographyId = params.choreographyId;

  if (!choreographyId) {
    throw new Response(choreographyNotFoundMessage, { status: 404 });
  }

  const eventContext = await getPortalEventContext(request);
  const selectedEventId = eventContext.selectedEvent?.id;

  if (!selectedEventId) {
    throw new Response(choreographyNotFoundMessage, { status: 404 });
  }

  const choreography = await findChoreographyForAcademyEvent(
    academy.id,
    selectedEventId,
    choreographyId,
  );

  if (!choreography) {
    throw new Response(choreographyNotFoundMessage, { status: 404 });
  }

  const availableProfessors = await listProfessorOptionsForChoreography(
    academy.id,
    choreography.professors.map((professor) => professor.id),
  );

  return {
    choreography,
    availableProfessors,
    deletionAvailability: getChoreographyDeletionAvailability({
      isReadOnly: eventContext.isReadOnly,
      isRegistrationOpen: eventContext.isRegistrationOpen,
    }),
    eventContext,
    successMessage: readUpdatedSuccessMessage(
      new URL(request.url).searchParams,
    ),
  };
}

export async function action({
  request,
  params,
}: {
  request: Request;
  params: { choreographyId?: string };
}) {
  const { academy } = await requireAcademyUser(request);
  const choreographyId = readChoreographyId(params);
  const eventContext = await getPortalEventContext(request);
  const selectedEventId = eventContext.selectedEvent?.id;

  if (!selectedEventId) {
    throw new Response(choreographyNotFoundMessage, { status: 404 });
  }

  if (eventContext.isReadOnly) {
    throw new Response(readOnlyEventMessage, { status: 403 });
  }

  const formData = await request.formData();
  const intent = readFormString(formData, "intent");

  if (intent === updateChoreographyProfessorsIntent) {
    const professorIds = readFormStringArray(formData, "professorIds");
    return await handleUpdateChoreographyProfessorsAction({
      academyId: academy.id,
      eventId: selectedEventId,
      choreographyId,
      professorIds,
    });
  }

  if (intent === deleteChoreographyIntent) {
    assertDeleteConfirmationMatches(formData, choreographyId);

    return await handleDeleteChoreographyAction({
      academyId: academy.id,
      eventId: selectedEventId,
      choreographyId,
    });
  }

  throw new Response(unsupportedActionMessage, { status: 400 });
}

export function PortalCoreografiaDetalleRouteView({
  loaderData,
  actionData,
  initialDeleteDialogOpen = false,
}: PortalCoreografiaDetalleRouteProps) {
  const selectedEvent = loaderData.eventContext.selectedEvent;
  const canEditProfessors = !loaderData.eventContext.isReadOnly;
  const canDeleteChoreography = loaderData.deletionAvailability.canDelete;
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(
    initialDeleteDialogOpen,
  );
  const selectedProfessorIds = new Set(
    actionData?.selectedProfessorIds ??
      loaderData.choreography.professors.map((professor) => professor.id),
  );

  return (
    <>
      <section className="mt-8 space-y-6" aria-labelledby="coreografia-title">
        <div className="rounded-lg border border-slate-200 bg-white p-6">
          <div className="flex flex-wrap items-center gap-3">
            <h2
              id="coreografia-title"
              className="text-xl font-semibold text-slate-950"
            >
              {loaderData.choreography.name}
            </h2>
            <span
              className={getReadOnlyBadgeClassName(
                loaderData.eventContext.isReadOnly,
              )}
            >
              {getPortalEventStatusLabel(loaderData.eventContext.isReadOnly)}
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Evento activo: {selectedEvent?.name}
          </p>

          {loaderData.successMessage ? (
            <div className="mt-4">
              <AccessNotice variant="success">
                {loaderData.successMessage}
              </AccessNotice>
            </div>
          ) : null}

          {actionData?.message ? (
            <div className="mt-4">
              <AccessNotice variant="error">{actionData.message}</AccessNotice>
            </div>
          ) : null}

          <dl className="mt-6 grid gap-4 sm:grid-cols-2">
            <DetailItem label="Nombre" value={loaderData.choreography.name} />
            <DetailItem
              label="Modalidad"
              value={[
                loaderData.choreography.modalityName,
                loaderData.choreography.submodalityName,
              ]
                .filter(Boolean)
                .join(" · ")}
            />
            <DetailItem
              label="Tipo de grupo"
              value={formatGroupTypeLabel(loaderData.choreography.groupType)}
            />
            <DetailItem
              label="Categoría"
              value={
                loaderData.choreography.categoryName ?? "Categoría pendiente"
              }
            />
            <DetailItem
              label="Nivel de experiencia"
              value={
                loaderData.choreography.experienceLevelName ??
                "No requiere o pendiente"
              }
            />
            <DetailItem
              label="Bloque horario"
              value={loaderData.choreography.scheduleBlockName}
            />
            <DetailItem
              label="Cronograma"
              value={loaderData.choreography.scheduleLabel}
            />
            <DetailItem
              label="Estado operativo"
              value={formatOperationalStatusLabel(
                loaderData.choreography.operationalStatus,
              )}
            />
          </dl>

          <OperationalStatusSummary
            operationalStatus={loaderData.choreography.operationalStatus}
          />
        </div>

        {canDeleteChoreography ? (
          <DeleteChoreographyDialog
            choreographyId={loaderData.choreography.id}
            isOpen={isDeleteDialogOpen}
            onOpenChange={setIsDeleteDialogOpen}
            onOpenRequest={() => setIsDeleteDialogOpen(true)}
            warningMessage={loaderData.deletionAvailability.warningMessage}
          />
        ) : null}

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <h3 className="text-sm font-semibold text-slate-950">Bailarines</h3>
            <ul className="mt-4 space-y-3">
              {loaderData.choreography.dancers.map((dancer) => (
                <li
                  key={dancer.id}
                  className="flex items-center justify-between gap-4 rounded-md border border-slate-100 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-950">
                      {dancer.lastName}, {dancer.firstName}
                    </p>
                    <p className="text-sm text-slate-600">
                      Edad al inicio del Evento: {dancer.ageAtEventStart}
                    </p>
                  </div>
                  {!dancer.active ? <ArchivedBadge /> : null}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-950">
                  Profesores
                </h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {getProfessorSectionDescription(canEditProfessors)}
                </p>
              </div>
              <span
                className={getProfessorSectionBadgeClassName(canEditProfessors)}
              >
                {canEditProfessors ? "Editable" : "Solo lectura"}
              </span>
            </div>

            {canEditProfessors ? (
              <ProfessorEditor
                professors={loaderData.availableProfessors}
                selectedProfessorIds={selectedProfessorIds}
              />
            ) : (
              <ProfessorReadonlyList
                professors={loaderData.choreography.professors}
              />
            )}
          </div>
        </div>
      </section>
    </>
  );
}

export default function PortalCoreografiaDetalleRoute({
  loaderData,
}: PortalCoreografiaDetalleRouteProps) {
  const actionData = useActionData<typeof action>();
  const [searchParams] = useSearchParams();

  return (
    <PortalCoreografiaDetalleRouteView
      loaderData={{
        ...loaderData,
        successMessage:
          readUpdatedSuccessMessage(searchParams) ?? loaderData.successMessage,
      }}
      actionData={actionData}
    />
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-600">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-slate-950">{value}</dd>
    </div>
  );
}

function ProfessorEditor({
  professors,
  selectedProfessorIds,
}: {
  professors: ChoreographyProfessorOption[];
  selectedProfessorIds: Set<string>;
}) {
  return (
    <form method="post" className="mt-4 space-y-4">
      <input
        type="hidden"
        name="intent"
        value={updateChoreographyProfessorsIntent}
      />
      {professors.length > 0 ? (
        <ul className="space-y-3">
          {professors.map((professor) => (
            <ProfessorOptionRow
              key={professor.id}
              professor={professor}
              selected={selectedProfessorIds.has(professor.id)}
            />
          ))}
        </ul>
      ) : (
        <p className="text-sm leading-6 text-slate-600">
          No hay Profesores activos o vinculados para editar en esta
          Coreografía.
        </p>
      )}

      <button
        type="submit"
        className="inline-flex h-10 items-center justify-center rounded-md bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
      >
        Guardar Profesores
      </button>
    </form>
  );
}

function ProfessorOptionRow({
  professor,
  selected,
}: {
  professor: ChoreographyProfessorOption;
  selected: boolean;
}) {
  return (
    <li className="rounded-md border border-slate-200 px-3 py-3">
      <label className="flex items-start justify-between gap-4">
        <span className="flex items-start gap-3">
          <input
            type="checkbox"
            name="professorIds"
            value={professor.id}
            defaultChecked={selected}
            className="mt-0.5 size-4 rounded border-slate-300 text-teal-700 focus:ring-teal-100"
          />
          <span>
            <span className="block text-sm font-medium text-slate-950">
              {professor.lastName}, {professor.firstName}
            </span>
            <span className="block text-sm text-slate-600">
              {getProfessorAvailabilityCopy(professor.active)}
            </span>
          </span>
        </span>
        {!professor.active ? <ArchivedBadge /> : null}
      </label>
    </li>
  );
}

function ProfessorReadonlyList({
  professors,
}: {
  professors: ChoreographyProfessor[];
}) {
  if (professors.length === 0) {
    return (
      <p className="mt-4 text-sm leading-6 text-slate-600">
        Esta Coreografía todavía no tiene Profesores vinculados.
      </p>
    );
  }

  return (
    <ul className="mt-4 space-y-3">
      {professors.map((professor) => (
        <li
          key={professor.id}
          className="flex items-center justify-between gap-4 rounded-md border border-slate-100 px-3 py-2"
        >
          <p className="text-sm font-medium text-slate-950">
            {professor.lastName}, {professor.firstName}
          </p>
          {!professor.active ? <ArchivedBadge /> : null}
        </li>
      ))}
    </ul>
  );
}

function OperationalStatusSummary({
  operationalStatus,
}: {
  operationalStatus: ChoreographyOperationalStatus;
}) {
  if (operationalStatus.code === "complete") {
    return (
      <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        Estado operativo al día.
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      Pendientes operativos:{" "}
      {operationalStatus.pendingItems
        .map(formatOperationalPendingItemLabel)
        .join(", ")}
    </div>
  );
}

function ArchivedBadge() {
  return (
    <span className="inline-flex rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
      Archivado
    </span>
  );
}

function DeleteChoreographyDialog({
  choreographyId,
  isOpen,
  onOpenChange,
  onOpenRequest,
  warningMessage,
}: {
  choreographyId: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenRequest: () => void;
  warningMessage: string | null;
}) {
  return (
    <>
      {isOpen ? (
        <div className="sr-only">
          <p>¿Eliminar Coreografía?</p>
          <p>
            En esta versión la eliminación es definitiva y libera el cupo del
            Cronograma.
          </p>
          {warningMessage ? <p>{warningMessage}</p> : null}
          <input type="hidden" name="intent" value={deleteChoreographyIntent} />
        </div>
      ) : null}
      <div>
        <Button type="button" variant="destructive" onClick={onOpenRequest}>
          <Trash2 aria-hidden="true" data-icon="inline-start" />
          Eliminar Coreografía
        </Button>
      </div>
      <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
        <AlertDialogContent
          forceMount
          className="w-[calc(100%-2rem)] max-w-lg gap-4 p-6 sm:max-w-lg"
        >
          <AlertDialogHeader className="flex flex-col items-start gap-1.5 text-left">
            <AlertDialogTitle>¿Eliminar Coreografía?</AlertDialogTitle>
            <AlertDialogDescription>
              En esta versión la eliminación es definitiva y libera el cupo del
              Cronograma.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {warningMessage ? (
            <p className="rounded-lg bg-muted px-4 py-3 text-sm leading-6 text-muted-foreground">
              {warningMessage}
            </p>
          ) : null}
          <AlertDialogFooter className="m-0 rounded-none border-0 bg-transparent p-0">
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <form method="post">
              <input
                type="hidden"
                name="intent"
                value={deleteChoreographyIntent}
              />
              <input
                type="hidden"
                name="confirmDeletion"
                value={choreographyId}
              />
              <Button type="submit" variant="destructive">
                <Trash2 aria-hidden="true" data-icon="inline-start" />
                Eliminar Coreografía
              </Button>
            </form>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="sr-only">Eliminar Coreografía</div>
    </>
  );
}

function getReadOnlyBadgeClassName(isReadOnly: boolean) {
  return isReadOnly
    ? "inline-flex rounded-md bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800"
    : "inline-flex rounded-md bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800";
}

function getProfessorSectionBadgeClassName(canEditProfessors: boolean) {
  return clsx(
    "inline-flex rounded-md px-2.5 py-1 text-xs font-semibold",
    canEditProfessors
      ? "bg-emerald-50 text-emerald-800"
      : "bg-slate-100 text-slate-700",
  );
}

function getProfessorSectionDescription(canEditProfessors: boolean) {
  return canEditProfessors
    ? "Actualizá los Profesores operativos aunque la inscripción esté cerrada."
    : "Los Profesores vinculados quedan en solo lectura para este Evento.";
}

function getProfessorAvailabilityCopy(isActive: boolean) {
  return isActive
    ? "Disponible para nuevas asignaciones."
    : "Archivado pero conservado por vínculo existente.";
}

function readChoreographyId(params: { choreographyId?: string }) {
  if (!params.choreographyId) {
    throw new Response(choreographyNotFoundMessage, { status: 404 });
  }

  return params.choreographyId;
}

function readFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

function readFormStringArray(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .flatMap((value) => (typeof value === "string" && value ? [value] : []));
}

async function handleUpdateChoreographyProfessorsAction(input: {
  academyId: string;
  eventId: string;
  choreographyId: string;
  professorIds: string[];
}) {
  const result = await updateChoreographyProfessors({
    academyId: input.academyId,
    eventId: input.eventId,
    choreographyId: input.choreographyId,
    professorIds: input.professorIds,
  });

  if (!result.ok) {
    return {
      status: "error" as const,
      message: result.message,
      selectedProfessorIds: input.professorIds,
    };
  }

  return redirect(
    `/portal/coreografias/${input.choreographyId}?${choreographyUpdatedSearchParam}=1`,
  );
}

async function handleDeleteChoreographyAction(input: {
  academyId: string;
  eventId: string;
  choreographyId: string;
}) {
  await deleteChoreography({
    academyId: input.academyId,
    eventId: input.eventId,
    choreographyId: input.choreographyId,
  });

  return redirect(`/portal/coreografias?${choreographyDeletedSearchParam}=1`);
}

function assertDeleteConfirmationMatches(
  formData: FormData,
  choreographyId: string,
) {
  if (formData.get("confirmDeletion") !== choreographyId) {
    throw new Response(unsupportedActionMessage, { status: 400 });
  }
}

function readUpdatedSuccessMessage(searchParams: URLSearchParams) {
  return searchParams.get(choreographyUpdatedSearchParam) === "1"
    ? choreographyUpdatedSuccessMessage
    : null;
}

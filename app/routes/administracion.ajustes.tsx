import { Settings } from "lucide-react";
import { redirect, useActionData } from "react-router";
import type { ReactNode } from "react";

import { AdminShell } from "@/components/admin-shell";
import type { experienceLevels, modalities, submodalities } from "@/db/schema";
import {
  createExperienceLevel,
  createModality,
  createScheduleBlock,
  createSubmodality,
  deleteExperienceLevel,
  deleteModality,
  deleteScheduleBlock,
  deleteSubmodality,
  listEventCatalogs,
  type ScheduleBlockInput,
  type ScheduleBlockListItem,
  updateExperienceLevel,
  updateModality,
  updateScheduleBlock,
  updateSubmodality,
} from "@/lib/admin-catalogs.server";
import {
  loadAdminEventContext,
  type AdminEventContext,
} from "@/lib/admin-event-context.server";
import { requireAdminPanelUser } from "@/lib/internal-navigation.server";

import type { Route } from "./+types/administracion.ajustes";

type ModalityRow = typeof modalities.$inferSelect;
type SubmodalityRow = typeof submodalities.$inferSelect;
type ExperienceLevelRow = typeof experienceLevels.$inferSelect;

type ActionData = {
  status: "error";
  message: string;
  fieldErrors: Record<string, string>;
};

type AdministracionAjustesRouteProps = {
  loaderData: {
    email: string;
    events: AdminEventContext["events"];
    selectedEventId: string | null;
    modalities: ModalityRow[];
    submodalities: SubmodalityRow[];
    experienceLevels: ExperienceLevelRow[];
    scheduleBlocks: ScheduleBlockListItem[];
  };
  actionData?: ActionData;
};

type CatalogActionInput = {
  eventId: string;
  id: string;
  intent: string;
  modalityId: string;
  modalityIds: string[];
  name: string;
  scheduledDate: string;
  startTime: string;
  totalCapacity: number;
};

export const meta = () => [{ title: "Ajustes de administración | En Escena" }];

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAdminPanelUser(request);
  const eventContext = await loadAdminEventContext(request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  const catalogs = eventContext.selectedEventId
    ? await listEventCatalogs(eventContext.selectedEventId)
    : {
        modalities: [],
        submodalities: [],
        experienceLevels: [],
        scheduleBlocks: [],
      };

  return {
    email: user.email,
    events: eventContext.events,
    selectedEventId: eventContext.selectedEventId,
    ...catalogs,
  };
}

export async function action({ request }: Route.ActionArgs) {
  await requireAdminPanelUser(request);

  const eventContext = await loadAdminEventContext(request);
  const eventId = eventContext.selectedEventId;

  if (!eventId) {
    return actionError("Elegí un Evento de trabajo antes de guardar ajustes.");
  }

  const formData = await request.formData();
  const result = await runCatalogIntent(
    readCatalogActionInput(eventId, formData),
  );

  if (!result.ok) {
    return actionError(result.error, result.fieldErrors);
  }

  throw redirect(`/administracion/ajustes?evento=${eventId}&guardado=1`);
}

export function AdministracionAjustesRouteView({
  loaderData,
  actionData: providedActionData,
}: AdministracionAjustesRouteProps) {
  return (
    <AdminShell
      email={loaderData.email}
      events={loaderData.events}
      selectedEventId={loaderData.selectedEventId}
      title="Ajustes de administración"
    >
      <div className="space-y-6">
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Settings aria-hidden="true" className="size-5 text-teal-700" />
            <h2 className="text-xl font-semibold text-slate-950">
              Catálogos del Evento
            </h2>
          </div>
          <p className="max-w-3xl text-sm leading-6 text-slate-600">
            Configurá Modalidades, Submodalidades, Niveles de experiencia y
            Bloques horarios para el Evento de trabajo seleccionado.
          </p>
        </section>

        {providedActionData ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            {providedActionData.message}
          </div>
        ) : null}

        {loaderData.selectedEventId ? (
          <div className="grid gap-6 xl:grid-cols-2">
            <CatalogSection title="Modalidades">
              <CatalogCreateForm
                intent="create-modality"
                label="Nombre de la Modalidad"
                buttonLabel="Crear Modalidad"
                fieldError={providedActionData?.fieldErrors.name}
              />
              {loaderData.modalities.length > 0 ? (
                <ul className="mt-4 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
                  {loaderData.modalities.map((modality) => (
                    <li key={modality.id} className="space-y-3 p-4">
                      <CatalogUpdateForm
                        id={modality.id}
                        intent="update-modality"
                        name={modality.name}
                        buttonLabel="Guardar"
                      />
                      <CatalogDeleteForm
                        id={modality.id}
                        intent="delete-modality"
                        buttonLabel="Borrar Modalidad"
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyCatalogState>
                  Todavía no hay Modalidades para este Evento.
                </EmptyCatalogState>
              )}
            </CatalogSection>

            <CatalogSection title="Bloques horarios">
              <ScheduleBlockForm
                intent="create-schedule-block"
                modalities={loaderData.modalities}
                buttonLabel="Crear Bloque"
                fieldErrors={providedActionData?.fieldErrors}
              />
              {loaderData.scheduleBlocks.length > 0 ? (
                <ul className="mt-4 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
                  {loaderData.scheduleBlocks.map((scheduleBlock) => (
                    <li key={scheduleBlock.id} className="space-y-3 p-4">
                      <ScheduleBlockSummary scheduleBlock={scheduleBlock} />
                      <ScheduleBlockForm
                        id={scheduleBlock.id}
                        intent="update-schedule-block"
                        modalities={loaderData.modalities}
                        name={scheduleBlock.name}
                        scheduledDate={scheduleBlock.scheduledDate}
                        startTime={scheduleBlock.startTime}
                        totalCapacity={scheduleBlock.totalCapacity}
                        modalityIds={scheduleBlock.modalityIds}
                        buttonLabel="Guardar"
                      />
                      <CatalogDeleteForm
                        id={scheduleBlock.id}
                        intent="delete-schedule-block"
                        buttonLabel="Borrar Bloque"
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyCatalogState>
                  Todavía no hay Bloques horarios para este Evento.
                </EmptyCatalogState>
              )}
            </CatalogSection>

            <CatalogSection title="Submodalidades">
              <SubmodalityForm
                intent="create-submodality"
                modalities={loaderData.modalities}
                buttonLabel="Crear Submodalidad"
                fieldErrors={providedActionData?.fieldErrors}
              />
              {loaderData.submodalities.length > 0 ? (
                <ul className="mt-4 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
                  {loaderData.submodalities.map((submodality) => (
                    <li key={submodality.id} className="space-y-3 p-4">
                      <SubmodalityForm
                        id={submodality.id}
                        intent="update-submodality"
                        modalities={loaderData.modalities}
                        name={submodality.name}
                        modalityId={submodality.modalityId}
                        buttonLabel="Guardar"
                      />
                      <CatalogDeleteForm
                        id={submodality.id}
                        intent="delete-submodality"
                        buttonLabel="Borrar Submodalidad"
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyCatalogState>
                  Todavía no hay Submodalidades para este Evento.
                </EmptyCatalogState>
              )}
            </CatalogSection>

            <CatalogSection title="Niveles de experiencia">
              <CatalogCreateForm
                intent="create-experience-level"
                label="Nombre del Nivel de experiencia"
                buttonLabel="Crear Nivel"
                fieldError={providedActionData?.fieldErrors.name}
              />
              {loaderData.experienceLevels.length > 0 ? (
                <ul className="mt-4 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
                  {loaderData.experienceLevels.map((level) => (
                    <li key={level.id} className="space-y-3 p-4">
                      <CatalogUpdateForm
                        id={level.id}
                        intent="update-experience-level"
                        name={level.name}
                        buttonLabel="Guardar"
                      />
                      <CatalogDeleteForm
                        id={level.id}
                        intent="delete-experience-level"
                        buttonLabel="Borrar Nivel"
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyCatalogState>
                  Todavía no hay Niveles de experiencia para este Evento.
                </EmptyCatalogState>
              )}
            </CatalogSection>
          </div>
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            Creá un Evento antes de configurar catálogos.
          </div>
        )}
      </div>
    </AdminShell>
  );
}

export default function AdministracionAjustesRoute({
  loaderData,
}: AdministracionAjustesRouteProps) {
  const actionData = useActionData<typeof action>();

  return (
    <AdministracionAjustesRouteView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}

function CatalogSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section>
      <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function CatalogCreateForm({
  buttonLabel,
  fieldError,
  intent,
  label,
}: {
  buttonLabel: string;
  fieldError?: string;
  intent: string;
  label: string;
}) {
  return (
    <form
      method="post"
      className="rounded-lg border border-slate-200 bg-white p-4"
    >
      <input type="hidden" name="intent" value={intent} />
      <label className="block text-sm font-medium text-slate-800">
        {label}
        <input
          name="name"
          className="mt-2 h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-950 outline-none transition focus:border-teal-700 focus:ring-4 focus:ring-teal-100"
        />
      </label>
      {fieldError ? (
        <p className="mt-2 text-xs font-medium text-red-700">{fieldError}</p>
      ) : null}
      <button
        type="submit"
        className="mt-3 inline-flex h-9 items-center justify-center rounded-md bg-teal-700 px-3 text-sm font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
      >
        {buttonLabel}
      </button>
    </form>
  );
}

function CatalogUpdateForm({
  buttonLabel,
  id,
  intent,
  name,
}: {
  buttonLabel: string;
  id: string;
  intent: string;
  name: string;
}) {
  return (
    <form method="post" className="flex flex-col gap-3 sm:flex-row">
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="id" value={id} />
      <label className="sr-only" htmlFor={`${intent}-${id}`}>
        Nombre
      </label>
      <input
        id={`${intent}-${id}`}
        name="name"
        defaultValue={name}
        className="h-10 min-w-0 flex-1 rounded-md border border-slate-300 px-3 text-sm text-slate-950 outline-none transition focus:border-teal-700 focus:ring-4 focus:ring-teal-100"
      />
      <button
        type="submit"
        className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
      >
        {buttonLabel}
      </button>
    </form>
  );
}

function SubmodalityForm({
  buttonLabel,
  fieldErrors = {},
  id,
  intent,
  modalities,
  modalityId,
  name,
}: {
  buttonLabel: string;
  fieldErrors?: Record<string, string>;
  id?: string;
  intent: string;
  modalities: ModalityRow[];
  modalityId?: string;
  name?: string;
}) {
  return (
    <form
      method="post"
      className="rounded-lg border border-slate-200 bg-white p-4"
    >
      <input type="hidden" name="intent" value={intent} />
      {id ? <input type="hidden" name="id" value={id} /> : null}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-slate-800">
          Modalidad
          <select
            name="modalityId"
            defaultValue={modalityId ?? ""}
            className="mt-2 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-teal-700 focus:ring-4 focus:ring-teal-100"
          >
            <option value="">Elegí una Modalidad</option>
            {modalities.map((modality) => (
              <option key={modality.id} value={modality.id}>
                {modality.name}
              </option>
            ))}
          </select>
        </label>
        {fieldErrors.modalityId ? (
          <p className="text-xs font-medium text-red-700">
            {fieldErrors.modalityId}
          </p>
        ) : null}

        <label className="block text-sm font-medium text-slate-800">
          Nombre de la Submodalidad
          <input
            name="name"
            defaultValue={name}
            className="mt-2 h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-950 outline-none transition focus:border-teal-700 focus:ring-4 focus:ring-teal-100"
          />
        </label>
        {fieldErrors.name ? (
          <p className="text-xs font-medium text-red-700">{fieldErrors.name}</p>
        ) : null}
      </div>
      <button
        type="submit"
        className="mt-3 inline-flex h-9 items-center justify-center rounded-md bg-teal-700 px-3 text-sm font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
      >
        {buttonLabel}
      </button>
    </form>
  );
}

function ScheduleBlockForm({
  buttonLabel,
  fieldErrors = {},
  id,
  intent,
  modalities,
  modalityIds = [],
  name,
  scheduledDate,
  startTime,
  totalCapacity,
}: {
  buttonLabel: string;
  fieldErrors?: Record<string, string>;
  id?: string;
  intent: string;
  modalities: ModalityRow[];
  modalityIds?: string[];
  name?: string;
  scheduledDate?: string;
  startTime?: string;
  totalCapacity?: number;
}) {
  return (
    <form
      method="post"
      className="rounded-lg border border-slate-200 bg-white p-4"
    >
      <input type="hidden" name="intent" value={intent} />
      {id ? <input type="hidden" name="id" value={id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-800 sm:col-span-2">
          Nombre del Bloque horario
          <input
            name="name"
            defaultValue={name}
            className="mt-2 h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-950 outline-none transition focus:border-teal-700 focus:ring-4 focus:ring-teal-100"
          />
        </label>
        {fieldErrors.name ? (
          <p className="text-xs font-medium text-red-700 sm:col-span-2">
            {fieldErrors.name}
          </p>
        ) : null}

        <label className="block text-sm font-medium text-slate-800">
          Fecha
          <input
            type="date"
            name="scheduledDate"
            defaultValue={scheduledDate}
            className="mt-2 h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-950 outline-none transition focus:border-teal-700 focus:ring-4 focus:ring-teal-100"
          />
        </label>
        <label className="block text-sm font-medium text-slate-800">
          Hora
          <input
            type="time"
            name="startTime"
            defaultValue={startTime}
            className="mt-2 h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-950 outline-none transition focus:border-teal-700 focus:ring-4 focus:ring-teal-100"
          />
        </label>
        {fieldErrors.scheduledDate ? (
          <p className="text-xs font-medium text-red-700">
            {fieldErrors.scheduledDate}
          </p>
        ) : null}
        {fieldErrors.startTime ? (
          <p className="text-xs font-medium text-red-700">
            {fieldErrors.startTime}
          </p>
        ) : null}

        <label className="block text-sm font-medium text-slate-800 sm:col-span-2">
          Cupo total
          <input
            type="number"
            min="1"
            step="1"
            name="totalCapacity"
            defaultValue={totalCapacity}
            className="mt-2 h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-950 outline-none transition focus:border-teal-700 focus:ring-4 focus:ring-teal-100"
          />
        </label>
        {fieldErrors.totalCapacity ? (
          <p className="text-xs font-medium text-red-700 sm:col-span-2">
            {fieldErrors.totalCapacity}
          </p>
        ) : null}
      </div>

      <fieldset className="mt-3 space-y-2">
        <legend className="text-sm font-medium text-slate-800">
          Modalidades aceptadas
        </legend>
        {modalities.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {modalities.map((modality) => (
              <label
                key={modality.id}
                className="flex min-h-10 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800"
              >
                <input
                  type="checkbox"
                  name="modalityIds"
                  value={modality.id}
                  defaultChecked={modalityIds.includes(modality.id)}
                  className="size-4 rounded border-slate-300 text-teal-700 focus:ring-teal-100"
                />
                {modality.name}
              </label>
            ))}
          </div>
        ) : (
          <p className="text-sm leading-6 text-slate-600">
            Creá una Modalidad antes de agregar Bloques horarios.
          </p>
        )}
        {fieldErrors.modalityIds ? (
          <p className="text-xs font-medium text-red-700">
            {fieldErrors.modalityIds}
          </p>
        ) : null}
      </fieldset>

      <button
        type="submit"
        className="mt-3 inline-flex h-9 items-center justify-center rounded-md bg-teal-700 px-3 text-sm font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
      >
        {buttonLabel}
      </button>
    </form>
  );
}

function ScheduleBlockSummary({
  scheduleBlock,
}: {
  scheduleBlock: ScheduleBlockListItem;
}) {
  return (
    <div className="space-y-1">
      <p className="text-sm font-semibold text-slate-950">
        {scheduleBlock.name}
      </p>
      <p className="text-sm text-slate-600">
        {formatDate(scheduleBlock.scheduledDate)} · {scheduleBlock.startTime} ·{" "}
        {scheduleBlock.totalCapacity} cupos
      </p>
      <p className="text-xs font-medium text-slate-500">
        {scheduleBlock.modalities.map((modality) => modality.name).join(", ")}
      </p>
    </div>
  );
}

function CatalogDeleteForm({
  buttonLabel,
  id,
  intent,
}: {
  buttonLabel: string;
  id: string;
  intent: string;
}) {
  return (
    <form method="post">
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="inline-flex h-9 items-center justify-center rounded-md border border-red-200 bg-white px-3 text-sm font-semibold text-red-700 transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-100"
      >
        {buttonLabel}
      </button>
    </form>
  );
}

function EmptyCatalogState({ children }: { children: ReactNode }) {
  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-5 text-sm leading-6 text-slate-600">
      {children}
    </div>
  );
}

function readCatalogActionInput(
  eventId: string,
  formData: FormData,
): CatalogActionInput {
  return {
    eventId,
    id: String(formData.get("id") ?? ""),
    intent: String(formData.get("intent") ?? ""),
    modalityId: String(formData.get("modalityId") ?? ""),
    modalityIds: formData.getAll("modalityIds").map(String),
    name: String(formData.get("name") ?? ""),
    scheduledDate: String(formData.get("scheduledDate") ?? ""),
    startTime: String(formData.get("startTime") ?? ""),
    totalCapacity: Number.parseInt(
      String(formData.get("totalCapacity") ?? ""),
      10,
    ),
  };
}

function actionError(
  message: string,
  fieldErrors: Record<string, string> = {},
): ActionData {
  return {
    status: "error",
    message,
    fieldErrors,
  };
}

async function runCatalogIntent(input: CatalogActionInput) {
  switch (input.intent) {
    case "create-modality":
      return createModality(input.eventId, { name: input.name });
    case "update-modality":
      return updateModality(input.id, { name: input.name });
    case "delete-modality":
      return deleteModality(input.id);
    case "create-submodality":
      return createSubmodality(input.eventId, {
        modalityId: input.modalityId,
        name: input.name,
      });
    case "update-submodality":
      return updateSubmodality(input.id, {
        modalityId: input.modalityId,
        name: input.name,
      });
    case "delete-submodality":
      return deleteSubmodality(input.id);
    case "create-experience-level":
      return createExperienceLevel(input.eventId, { name: input.name });
    case "update-experience-level":
      return updateExperienceLevel(input.id, { name: input.name });
    case "delete-experience-level":
      return deleteExperienceLevel(input.id);
    case "create-schedule-block":
      return createScheduleBlock(input.eventId, getScheduleBlockInput(input));
    case "update-schedule-block":
      return updateScheduleBlock(input.id, getScheduleBlockInput(input));
    case "delete-schedule-block":
      return deleteScheduleBlock(input.id);
    default:
      return {
        ok: false as const,
        code: "invalid-catalog" as const,
        error: "No se pudo interpretar la acción de ajustes.",
        fieldErrors: {},
      };
  }
}

function getScheduleBlockInput(input: CatalogActionInput): ScheduleBlockInput {
  return {
    name: input.name,
    scheduledDate: input.scheduledDate,
    startTime: input.startTime,
    totalCapacity: input.totalCapacity,
    modalityIds: input.modalityIds,
  };
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");

  if (!year || !month || !day) {
    return value;
  }

  return `${day}/${month}/${year}`;
}

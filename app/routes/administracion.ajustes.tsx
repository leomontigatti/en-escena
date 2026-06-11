import { Settings } from "lucide-react";
import {
  Link,
  NavLink,
  Outlet,
  redirect,
  useOutletContext,
} from "react-router";
import { Fragment, type ReactNode } from "react";

import { AdminShell } from "@/components/admin-shell";
import type {
  categories,
  experienceLevels,
  modalities,
  submodalities,
} from "@/db/schema";
import {
  createCategory,
  createExperienceLevel,
  createModality,
  createPrice,
  createScheduleEntry,
  createScheduleBlock,
  createSubmodality,
  deleteCategory,
  deleteExperienceLevel,
  deleteModality,
  deletePrice,
  deleteScheduleEntry,
  deleteScheduleBlock,
  deleteSubmodality,
  updateCategory,
  listEventCatalogs,
  type PriceInput,
  type PriceListItem,
  type ScheduleEntryInput,
  type ScheduleBlockInput,
  type ScheduleBlockListItem,
  updateExperienceLevel,
  updateModality,
  updatePrice,
  updateScheduleEntry,
  updateScheduleBlock,
  updateSubmodality,
  type CatalogDeleteResult,
  type CatalogMutationResult,
} from "@/lib/admin-catalogs.server";
import {
  loadAdminEventContext,
  type AdminEventContext,
} from "@/lib/admin-event-context.server";
import type { EventRegistrationReadiness } from "@/lib/event-registration-readiness";
import { getEventRegistrationReadiness } from "@/lib/event-registration-readiness.server";
import { requireAdminPanelUser } from "@/lib/internal-navigation.server";

import type { Route } from "./+types/administracion.ajustes";

type ModalityRow = typeof modalities.$inferSelect;
type SubmodalityRow = typeof submodalities.$inferSelect;
type ExperienceLevelRow = typeof experienceLevels.$inferSelect;
type CategoryRow = typeof categories.$inferSelect & {
  modalityIds: string[];
  experienceLevelIds: string[];
};
type PriceScope = {
  detail: string | null;
  label: string;
};

export type ActionData = {
  status: "error";
  message: string;
  fieldErrors: Record<string, string>;
};

export type AdministracionAjustesLoaderData = {
  email: string;
  events: AdminEventContext["events"];
  selectedEventId: string | null;
  modalities: ModalityRow[];
  submodalities: SubmodalityRow[];
  experienceLevels: ExperienceLevelRow[];
  categories: CategoryRow[];
  scheduleBlocks: ScheduleBlockListItem[];
  prices: PriceListItem[];
  registrationReadiness: EventRegistrationReadiness | null;
};

type AdministracionAjustesLayoutProps = {
  loaderData: AdministracionAjustesLoaderData;
  children: ReactNode;
};

type AdministracionAjustesSectionProps = {
  loaderData: AdministracionAjustesLoaderData;
  actionData?: ActionData;
};

type AdministracionAjustesSectionLayoutProps =
  AdministracionAjustesSectionProps & {
    breadcrumbItems?: BreadcrumbItem[];
    title: string;
    description: string;
    children: ReactNode;
  };

type BreadcrumbItem = {
  label: string;
  to?: string;
};

type AjustesSectionKey =
  | "categorias"
  | "modalidades"
  | "bloques-horarios"
  | "precios";

type CatalogActionInput = {
  eventId: string;
  confirmDelete: boolean;
  confirmDeletion: string;
  id: string;
  intent: string;
  capacity: number;
  scheduleBlockId: string;
  priceScheduleBlockId: string | null;
  minAge: number;
  maxAge: number;
  groupTypes: string[];
  groupType: string;
  modalityIds: string[];
  modalityId: string;
  newExperienceLevelName: string;
  name: string;
  experienceLevelIds: string[];
  scheduledDate: string;
  startTime: string;
  totalCapacity: number;
  amount: number;
};

type CatalogActionResult = CatalogDeleteResult | CatalogMutationResult;
type CategoryMutationIntent = "create-category" | "update-category";
type CategoryMutationInput = {
  name: string;
  minAge: number;
  maxAge: number;
  groupTypes: string[];
  modalityIds: string[];
  experienceLevelIds: string[];
};

const categoryFormDescription =
  "La edad mínima y la edad máxima son inclusivas.";
const categoryDeleteConfirmationMessage =
  "Confirmá el borrado de la Categoría antes de continuar.";
const PRICE_BASE_HELPER_TEXT =
  "El Precio base aplica cuando no existe un Precio específico para el Bloque horario.";
const scheduleBlockDeleteConfirmationMessage =
  "Confirmá el borrado del Bloque horario antes de continuar.";

const groupTypeLabels: Record<string, string> = {
  solo: "Solo",
  duo: "Dúo",
  trio: "Trío",
  grupal: "Grupal",
};

const groupTypeOptions = Object.entries(groupTypeLabels).map(
  ([value, label]) => ({
    value,
    label,
  }),
);

export const meta = () => [{ title: "Ajustes de administración | En Escena" }];

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAdminPanelUser(request);
  const eventContext = await loadAdminEventContext(request);

  if (eventContext.redirectTo) {
    throw redirect(eventContext.redirectTo);
  }

  const selectedEventId = eventContext.selectedEventId;
  const [catalogs, registrationReadiness] = selectedEventId
    ? await Promise.all([
        listEventCatalogs(selectedEventId),
        getEventRegistrationReadiness(selectedEventId),
      ])
    : [
        {
          categories: [],
          modalities: [],
          submodalities: [],
          experienceLevels: [],
          scheduleBlocks: [],
          prices: [],
        },
        null,
      ];

  return {
    email: user.email,
    events: eventContext.events,
    selectedEventId,
    registrationReadiness,
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
  const input = readCatalogActionInput(eventId, formData);

  if (requiresModalityDeletionConfirmation(request.url, input)) {
    return actionError("Confirmá el borrado de la Modalidad.");
  }

  if (requiresPriceDeletionConfirmation(request.url, input)) {
    return actionError("Confirmá el borrado del Precio.");
  }

  if (requiresScheduleBlockDeletionConfirmation(request.url, input)) {
    return actionError(scheduleBlockDeleteConfirmationMessage, {
      confirmDelete: scheduleBlockDeleteConfirmationMessage,
    });
  }

  const result = await runCatalogIntent(input);

  if (!result.ok) {
    return actionError(result.error, result.fieldErrors);
  }

  throw redirect(buildActionRedirectUrl(request.url, eventId, input, result));
}

export function useAdministracionAjustesLoaderData() {
  return useOutletContext<AdministracionAjustesLoaderData>();
}

export function AdministracionAjustesLayoutView({
  loaderData,
  children,
}: AdministracionAjustesLayoutProps) {
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
            Organizá la Configuración mínima del Evento de trabajo y navegá por
            Modalidades, Categorías, Bloques horarios y Precios desde un mismo
            contexto.
          </p>
        </section>

        <AjustesSectionNavigation
          selectedEventId={loaderData.selectedEventId}
        />

        {children}
      </div>
    </AdminShell>
  );
}

export function AdministracionAjustesIndexRouteView({
  loaderData,
}: {
  loaderData: AdministracionAjustesLoaderData;
}) {
  if (!loaderData.selectedEventId) {
    return <AjustesEmptyState />;
  }

  return (
    <div className="space-y-6">
      {loaderData.registrationReadiness ? (
        <RegistrationReadinessPanel
          readiness={loaderData.registrationReadiness}
        />
      ) : null}

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">
            Secciones de Ajustes
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
            La Configuración mínima se mantiene acá y cada catálogo tiene su
            propia ruta para editarlo con contexto.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {settingsSections.map((section) => (
            <NavLink
              key={section.key}
              to={buildSettingsPath(section.key, loaderData.selectedEventId)}
              className="rounded-lg border border-slate-200 bg-white p-5 transition-colors hover:border-teal-300 hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
            >
              <span className="text-sm font-semibold text-slate-950">
                {section.label}
              </span>
              <span className="mt-2 block text-sm leading-6 text-slate-600">
                {section.description}
              </span>
            </NavLink>
          ))}
        </div>
      </section>
    </div>
  );
}

export function AdministracionAjustesCategoriasRouteView({
  loaderData,
  actionData: providedActionData,
}: AdministracionAjustesSectionProps) {
  return (
    <AdministracionAjustesSectionLayout
      loaderData={loaderData}
      actionData={providedActionData}
      title="Categorías"
      description="Revisá las Categorías del Evento de trabajo y entrá a cada detalle para editar edades, Modalidades y Niveles de experiencia."
    >
      <CatalogSection title="Categorías">
        {loaderData.categories.length > 0 ? (
          <ul className="space-y-3">
            {loaderData.categories.map((category) => (
              <li
                key={category.id}
                className="rounded-lg border border-slate-200 bg-white p-4"
              >
                <CategoryListItem
                  category={category}
                  selectedEventId={loaderData.selectedEventId}
                  experienceLevels={loaderData.experienceLevels}
                />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyCatalogState>
            Todavía no hay Categorías para este Evento.
          </EmptyCatalogState>
        )}
        <div className="mt-4">
          <NavLink
            to={buildCategoryCreatePath(loaderData.selectedEventId)}
            className="inline-flex h-9 items-center justify-center rounded-md bg-teal-700 px-3 text-sm font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
          >
            Nueva Categoría
          </NavLink>
        </div>
      </CatalogSection>
    </AdministracionAjustesSectionLayout>
  );
}

export function AdministracionAjustesCategoriaNuevaRouteView({
  loaderData,
  actionData: providedActionData,
}: AdministracionAjustesSectionProps) {
  return (
    <AdministracionAjustesSectionLayout
      loaderData={loaderData}
      actionData={providedActionData}
      breadcrumbItems={[
        {
          label: "Categorías",
          to: buildSettingsPath("categorias", loaderData.selectedEventId),
        },
        { label: "Nueva Categoría" },
      ]}
      title="Nueva Categoría"
      description="Configurá edades, Tipos de grupo, Modalidades y Niveles de experiencia en un solo formulario."
    >
      <CategoryFormPanel
        title="Datos de la Categoría"
        description={categoryFormDescription}
      >
        <CategoryForm
          intent="create-category"
          modalities={loaderData.modalities}
          experienceLevels={loaderData.experienceLevels}
          buttonLabel="Crear Categoría"
          fieldErrors={providedActionData?.fieldErrors}
        />
      </CategoryFormPanel>
    </AdministracionAjustesSectionLayout>
  );
}

export function AdministracionAjustesCategoriaDetalleRouteView({
  loaderData,
  actionData: providedActionData,
  categoryId,
}: AdministracionAjustesSectionProps & { categoryId: string }) {
  const category = loaderData.categories.find(
    (currentCategory) => currentCategory.id === categoryId,
  );

  return (
    <AdministracionAjustesSectionLayout
      loaderData={loaderData}
      actionData={providedActionData}
      breadcrumbItems={[
        {
          label: "Categorías",
          to: buildSettingsPath("categorias", loaderData.selectedEventId),
        },
        { label: category?.name ?? "Categoría" },
      ]}
      title={category ? "Editar Categoría" : "Categoría no encontrada"}
      description={
        category
          ? "Actualizá la aplicabilidad de la Categoría y gestioná sus Niveles de experiencia desde este detalle."
          : "No encontramos la Categoría solicitada dentro del Evento de trabajo actual."
      }
    >
      {category ? (
        <div className="space-y-6">
          <CategoryFormPanel
            title={category.name}
            description={categoryFormDescription}
          >
            <CategoryForm
              id={category.id}
              intent="update-category"
              modalities={loaderData.modalities}
              experienceLevels={loaderData.experienceLevels}
              name={category.name}
              minAge={category.minAge}
              maxAge={category.maxAge}
              groupTypes={category.groupTypes}
              modalityIds={category.modalityIds}
              experienceLevelIds={category.experienceLevelIds}
              buttonLabel="Guardar cambios"
              fieldErrors={providedActionData?.fieldErrors}
            />
          </CategoryFormPanel>
          <CatalogSection title="Eliminar Categoría">
            <CategoryDeleteForm
              id={category.id}
              fieldErrors={providedActionData?.fieldErrors}
            />
          </CatalogSection>
        </div>
      ) : (
        <EmptyCatalogState>
          Volvé a la lista de Categorías y elegí otra para continuar.
        </EmptyCatalogState>
      )}
    </AdministracionAjustesSectionLayout>
  );
}

export function AdministracionAjustesModalidadesListRouteView({
  loaderData,
}: {
  loaderData: AdministracionAjustesLoaderData;
}) {
  const submodalitiesByModalityId = groupSubmodalitiesByModalityId(
    loaderData.submodalities,
  );

  return (
    <AdministracionAjustesSectionLayout
      loaderData={loaderData}
      title="Modalidades"
      description="Gestioná Modalidades desde una lista propia y revisá sus opciones hijas dentro del detalle."
    >
      <CatalogSection title="Modalidades">
        {loaderData.modalities.length > 0 ? (
          <ul className={catalogListClassName}>
            {loaderData.modalities.map((modality) => (
              <li
                key={modality.id}
                className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="space-y-3">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-950">
                      {modality.name}
                    </h4>
                    <p className="mt-1 text-sm text-slate-600">
                      Opciones hijas asociadas a esta Modalidad.
                    </p>
                  </div>
                  <SubmodalityBadgeList
                    submodalities={
                      submodalitiesByModalityId.get(modality.id) ?? []
                    }
                  />
                </div>
                <Link
                  to={buildModalidadDetallePath(
                    modality.id,
                    loaderData.selectedEventId,
                  )}
                  className={secondaryLinkButtonClassName}
                >
                  Ver detalle
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyCatalogState>
            Todavía no hay Modalidades para este Evento.
          </EmptyCatalogState>
        )}
      </CatalogSection>
      <Link
        to={buildNuevaModalidadPath(loaderData.selectedEventId)}
        className={primaryLinkButtonClassName}
      >
        Nueva Modalidad
      </Link>
    </AdministracionAjustesSectionLayout>
  );
}

export function AdministracionAjustesNuevaModalidadRouteView({
  loaderData,
  actionData: providedActionData,
}: AdministracionAjustesSectionProps) {
  return (
    <AdministracionAjustesSectionLayout
      loaderData={loaderData}
      actionData={providedActionData}
      breadcrumbItems={[
        {
          label: "Modalidades",
          to: buildSettingsPath("modalidades", loaderData.selectedEventId),
        },
        { label: "Nueva Modalidad" },
      ]}
      title="Nueva Modalidad"
      description="Creá una Modalidad en una ruta dedicada y completá sus Submodalidades desde el detalle."
    >
      <CatalogSection title="Datos de la Modalidad">
        <ModalityForm
          intent="create-modality"
          buttonLabel="Crear Modalidad"
          fieldErrors={providedActionData?.fieldErrors}
        />
      </CatalogSection>
    </AdministracionAjustesSectionLayout>
  );
}

export function AdministracionAjustesModalidadDetalleRouteView({
  loaderData,
  actionData: providedActionData,
  modalityId,
}: AdministracionAjustesSectionProps & { modalityId: string }) {
  const modality = loaderData.modalities.find(
    (record) => record.id === modalityId,
  );
  const modalitySubmodalities = loaderData.submodalities.filter(
    (submodality) => submodality.modalityId === modalityId,
  );

  return (
    <AdministracionAjustesSectionLayout
      loaderData={loaderData}
      actionData={providedActionData}
      breadcrumbItems={[
        {
          label: "Modalidades",
          to: buildSettingsPath("modalidades", loaderData.selectedEventId),
        },
        { label: modality?.name ?? "Modalidad" },
      ]}
      title={modality?.name ?? "Detalle de Modalidad"}
      description="Editá la Modalidad, gestioná sus Submodalidades y resolvé acciones destructivas con contexto."
    >
      {modality ? (
        <div className="space-y-6">
          <CatalogSection title="Datos de la Modalidad">
            <ModalityForm
              id={modality.id}
              intent="update-modality"
              name={modality.name}
              buttonLabel="Guardar Modalidad"
              fieldErrors={providedActionData?.fieldErrors}
            />
          </CatalogSection>
          <CatalogSection title="Submodalidades">
            <SubmodalityForm
              intent="create-submodality"
              modalities={[modality]}
              modalityId={modality.id}
              buttonLabel="Crear Submodalidad"
              fieldErrors={providedActionData?.fieldErrors}
            />
            {modalitySubmodalities.length > 0 ? (
              <ul className={catalogListClassName}>
                {modalitySubmodalities.map((submodality) => (
                  <li key={submodality.id} className="space-y-3 p-4">
                    <SubmodalityForm
                      id={submodality.id}
                      intent="update-submodality"
                      modalities={[modality]}
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
                Todavía no hay Submodalidades para esta Modalidad.
              </EmptyCatalogState>
            )}
          </CatalogSection>
          <CatalogSection title="Borrar Modalidad">
            <ModalityDeleteForm id={modality.id} />
          </CatalogSection>
        </div>
      ) : (
        <EmptyCatalogState>No encontramos esa Modalidad.</EmptyCatalogState>
      )}
    </AdministracionAjustesSectionLayout>
  );
}

export function AdministracionAjustesBloquesHorariosRouteView({
  loaderData,
}: {
  loaderData: AdministracionAjustesLoaderData;
}) {
  return (
    <AdministracionAjustesSectionLayout
      loaderData={loaderData}
      title="Bloques horarios"
      description="Consultá capacidad, Modalidades aceptadas y Ocupación reservada por Cronogramas."
    >
      <CatalogSection title="Bloques horarios">
        {loaderData.scheduleBlocks.length > 0 ? (
          <ScheduleBlockList
            scheduleBlocks={loaderData.scheduleBlocks}
            selectedEventId={loaderData.selectedEventId}
          />
        ) : (
          <EmptyCatalogState>
            Todavía no hay Bloques horarios para este Evento.
          </EmptyCatalogState>
        )}
        <div className="mt-4">
          <Link
            to={buildNewScheduleBlockPath(loaderData.selectedEventId)}
            className={primaryLinkButtonClassName}
          >
            Nuevo Bloque horario
          </Link>
        </div>
      </CatalogSection>
    </AdministracionAjustesSectionLayout>
  );
}

export function AdministracionAjustesNuevoBloqueHorarioRouteView({
  loaderData,
  actionData,
}: AdministracionAjustesSectionProps) {
  return (
    <AdministracionAjustesSectionLayout
      loaderData={loaderData}
      actionData={actionData}
      breadcrumbItems={[
        {
          label: "Bloques horarios",
          to: buildScheduleBlocksPath(loaderData.selectedEventId),
        },
        { label: "Nuevo Bloque horario" },
      ]}
      title="Nuevo Bloque horario"
      description="Definí fecha, hora, cupo total y Modalidades aceptadas para este Bloque horario."
    >
      <CatalogSection title="Crear Bloque horario">
        <ScheduleBlockForm
          intent="create-schedule-block"
          modalities={loaderData.modalities}
          buttonLabel="Crear Bloque horario"
          fieldErrors={actionData?.fieldErrors}
        />
      </CatalogSection>
    </AdministracionAjustesSectionLayout>
  );
}

export function AdministracionAjustesDetalleBloqueHorarioRouteView({
  actionData,
  loaderData,
  scheduleBlockId,
}: AdministracionAjustesSectionProps & { scheduleBlockId: string }) {
  const scheduleBlock = loaderData.scheduleBlocks.find(
    (block) => block.id === scheduleBlockId,
  );
  const scheduleBlockName = scheduleBlock?.name ?? "Bloque horario";

  return (
    <AdministracionAjustesSectionLayout
      loaderData={loaderData}
      actionData={actionData}
      breadcrumbItems={[
        {
          label: "Bloques horarios",
          to: buildScheduleBlocksPath(loaderData.selectedEventId),
        },
        { label: scheduleBlockName },
      ]}
      title={scheduleBlockName}
      description="Editá el Bloque horario y gestioná sus Cronogramas dentro del mismo detalle."
    >
      {scheduleBlock ? (
        <div className="space-y-6">
          <CatalogSection title="Detalle del Bloque horario">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4">
              <ScheduleBlockSummary scheduleBlock={scheduleBlock} />
            </div>
            <div className="mt-4">
              <ScheduleBlockForm
                id={scheduleBlock.id}
                intent="update-schedule-block"
                modalities={loaderData.modalities}
                name={scheduleBlock.name}
                scheduledDate={scheduleBlock.scheduledDate}
                startTime={scheduleBlock.startTime}
                totalCapacity={scheduleBlock.totalCapacity}
                modalityIds={scheduleBlock.modalityIds}
                buttonLabel="Guardar cambios"
                fieldErrors={actionData?.fieldErrors}
              />
            </div>
          </CatalogSection>
          <CatalogSection title="Cronogramas">
            <ScheduleEntriesPanel
              scheduleBlock={scheduleBlock}
              fieldErrors={actionData?.fieldErrors}
            />
          </CatalogSection>
          <CatalogSection title="Borrar Bloque horario">
            <ScheduleBlockDeleteForm
              scheduleBlock={scheduleBlock}
              fieldErrors={actionData?.fieldErrors}
            />
          </CatalogSection>
        </div>
      ) : (
        <EmptyCatalogState>
          No encontramos ese Bloque horario para este Evento.
        </EmptyCatalogState>
      )}
    </AdministracionAjustesSectionLayout>
  );
}

export function AdministracionAjustesPreciosRouteView({
  loaderData,
}: {
  loaderData: AdministracionAjustesLoaderData;
}) {
  return (
    <AdministracionAjustesSectionLayout
      loaderData={loaderData}
      title="Precios"
      description="Revisá el alcance y el importe de cada Precio del Evento de trabajo."
    >
      <CatalogSection title="Precios">
        {loaderData.prices.length > 0 ? (
          <PriceListTable
            prices={loaderData.prices}
            selectedEventId={loaderData.selectedEventId}
          />
        ) : (
          <EmptyCatalogState>
            Todavía no hay Precios para este Evento.
          </EmptyCatalogState>
        )}
        <div className="mt-4">
          <Link
            to={buildPriceCreatePath(loaderData.selectedEventId)}
            className={primaryLinkButtonClassName}
          >
            Crear Precio
          </Link>
        </div>
      </CatalogSection>
    </AdministracionAjustesSectionLayout>
  );
}

export function AdministracionAjustesPrecioNuevaRouteView({
  loaderData,
  actionData,
}: AdministracionAjustesSectionProps) {
  return (
    <AdministracionAjustesSectionLayout
      loaderData={loaderData}
      actionData={actionData}
      breadcrumbItems={[
        {
          label: "Precios",
          to: buildSettingsPath("precios", loaderData.selectedEventId),
        },
        { label: "Nuevo Precio" },
      ]}
      title="Nuevo Precio"
      description="Configurá nombre, Tipo de grupo, importe y si el Precio aplica como base o para un Bloque horario específico."
    >
      <CatalogSection title="Datos del Precio">
        <PriceForm
          intent="create-price"
          scheduleBlocks={loaderData.scheduleBlocks}
          buttonLabel="Crear Precio"
          fieldErrors={actionData?.fieldErrors}
          helperText={PRICE_BASE_HELPER_TEXT}
        />
      </CatalogSection>
    </AdministracionAjustesSectionLayout>
  );
}

export function AdministracionAjustesPrecioDetalleRouteView({
  loaderData,
  actionData,
  priceId,
}: AdministracionAjustesSectionProps & { priceId: string }) {
  const price = loaderData.prices.find((item) => item.id === priceId);

  return (
    <AdministracionAjustesSectionLayout
      loaderData={loaderData}
      actionData={actionData}
      breadcrumbItems={[
        {
          label: "Precios",
          to: buildSettingsPath("precios", loaderData.selectedEventId),
        },
        { label: price?.name ?? "Precio" },
      ]}
      title={price?.name ?? "Precio no encontrado"}
      description={
        price
          ? "Editá el alcance y el importe del Precio. El borrado solo está disponible desde esta pantalla."
          : "No encontramos ese Precio dentro del Evento de trabajo seleccionado."
      }
    >
      {price ? (
        <div className="space-y-6">
          <CatalogSection title="Resumen">
            <PriceSummaryCard price={price} />
          </CatalogSection>
          <CatalogSection title="Editar Precio">
            <PriceForm
              id={price.id}
              intent="update-price"
              scheduleBlocks={loaderData.scheduleBlocks}
              name={price.name}
              groupType={price.groupType}
              amount={price.amount}
              scheduleBlockId={price.scheduleBlockId}
              buttonLabel="Guardar"
              fieldErrors={actionData?.fieldErrors}
              helperText={PRICE_BASE_HELPER_TEXT}
            />
          </CatalogSection>
          <CatalogSection title="Eliminar Precio">
            <PriceDeleteForm priceId={price.id} />
          </CatalogSection>
        </div>
      ) : (
        <EmptyCatalogState>
          No encontramos ese Precio. Volvé a la lista para elegir otro registro.
        </EmptyCatalogState>
      )}
    </AdministracionAjustesSectionLayout>
  );
}

export default function AdministracionAjustesRoute({
  loaderData,
}: {
  loaderData: AdministracionAjustesLoaderData;
}) {
  return (
    <AdministracionAjustesLayoutView loaderData={loaderData}>
      <Outlet context={loaderData} />
    </AdministracionAjustesLayoutView>
  );
}

const settingsSections: Array<{
  key: AjustesSectionKey;
  label: string;
  description: string;
}> = [
  {
    key: "modalidades",
    label: "Modalidades",
    description: "Gestioná Modalidades y Submodalidades del Evento.",
  },
  {
    key: "categorias",
    label: "Categorías",
    description:
      "Agrupá edades, Tipos de grupo, Modalidades y Niveles de experiencia.",
  },
  {
    key: "bloques-horarios",
    label: "Bloques horarios",
    description: "Definí capacidad, horarios y Cronogramas de programación.",
  },
  {
    key: "precios",
    label: "Precios",
    description: "Configurá importes generales y por Bloque horario.",
  },
];

const catalogListClassName =
  "mt-4 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white";
const primaryLinkButtonClassName =
  "inline-flex h-9 items-center justify-center rounded-md bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100";
const secondaryLinkButtonClassName =
  "inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100";
const modalityRoutes = {
  detail: "/administracion/ajustes/modalidades",
  list: "/administracion/ajustes/modalidades",
  new: "/administracion/ajustes/modalidades/nueva",
} as const;

function buildSettingsPath(
  section: AjustesSectionKey | null,
  selectedEventId: string | null,
) {
  return appendSelectedEventId(
    section ? `/administracion/ajustes/${section}` : "/administracion/ajustes",
    selectedEventId,
  );
}

function buildCategoryCreatePath(selectedEventId: string | null) {
  return appendSelectedEventId(
    "/administracion/ajustes/categorias/nueva",
    selectedEventId,
  );
}

function buildCategoryDetailPath(
  categoryId: string,
  selectedEventId: string | null,
) {
  return appendSelectedEventId(
    `/administracion/ajustes/categorias/${categoryId}`,
    selectedEventId,
  );
}

function buildModalidadesListPath(selectedEventId: string | null) {
  return appendSelectedEventId(modalityRoutes.list, selectedEventId);
}

function buildNuevaModalidadPath(selectedEventId: string | null) {
  return appendSelectedEventId(modalityRoutes.new, selectedEventId);
}

function buildModalidadDetallePath(
  modalityId: string,
  selectedEventId: string | null,
) {
  return appendSelectedEventId(
    `${modalityRoutes.detail}/${modalityId}`,
    selectedEventId,
  );
}

function buildPriceListPath(selectedEventId: string | null) {
  return appendSelectedEventId(
    "/administracion/ajustes/precios",
    selectedEventId,
  );
}

function buildPriceCreatePath(selectedEventId: string | null) {
  return appendSelectedEventId(
    "/administracion/ajustes/precios/nuevo",
    selectedEventId,
  );
}

function buildPriceDetailPath(priceId: string, selectedEventId: string | null) {
  return appendSelectedEventId(
    `/administracion/ajustes/precios/${priceId}`,
    selectedEventId,
  );
}

function buildScheduleBlocksPath(selectedEventId: string | null) {
  return appendSelectedEventId(
    "/administracion/ajustes/bloques-horarios",
    selectedEventId,
  );
}

function buildNewScheduleBlockPath(selectedEventId: string | null) {
  return appendSelectedEventId(
    "/administracion/ajustes/bloques-horarios/nuevo",
    selectedEventId,
  );
}

function buildScheduleBlockDetailPath(
  scheduleBlockId: string,
  selectedEventId: string | null,
) {
  return appendSelectedEventId(
    `/administracion/ajustes/bloques-horarios/${scheduleBlockId}`,
    selectedEventId,
  );
}

function isModalityDetailPath(requestUrl: string) {
  return new RegExp(`^${modalityRoutes.detail}/[^/]+$`).test(
    new URL(requestUrl).pathname,
  );
}

function requiresModalityDeletionConfirmation(
  requestUrl: string,
  input: CatalogActionInput,
) {
  return (
    input.intent === "delete-modality" &&
    isModalityDetailPath(requestUrl) &&
    input.confirmDeletion !== input.id
  );
}

function requiresPriceDeletionConfirmation(
  requestUrl: string,
  input: CatalogActionInput,
) {
  return (
    input.intent === "delete-price" &&
    new RegExp("^/administracion/ajustes/precios/[^/]+$").test(
      new URL(requestUrl).pathname,
    ) &&
    input.confirmDeletion !== input.id
  );
}

function requiresScheduleBlockDeletionConfirmation(
  requestUrl: string,
  input: CatalogActionInput,
) {
  return (
    input.intent === "delete-schedule-block" &&
    new RegExp("^/administracion/ajustes/bloques-horarios/[^/]+$").test(
      new URL(requestUrl).pathname,
    ) &&
    !input.confirmDelete
  );
}

function appendSelectedEventId(
  pathname: string,
  selectedEventId: string | null,
) {
  if (!selectedEventId) {
    return pathname;
  }

  return `${pathname}?evento=${selectedEventId}`;
}

function ActionErrorBanner({ actionData }: { actionData?: ActionData }) {
  if (!actionData) {
    return null;
  }

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
      {actionData.message}
    </div>
  );
}

function AdministracionAjustesSectionLayout({
  breadcrumbItems,
  loaderData,
  actionData,
  title,
  description,
  children,
}: AdministracionAjustesSectionLayoutProps) {
  if (!loaderData.selectedEventId) {
    return <AjustesEmptyState />;
  }

  return (
    <div className="space-y-6">
      <AjustesBreadcrumbs
        items={breadcrumbItems ?? [{ label: title }]}
        selectedEventId={loaderData.selectedEventId}
      />
      <AjustesSectionHeader title={title} description={description} />
      <ActionErrorBanner actionData={actionData} />
      {children}
    </div>
  );
}

function AjustesSectionNavigation({
  selectedEventId,
}: {
  selectedEventId: string | null;
}) {
  return (
    <nav aria-label="Secciones de Ajustes">
      <ul className="flex flex-wrap gap-2">
        <li>
          <NavLink
            to={buildSettingsPath(null, selectedEventId)}
            className={({ isActive }) => buildSettingsNavLinkClass(isActive)}
            end
          >
            Índice
          </NavLink>
        </li>
        {settingsSections.map((section) => (
          <li key={section.key}>
            <NavLink
              to={buildSettingsPath(section.key, selectedEventId)}
              className={({ isActive }) => buildSettingsNavLinkClass(isActive)}
            >
              {section.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function buildSettingsNavLinkClass(isCurrent: boolean) {
  const baseClassName =
    "inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100";

  if (isCurrent) {
    return `${baseClassName} border-teal-300 bg-teal-50 text-teal-900`;
  }

  return `${baseClassName} border-slate-300 bg-white text-slate-700 hover:border-teal-300 hover:bg-teal-50 hover:text-slate-950`;
}

function AjustesBreadcrumbs({
  items,
  selectedEventId,
}: {
  items: BreadcrumbItem[];
  selectedEventId: string | null;
}) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-slate-600">
      <ol className="flex flex-wrap items-center gap-2">
        <li>
          <NavLink
            to={buildSettingsPath(null, selectedEventId)}
            className="font-medium text-slate-700 underline-offset-4 hover:text-slate-950 hover:underline"
          >
            Ajustes
          </NavLink>
        </li>
        {items.map((item, index) => (
          <Fragment key={`${item.label}-${index}`}>
            <li aria-hidden="true" className="text-slate-400">
              /
            </li>
            <li className="font-medium text-slate-950">
              {item.to ? (
                <NavLink
                  to={item.to}
                  className="font-medium text-slate-700 underline-offset-4 hover:text-slate-950 hover:underline"
                >
                  {item.label}
                </NavLink>
              ) : (
                item.label
              )}
            </li>
          </Fragment>
        ))}
      </ol>
    </nav>
  );
}

function AjustesSectionHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <header className="space-y-1">
      <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
      <p className="max-w-3xl text-sm leading-6 text-slate-600">
        {description}
      </p>
    </header>
  );
}

function AjustesEmptyState() {
  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-900">
      <h2 className="text-base font-semibold text-amber-950">
        Elegí un Evento de trabajo para configurar Ajustes
      </h2>
      <p className="mt-2">
        Creá un Evento o seleccioná uno existente para editar Modalidades,
        Categorías, Bloques horarios y Precios.
      </p>
    </section>
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

function RegistrationReadinessPanel({
  readiness,
}: {
  readiness: EventRegistrationReadiness;
}) {
  const appearance = readiness.isReady
    ? {
        className: "border-emerald-200 bg-emerald-50 text-emerald-900",
        titleClassName: "text-emerald-950",
        title: "Configuración mínima lista",
        description:
          "Este Evento ya tiene la configuración mínima para registrar coreografías.",
      }
    : {
        className: "border-amber-200 bg-amber-50 text-amber-900",
        titleClassName: "text-amber-950",
        title: "Configuración mínima pendiente",
        description:
          "El Evento de trabajo todavía no tiene todo lo necesario para habilitar el registro de coreografías.",
      };

  return (
    <section
      className={`rounded-lg border px-4 py-4 text-sm ${appearance.className}`}
    >
      <h3 className={`text-base font-semibold ${appearance.titleClassName}`}>
        {appearance.title}
      </h3>
      <p className="mt-2 leading-6">{appearance.description}</p>
      {readiness.isReady ? null : (
        <ul className="mt-3 space-y-2">
          {readiness.missingItems.map((item) => (
            <li key={`${item.code}-${item.detail}`} className="leading-6">
              {item.detail}
            </li>
          ))}
        </ul>
      )}
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

function groupSubmodalitiesByModalityId(submodalities: SubmodalityRow[]) {
  const submodalitiesByModalityId = new Map<string, SubmodalityRow[]>();

  for (const submodality of submodalities) {
    const groupedSubmodalities =
      submodalitiesByModalityId.get(submodality.modalityId) ?? [];

    groupedSubmodalities.push(submodality);
    submodalitiesByModalityId.set(submodality.modalityId, groupedSubmodalities);
  }

  return submodalitiesByModalityId;
}

function SubmodalityBadgeList({
  submodalities,
}: {
  submodalities: SubmodalityRow[];
}) {
  if (submodalities.length === 0) {
    return (
      <p className="text-sm text-slate-500">Sin opciones hijas asociadas.</p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {submodalities.map((submodality) => (
        <span
          key={submodality.id}
          className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700"
        >
          {submodality.name}
        </span>
      ))}
    </div>
  );
}

function ModalityForm({
  buttonLabel,
  fieldErrors = {},
  id,
  intent,
  name,
}: {
  buttonLabel: string;
  fieldErrors?: Record<string, string>;
  id?: string;
  intent: string;
  name?: string;
}) {
  return (
    <form
      method="post"
      className="rounded-lg border border-slate-200 bg-white p-4"
    >
      <input type="hidden" name="intent" value={intent} />
      {id ? <input type="hidden" name="id" value={id} /> : null}
      <label className="block text-sm font-medium text-slate-800">
        Nombre de la Modalidad
        <input
          name="name"
          defaultValue={name}
          className="mt-2 h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-950 outline-none transition focus:border-teal-700 focus:ring-4 focus:ring-teal-100"
        />
      </label>
      {fieldErrors.name ? (
        <p className="mt-2 text-xs font-medium text-red-700">
          {fieldErrors.name}
        </p>
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

function ModalityDeleteForm({ id }: { id: string }) {
  return (
    <form
      method="post"
      className="rounded-lg border border-red-200 bg-red-50 p-4"
    >
      <input type="hidden" name="intent" value="delete-modality" />
      <input type="hidden" name="id" value={id} />
      <p className="text-sm leading-6 text-red-900">
        Esta acción borra la Modalidad si no tiene Submodalidades, Categorías o
        Bloques horarios relacionados.
      </p>
      <label className="mt-3 block text-sm font-medium text-red-900">
        Confirmación
        <input
          name="confirmDeletion"
          className="mt-2 h-10 w-full rounded-md border border-red-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-red-700 focus:ring-4 focus:ring-red-100"
          placeholder="Pegá el ID de la Modalidad para confirmar"
        />
      </label>
      <button
        type="submit"
        className="mt-3 inline-flex h-9 items-center justify-center rounded-md border border-red-200 bg-white px-3 text-sm font-semibold text-red-700 transition hover:bg-red-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-100"
      >
        Borrar Modalidad
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
        <p className="text-xs text-slate-500">
          La Ocupación reservada por Cronogramas no puede superar el cupo total
          del Bloque horario.
        </p>
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
    <div className="space-y-3">
      <p className="text-sm font-semibold text-slate-950">
        {scheduleBlock.name}
      </p>
      <dl className="grid gap-3 text-sm text-slate-600 sm:grid-cols-4">
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Fecha
          </dt>
          <dd className="mt-1 text-sm text-slate-950">
            {formatDate(scheduleBlock.scheduledDate)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Hora
          </dt>
          <dd className="mt-1 text-sm text-slate-950">
            {scheduleBlock.startTime}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Ocupación
          </dt>
          <dd className="mt-1 text-sm text-slate-950">
            {formatScheduleBlockOccupancy(scheduleBlock)}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Cupo total
          </dt>
          <dd className="mt-1 text-sm text-slate-950">
            {scheduleBlock.totalCapacity}
          </dd>
        </div>
      </dl>
      <ScheduleBlockModalityBadges scheduleBlock={scheduleBlock} />
    </div>
  );
}

function ScheduleBlockList({
  scheduleBlocks,
  selectedEventId,
}: {
  scheduleBlocks: ScheduleBlockListItem[];
  selectedEventId: string | null;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-50">
          <tr className="text-left text-sm text-slate-600">
            <th className="px-4 py-3 font-medium">Nombre</th>
            <th className="px-4 py-3 font-medium">Modalidades</th>
            <th className="px-4 py-3 font-medium">Fecha</th>
            <th className="px-4 py-3 font-medium">Hora</th>
            <th className="px-4 py-3 font-medium">Ocupación</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {scheduleBlocks.map((scheduleBlock) => (
            <tr key={scheduleBlock.id} className="align-top">
              <td className="px-4 py-4">
                <Link
                  to={buildScheduleBlockDetailPath(
                    scheduleBlock.id,
                    selectedEventId,
                  )}
                  className="font-semibold text-slate-950 underline-offset-4 hover:text-teal-900 hover:underline"
                >
                  {scheduleBlock.name}
                </Link>
              </td>
              <td className="px-4 py-4">
                <ScheduleBlockModalityBadges scheduleBlock={scheduleBlock} />
              </td>
              <td className="px-4 py-4 text-sm text-slate-700">
                {formatDate(scheduleBlock.scheduledDate)}
              </td>
              <td className="px-4 py-4 text-sm text-slate-700">
                {scheduleBlock.startTime}
              </td>
              <td className="px-4 py-4 text-sm font-medium text-slate-950">
                {formatScheduleBlockOccupancy(scheduleBlock)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PriceForm({
  amount,
  buttonLabel,
  fieldErrors = {},
  groupType,
  helperText,
  id,
  intent,
  name,
  scheduleBlockId,
  scheduleBlocks,
}: {
  amount?: number;
  buttonLabel: string;
  fieldErrors?: Record<string, string>;
  groupType?: string;
  helperText?: string;
  id?: string;
  intent: string;
  name?: string;
  scheduleBlockId?: string | null;
  scheduleBlocks: ScheduleBlockListItem[];
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
          Nombre del Precio
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
          Tipo de grupo
          <select
            name="groupType"
            defaultValue={groupType ?? ""}
            className="mt-2 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-teal-700 focus:ring-4 focus:ring-teal-100"
          >
            <option value="">Elegí un Tipo</option>
            {groupTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-800">
          Monto
          <input
            type="number"
            min="1"
            step="1"
            name="amount"
            defaultValue={amount}
            className="mt-2 h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-950 outline-none transition focus:border-teal-700 focus:ring-4 focus:ring-teal-100"
          />
        </label>
        {fieldErrors.groupType ? (
          <p className="text-xs font-medium text-red-700">
            {fieldErrors.groupType}
          </p>
        ) : null}
        {fieldErrors.amount ? (
          <p className="text-xs font-medium text-red-700">
            {fieldErrors.amount}
          </p>
        ) : null}

        <label className="block text-sm font-medium text-slate-800 sm:col-span-2">
          Bloque horario opcional
          <select
            name="scheduleBlockId"
            defaultValue={scheduleBlockId ?? ""}
            className="mt-2 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-teal-700 focus:ring-4 focus:ring-teal-100"
          >
            <option value="">Precio general</option>
            {scheduleBlocks.map((scheduleBlock) => (
              <option key={scheduleBlock.id} value={scheduleBlock.id}>
                {scheduleBlock.name}
              </option>
            ))}
          </select>
        </label>
        {fieldErrors.scheduleBlockId ? (
          <p className="text-xs font-medium text-red-700 sm:col-span-2">
            {fieldErrors.scheduleBlockId}
          </p>
        ) : null}
        {helperText ? (
          <p className="text-xs text-slate-500 sm:col-span-2">{helperText}</p>
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

function ScheduleEntrySummary({
  scheduleEntry,
}: {
  scheduleEntry: ScheduleBlockListItem["scheduleEntries"][number];
}) {
  return (
    <div className="space-y-1 text-sm text-slate-700">
      <p className="font-semibold text-slate-950">
        {formatGroupTypes(scheduleEntry.groupTypes)}
      </p>
      <p>{scheduleEntry.capacity} cupos</p>
    </div>
  );
}

function ScheduleEntriesPanel({
  fieldErrors,
  scheduleBlock,
}: {
  fieldErrors?: Record<string, string>;
  scheduleBlock: ScheduleBlockListItem;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <h4 className="text-sm font-semibold text-slate-950">Cronogramas</h4>
      <ScheduleEntryForm
        intent="create-schedule-entry"
        scheduleBlockId={scheduleBlock.id}
        buttonLabel="Crear Cronograma"
        fieldErrors={fieldErrors}
      />
      {scheduleBlock.scheduleEntries.length > 0 ? (
        <ul className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {scheduleBlock.scheduleEntries.map((scheduleEntry) => (
            <li key={scheduleEntry.id} className="space-y-3 p-3">
              <ScheduleEntrySummary scheduleEntry={scheduleEntry} />
              <ScheduleEntryForm
                id={scheduleEntry.id}
                intent="update-schedule-entry"
                groupTypes={scheduleEntry.groupTypes}
                capacity={scheduleEntry.capacity}
                buttonLabel="Guardar"
              />
              <CatalogDeleteForm
                id={scheduleEntry.id}
                intent="delete-schedule-entry"
                buttonLabel="Borrar Cronograma"
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 rounded-md border border-slate-200 bg-white px-3 py-3 text-sm text-slate-600">
          Todavía no hay Cronogramas para este Bloque horario.
        </p>
      )}
    </div>
  );
}

function ScheduleEntryForm({
  buttonLabel,
  capacity,
  fieldErrors = {},
  groupTypes = [],
  id,
  intent,
  scheduleBlockId,
}: {
  buttonLabel: string;
  capacity?: number;
  fieldErrors?: Record<string, string>;
  groupTypes?: string[];
  id?: string;
  intent: string;
  scheduleBlockId?: string;
}) {
  return (
    <form
      method="post"
      className="mt-3 rounded-lg border border-slate-200 bg-white p-4"
    >
      <input type="hidden" name="intent" value={intent} />
      {id ? <input type="hidden" name="id" value={id} /> : null}
      {scheduleBlockId ? (
        <input type="hidden" name="scheduleBlockId" value={scheduleBlockId} />
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <CheckboxGroup
          title="Tipos de grupo"
          name="groupTypes"
          selectedValues={groupTypes}
          options={groupTypeOptions}
          error={fieldErrors.groupTypes}
        />
        <label className="block text-sm font-medium text-slate-800">
          Cupo
          <input
            type="number"
            min="1"
            step="1"
            name="capacity"
            defaultValue={capacity}
            className="mt-2 h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-950 outline-none transition focus:border-teal-700 focus:ring-4 focus:ring-teal-100"
          />
        </label>
        {fieldErrors.capacity ? (
          <p className="text-xs font-medium text-red-700">
            {fieldErrors.capacity}
          </p>
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

function PriceSummary({ price }: { price: PriceListItem }) {
  const scope = getPriceScope(price);

  return (
    <div className="space-y-1 text-sm text-slate-700">
      <p className="font-semibold text-slate-950">{price.name}</p>
      <p>
        {groupTypeLabels[price.groupType]} · ${price.amount}
      </p>
      <p className="text-xs font-medium text-slate-500">
        {scope.detail ?? scope.label}
      </p>
    </div>
  );
}

function PriceSummaryCard({ price }: { price: PriceListItem }) {
  const scope = getPriceScope(price);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <dl className="grid gap-4 sm:grid-cols-2">
        <PriceDetailItem label="Nombre" value={price.name} />
        <PriceDetailItem
          label="Tipo de grupo"
          value={groupTypeLabels[price.groupType] ?? price.groupType}
        />
        <PriceDetailItem label="Alcance" value={scope.label} />
        <PriceDetailItem label="Importe" value={`$${price.amount}`} />
        <PriceDetailItem
          label="Bloque horario"
          value={scope.detail ?? "Sin Bloque horario específico"}
        />
      </dl>
    </div>
  );
}

function PriceDetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="text-sm text-slate-800">{value}</dd>
    </div>
  );
}

function PriceListTable({
  prices,
  selectedEventId,
}: {
  prices: PriceListItem[];
  selectedEventId: string | null;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-600">
          <tr>
            <th scope="col" className="px-4 py-3">
              Nombre
            </th>
            <th scope="col" className="px-4 py-3">
              Tipo de grupo
            </th>
            <th scope="col" className="px-4 py-3">
              Alcance
            </th>
            <th scope="col" className="px-4 py-3">
              Importe
            </th>
            <th scope="col" className="px-4 py-3">
              Acciones
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {prices.map((price) => {
            const scope = getPriceScope(price);

            return (
              <tr key={price.id} className="bg-white">
                <td className="px-4 py-3 align-top font-medium text-slate-950">
                  {price.name}
                </td>
                <td className="px-4 py-3 align-top text-slate-700">
                  {groupTypeLabels[price.groupType] ?? price.groupType}
                </td>
                <td className="px-4 py-3 align-top text-slate-700">
                  <p>{scope.label}</p>
                  {scope.detail ? (
                    <p className="mt-1 text-xs font-medium text-slate-500">
                      {scope.detail}
                    </p>
                  ) : null}
                </td>
                <td className="px-4 py-3 align-top text-slate-700">
                  ${price.amount}
                </td>
                <td className="px-4 py-3 align-top">
                  <Link
                    to={buildPriceDetailPath(price.id, selectedEventId)}
                    className={secondaryLinkButtonClassName}
                  >
                    Ver detalle
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PriceDeleteForm({ priceId }: { priceId: string }) {
  return (
    <form
      method="post"
      className="rounded-lg border border-red-200 bg-red-50 p-4"
    >
      <input type="hidden" name="intent" value="delete-price" />
      <input type="hidden" name="id" value={priceId} />
      <p className="text-sm leading-6 text-red-900">
        Esta acción elimina el Precio si no tiene dependencias asociadas.
      </p>
      <label className="mt-3 flex items-start gap-2 text-sm text-red-900">
        <input
          type="checkbox"
          name="confirmDeletion"
          value={priceId}
          className="mt-1 size-4 rounded border-red-300 text-red-700 focus:ring-red-100"
        />
        Confirmo que quiero borrar este Precio.
      </label>
      <button
        type="submit"
        className="mt-3 inline-flex h-9 items-center justify-center rounded-md border border-red-300 bg-white px-3 text-sm font-semibold text-red-700 transition hover:bg-red-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-100"
      >
        Borrar Precio
      </button>
    </form>
  );
}

function CategoryListItem({
  category,
  selectedEventId,
  experienceLevels,
}: {
  category: CategoryRow;
  selectedEventId: string | null;
  experienceLevels: ExperienceLevelRow[];
}) {
  const experienceLevelNames = formatNamesAsArray(
    experienceLevels,
    category.experienceLevelIds,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <h3 className="text-base font-semibold text-slate-950">
            {category.name}
          </h3>
          <div className="flex flex-wrap gap-2">
            {category.groupTypes.map((groupType) => (
              <CatalogBadge key={groupType}>
                {groupTypeLabels[groupType]}
              </CatalogBadge>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {experienceLevelNames.length > 0 ? (
              experienceLevelNames.map((levelName) => (
                <CatalogBadge key={levelName} tone="info">
                  {levelName}
                </CatalogBadge>
              ))
            ) : (
              <CatalogBadge tone="neutral">
                Sin Niveles de experiencia
              </CatalogBadge>
            )}
          </div>
          <p className="text-sm text-slate-600">
            {category.minAge} a {category.maxAge} años
          </p>
        </div>
        <NavLink
          to={buildCategoryDetailPath(category.id, selectedEventId)}
          className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
        >
          Ver detalle
        </NavLink>
      </div>
    </div>
  );
}

function CategoryForm({
  buttonLabel,
  experienceLevelIds = [],
  experienceLevels,
  fieldErrors = {},
  groupTypes = [],
  id,
  intent,
  maxAge,
  minAge,
  modalities,
  modalityIds = [],
  newExperienceLevelName,
  name,
}: {
  buttonLabel: string;
  experienceLevelIds?: string[];
  experienceLevels: ExperienceLevelRow[];
  fieldErrors?: Record<string, string>;
  groupTypes?: string[];
  id?: string;
  intent: string;
  maxAge?: number;
  minAge?: number;
  modalities: ModalityRow[];
  modalityIds?: string[];
  newExperienceLevelName?: string;
  name?: string;
}) {
  return (
    <form method="post" className="space-y-4">
      <input type="hidden" name="intent" value={intent} />
      {id ? <input type="hidden" name="id" value={id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-800 sm:col-span-2">
          Nombre de la Categoría
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
          Edad mínima
          <input
            name="minAge"
            type="number"
            min="0"
            defaultValue={minAge}
            className="mt-2 h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-950 outline-none transition focus:border-teal-700 focus:ring-4 focus:ring-teal-100"
          />
          <span className="mt-2 block text-xs text-slate-500">Inclusive.</span>
        </label>
        <label className="block text-sm font-medium text-slate-800">
          Edad máxima
          <input
            name="maxAge"
            type="number"
            min="0"
            defaultValue={maxAge}
            className="mt-2 h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-950 outline-none transition focus:border-teal-700 focus:ring-4 focus:ring-teal-100"
          />
          <span className="mt-2 block text-xs text-slate-500">Inclusive.</span>
        </label>
        {fieldErrors.ageRange ? (
          <p className="text-xs font-medium text-red-700 sm:col-span-2">
            {fieldErrors.ageRange}
          </p>
        ) : null}

        <CheckboxGroup
          title="Tipos de grupo"
          name="groupTypes"
          selectedValues={groupTypes}
          options={groupTypeOptions}
          error={fieldErrors.groupTypes}
        />
        <CheckboxGroup
          title="Modalidades"
          name="modalityIds"
          selectedValues={modalityIds}
          options={modalities.map((modality) => ({
            value: modality.id,
            label: modality.name,
          }))}
          error={fieldErrors.modalityIds}
        />
        <CheckboxGroup
          title="Niveles de experiencia opcionales"
          name="experienceLevelIds"
          selectedValues={experienceLevelIds}
          options={experienceLevels.map((level) => ({
            value: level.id,
            label: level.name,
          }))}
          error={fieldErrors.experienceLevelIds}
          className="sm:col-span-2"
        />
        <label className="block text-sm font-medium text-slate-800 sm:col-span-2">
          Crear y asociar nuevo Nivel de experiencia
          <input
            name="newExperienceLevelName"
            defaultValue={newExperienceLevelName}
            className="mt-2 h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-950 outline-none transition focus:border-teal-700 focus:ring-4 focus:ring-teal-100"
          />
        </label>
        {fieldErrors.newExperienceLevelName ? (
          <p className="text-xs font-medium text-red-700 sm:col-span-2">
            {fieldErrors.newExperienceLevelName}
          </p>
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

function CategoryFormPanel({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold text-slate-950">{title}</h3>
        <p className="text-sm text-slate-600">{description}</p>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function CheckboxGroup({
  className = "",
  error,
  name,
  options,
  selectedValues,
  title,
}: {
  className?: string;
  error?: string;
  name: string;
  options: Array<{ value: string; label: string }>;
  selectedValues: string[];
  title: string;
}) {
  return (
    <fieldset className={className}>
      <legend className="text-sm font-medium text-slate-800">{title}</legend>
      <div className="mt-2 space-y-2 rounded-md border border-slate-200 p-3">
        {options.length > 0 ? (
          options.map((option) => (
            <label
              key={option.value}
              className="flex items-center gap-2 text-sm text-slate-700"
            >
              <input
                type="checkbox"
                name={name}
                value={option.value}
                defaultChecked={selectedValues.includes(option.value)}
                className="size-4 rounded border-slate-300 text-teal-700 focus:ring-teal-100"
              />
              {option.label}
            </label>
          ))
        ) : (
          <p className="text-sm text-slate-500">Sin opciones disponibles.</p>
        )}
      </div>
      {error ? (
        <p className="mt-2 text-xs font-medium text-red-700">{error}</p>
      ) : null}
    </fieldset>
  );
}

function CatalogBadge({
  children,
  tone = "primary",
}: {
  children: ReactNode;
  tone?: "info" | "neutral" | "primary";
}) {
  const classNameByTone = {
    primary: "border-teal-200 bg-teal-50 text-teal-900",
    info: "border-sky-200 bg-sky-50 text-sky-900",
    neutral: "border-slate-200 bg-slate-100 text-slate-700",
  };

  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium ${classNameByTone[tone]}`}
    >
      {children}
    </span>
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

function ScheduleBlockDeleteForm({
  fieldErrors = {},
  scheduleBlock,
}: {
  fieldErrors?: Record<string, string>;
  scheduleBlock: ScheduleBlockListItem;
}) {
  return (
    <form
      method="post"
      className="rounded-lg border border-red-200 bg-red-50 p-4"
    >
      <input type="hidden" name="intent" value="delete-schedule-block" />
      <input type="hidden" name="id" value={scheduleBlock.id} />
      <div className="space-y-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-red-950">
            Esta acción borra el Bloque horario y sus relaciones de
            programación.
          </p>
          <p className="text-sm leading-6 text-red-900">
            Solo podés borrarlo si no tiene Cronogramas ni otras dependencias.
          </p>
        </div>
        <label className="flex items-start gap-2 text-sm text-red-950">
          <input
            type="checkbox"
            name="confirmDelete"
            value="yes"
            className="mt-0.5 size-4 rounded border-red-300 text-red-700 focus:ring-red-100"
          />
          Confirmo que quiero borrar {scheduleBlock.name}.
        </label>
        {fieldErrors.confirmDelete ? (
          <p className="text-xs font-medium text-red-700">
            {fieldErrors.confirmDelete}
          </p>
        ) : null}
      </div>
      <button
        type="submit"
        className="mt-3 inline-flex h-9 items-center justify-center rounded-md border border-red-300 bg-white px-3 text-sm font-semibold text-red-700 transition hover:bg-red-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-100"
      >
        Borrar Bloque horario
      </button>
    </form>
  );
}

function CategoryDeleteForm({
  fieldErrors = {},
  id,
}: {
  fieldErrors?: Record<string, string>;
  id: string;
}) {
  return (
    <form
      method="post"
      className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-4"
    >
      <input type="hidden" name="intent" value="delete-category" />
      <input type="hidden" name="id" value={id} />
      <label className="flex items-start gap-3 text-sm text-red-900">
        <input
          type="checkbox"
          name="confirmDelete"
          value="1"
          className="mt-0.5 size-4 rounded border-red-300 text-red-700 focus:ring-red-100"
        />
        <span>Confirmo que quiero borrar esta Categoría</span>
      </label>
      {fieldErrors.confirmDelete ? (
        <p className="text-xs font-medium text-red-700">
          {fieldErrors.confirmDelete}
        </p>
      ) : null}
      <button
        type="submit"
        className="inline-flex h-9 items-center justify-center rounded-md border border-red-300 bg-white px-3 text-sm font-semibold text-red-700 transition hover:bg-red-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-100"
      >
        Borrar Categoría
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
    confirmDelete:
      String(formData.get("confirmDelete") ?? "") === "1" ||
      String(formData.get("confirmDelete") ?? "") === "on" ||
      String(formData.get("confirmDelete") ?? "") === "yes",
    confirmDeletion: String(formData.get("confirmDeletion") ?? ""),
    eventId,
    capacity: Number.parseInt(String(formData.get("capacity") ?? ""), 10),
    id: String(formData.get("id") ?? ""),
    intent: String(formData.get("intent") ?? ""),
    minAge: Number(formData.get("minAge")),
    maxAge: Number(formData.get("maxAge")),
    groupTypes: formData.getAll("groupTypes").map(String),
    groupType: String(formData.get("groupType") ?? ""),
    modalityIds: formData.getAll("modalityIds").map(String),
    modalityId: String(formData.get("modalityId") ?? ""),
    newExperienceLevelName: String(
      formData.get("newExperienceLevelName") ?? "",
    ),
    name: String(formData.get("name") ?? ""),
    scheduleBlockId: String(formData.get("scheduleBlockId") ?? ""),
    priceScheduleBlockId: String(formData.get("scheduleBlockId") ?? "") || null,
    experienceLevelIds: formData.getAll("experienceLevelIds").map(String),
    scheduledDate: String(formData.get("scheduledDate") ?? ""),
    startTime: String(formData.get("startTime") ?? ""),
    totalCapacity: Number.parseInt(
      String(formData.get("totalCapacity") ?? ""),
      10,
    ),
    amount: Number.parseInt(String(formData.get("amount") ?? ""), 10),
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

function buildActionRedirectUrl(
  requestUrl: string,
  eventId: string,
  input: CatalogActionInput,
  result: CatalogActionResult,
) {
  const currentUrl = new URL(requestUrl);

  if (input.intent === "delete-category") {
    return withSavedSearch(buildSettingsPath("categorias", null), eventId);
  }

  if (input.intent === "delete-modality") {
    return withSavedSearch(buildModalidadesListPath(null), eventId);
  }

  if (input.intent === "delete-price") {
    return withSavedSearch(buildPriceListPath(null), eventId);
  }

  if (input.intent === "delete-schedule-block") {
    return withSavedSearch(buildScheduleBlocksPath(null), eventId);
  }

  if (
    input.intent === "create-category" &&
    result.ok &&
    hasCatalogRecord(result)
  ) {
    return withSavedSearch(
      buildCategoryDetailPath(result.record.id, null),
      eventId,
    );
  }

  if (
    input.intent === "create-modality" &&
    result.ok &&
    hasCatalogRecord(result)
  ) {
    return withSavedSearch(
      buildModalidadDetallePath(result.record.id, null),
      eventId,
    );
  }

  if (
    input.intent === "create-price" &&
    result.ok &&
    hasCatalogRecord(result)
  ) {
    return withSavedSearch(
      buildPriceDetailPath(result.record.id, null),
      eventId,
    );
  }

  if (
    input.intent === "create-schedule-block" &&
    result.ok &&
    hasCatalogRecord(result)
  ) {
    return withSavedSearch(
      buildScheduleBlockDetailPath(result.record.id, null),
      eventId,
    );
  }

  return withSavedSearch(currentUrl.pathname, eventId);
}

function withSavedSearch(pathname: string, eventId: string) {
  const redirectUrl = new URL(`http://localhost${pathname}`);
  redirectUrl.searchParams.set("evento", eventId);
  redirectUrl.searchParams.set("guardado", "1");

  return `${redirectUrl.pathname}${redirectUrl.search}`;
}

function getPriceScope(price: PriceListItem): PriceScope {
  if (price.scheduleBlock) {
    return {
      label: "Precio por Bloque horario",
      detail: price.scheduleBlock.name,
    };
  }

  return {
    label: "Precio base",
    detail: null,
  };
}

function ScheduleBlockModalityBadges({
  scheduleBlock,
}: {
  scheduleBlock: ScheduleBlockListItem;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {scheduleBlock.modalities.map((modality) => (
        <CatalogBadge key={modality.id}>{modality.name}</CatalogBadge>
      ))}
    </div>
  );
}

function formatScheduleBlockOccupancy(scheduleBlock: ScheduleBlockListItem) {
  return `${scheduleBlock.occupiedCapacity}/${scheduleBlock.totalCapacity}`;
}

function hasCatalogRecord(
  result: CatalogActionResult,
): result is Extract<CatalogMutationResult, { ok: true }> {
  return "record" in result;
}

async function runCatalogIntent(
  input: CatalogActionInput,
): Promise<CatalogActionResult> {
  switch (input.intent) {
    case "create-category":
      return saveCategory(input);
    case "update-category":
      return saveCategory(input);
    case "delete-category":
      if (!input.confirmDelete) {
        return {
          ok: false as const,
          code: "invalid-catalog" as const,
          error: categoryDeleteConfirmationMessage,
          fieldErrors: {
            confirmDelete: categoryDeleteConfirmationMessage,
          },
        };
      }
      return deleteCategory(input.id);
    case "create-schedule-block":
      return createScheduleBlock(input.eventId, getScheduleBlockInput(input));
    case "update-schedule-block":
      return updateScheduleBlock(input.id, getScheduleBlockInput(input));
    case "delete-schedule-block":
      return deleteScheduleBlock(input.id);
    case "create-price":
      return createPrice(input.eventId, getPriceInput(input));
    case "update-price":
      return updatePrice(input.id, getPriceInput(input));
    case "delete-price":
      return deletePrice(input.id);
    case "create-schedule-entry":
      return createScheduleEntry(
        input.scheduleBlockId,
        getScheduleEntryInput(input),
      );
    case "update-schedule-entry":
      return updateScheduleEntry(input.id, getScheduleEntryInput(input));
    case "delete-schedule-entry":
      return deleteScheduleEntry(input.id);
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
    default:
      return {
        ok: false as const,
        code: "invalid-catalog" as const,
        error: "No se pudo interpretar la acción de ajustes.",
        fieldErrors: {},
      };
  }
}

function getCategoryMutationInput(
  input: CatalogActionInput,
): CategoryMutationInput {
  return {
    name: input.name,
    minAge: input.minAge,
    maxAge: input.maxAge,
    groupTypes: input.groupTypes,
    modalityIds: input.modalityIds,
    experienceLevelIds: input.experienceLevelIds,
  };
}

function isCategoryMutationIntent(
  intent: string,
): intent is CategoryMutationIntent {
  return intent === "create-category" || intent === "update-category";
}

function appendExperienceLevelId(
  input: CategoryMutationInput,
  experienceLevelId: string,
): CategoryMutationInput {
  return {
    ...input,
    experienceLevelIds: [...input.experienceLevelIds, experienceLevelId],
  };
}

async function runCategoryMutation(
  input: CatalogActionInput,
  categoryInput: CategoryMutationInput,
): Promise<CatalogMutationResult> {
  if (!isCategoryMutationIntent(input.intent)) {
    return {
      ok: false,
      code: "invalid-catalog",
      error: "No se pudo interpretar la acción de ajustes.",
      fieldErrors: {},
    };
  }

  if (input.intent === "create-category") {
    return createCategory(input.eventId, categoryInput);
  }

  return updateCategory(input.id, categoryInput);
}

async function saveCategory(
  input: CatalogActionInput,
): Promise<CatalogMutationResult> {
  const categoryInput = getCategoryMutationInput(input);
  const normalizedNewExperienceLevelName = input.newExperienceLevelName.trim();

  if (!normalizedNewExperienceLevelName) {
    return runCategoryMutation(input, categoryInput);
  }

  const levelResult = await createExperienceLevel(input.eventId, {
    name: normalizedNewExperienceLevelName,
  });

  if (!levelResult.ok) {
    return {
      ...levelResult,
      fieldErrors: {
        ...(levelResult.fieldErrors ?? {}),
        newExperienceLevelName:
          levelResult.fieldErrors?.name ?? levelResult.error,
      },
    };
  }

  const categoryResult = await runCategoryMutation(
    input,
    appendExperienceLevelId(categoryInput, levelResult.record.id),
  );

  if (!categoryResult.ok) {
    await deleteExperienceLevel(levelResult.record.id);
  }

  return categoryResult;
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

function getPriceInput(input: CatalogActionInput): PriceInput {
  return {
    name: input.name,
    groupType: input.groupType,
    amount: input.amount,
    scheduleBlockId: input.priceScheduleBlockId,
  };
}

function getScheduleEntryInput(input: CatalogActionInput): ScheduleEntryInput {
  return {
    groupTypes: input.groupTypes,
    capacity: input.capacity,
  };
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");

  if (!year || !month || !day) {
    return value;
  }

  return `${day}/${month}/${year}`;
}

function formatGroupTypes(groupTypes: string[]) {
  return groupTypes
    .map((groupType) => groupTypeLabels[groupType] ?? groupType)
    .join(", ");
}

function formatNames(
  records: Array<{ id: string; name: string }>,
  selectedIds: string[],
) {
  const names = formatNamesAsArray(records, selectedIds);

  return names.length > 0 ? names.join(", ") : "Sin opciones";
}

function formatNamesAsArray(
  records: Array<{ id: string; name: string }>,
  selectedIds: string[],
) {
  return selectedIds
    .map((id) => records.find((record) => record.id === id)?.name)
    .filter(Boolean);
}

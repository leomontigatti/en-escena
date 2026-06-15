import { useState } from "react";
import {
  Link,
  redirect,
  useActionData,
  useSearchParams,
  type LinkProps,
} from "react-router";
import { clsx } from "clsx";

import { AccessNotice } from "@/components/auth/access-ui";
import { DateOnlyField } from "@/components/shared/date-only-field";
import { PortalEmptyList, PortalShell } from "@/components/portal/ui";
import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import { getPortalEventContext } from "@/lib/portal/event-context.server";
import {
  getPortalRecordStatusSearch,
  readPortalRecordStatusFilter,
  type PortalRecordStatusFilter,
} from "@/lib/portal/route-state";
import {
  createDancerForAcademy,
  listDancersForAcademy,
  type CreateDancerInput,
  type DancerListItem,
} from "@/lib/portal/dancers.server";

type PortalBailarinesRouteProps = {
  loaderData: {
    email: string;
    userName: string | null;
    academy: {
      id: string;
      name: string;
      contactName: string;
      phone: string;
      userId: string;
    };
    eventContext: Awaited<ReturnType<typeof getPortalEventContext>>;
    dancers: DancerListItem[];
    statusFilter: "active" | "archived";
  };
  actionData?: ActionData;
  created?: boolean;
};

type ActionData = {
  status: "error";
  error: string;
  fieldErrors: Partial<Record<keyof CreateDancerInput, string>>;
  values: CreateDancerInput;
};

type DancerStatusFilter = PortalRecordStatusFilter;

export const meta = () => [
  { title: "Bailarines | Portal de academias | En Escena" },
];

export async function loader({ request }: { request: Request }) {
  const { user, academy } = await requireAcademyUser(request);
  const statusFilter = readPortalRecordStatusFilter(
    new URL(request.url).searchParams,
  );
  const [eventContext, dancers] = await Promise.all([
    getPortalEventContext(request),
    listDancersForAcademy(academy.id, {
      status: statusFilter,
    }),
  ]);

  return {
    email: user.email,
    userName: user.name ?? "",
    academy,
    eventContext,
    dancers,
    statusFilter,
  };
}

export async function action({ request }: { request: Request }) {
  const { academy } = await requireAcademyUser(request);
  const formData = await request.formData();
  const result = await createDancerForAcademy(academy.id, {
    firstName: readFormString(formData, "firstName"),
    lastName: readFormString(formData, "lastName"),
    birthDate: readFormString(formData, "birthDate"),
  });

  if (!result.ok) {
    return {
      status: "error",
      error: result.error,
      fieldErrors: result.fieldErrors,
      values: result.values,
    } satisfies ActionData;
  }

  throw redirect("/portal/bailarines?creado=1");
}

export function PortalBailarinesRouteView({
  actionData,
  created = false,
  loaderData,
}: PortalBailarinesRouteProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(
    actionData?.status === "error",
  );

  return (
    <PortalShell
      userEmail={loaderData.email}
      userName={loaderData.userName}
      academyName={loaderData.academy.name}
      eventContext={loaderData.eventContext}
      title="Bailarines"
    >
      <DancersSection
        actionData={actionData}
        dancers={loaderData.dancers}
        isCreateOpen={isCreateOpen}
        onCloseCreate={() => setIsCreateOpen(false)}
        onOpenCreate={() => setIsCreateOpen(true)}
        statusFilter={loaderData.statusFilter}
      />

      {created ? (
        <div className="mt-6">
          <AccessNotice variant="success">
            El Bailarín se creó correctamente.
          </AccessNotice>
        </div>
      ) : null}
    </PortalShell>
  );
}

export default function PortalBailarinesRoute({
  loaderData,
}: PortalBailarinesRouteProps) {
  const actionData = useActionData<typeof action>();
  const [searchParams] = useSearchParams();

  return (
    <PortalBailarinesRouteView
      actionData={actionData}
      created={searchParams.get("creado") === "1"}
      loaderData={loaderData}
    />
  );
}

function DancersSection({
  actionData,
  dancers,
  isCreateOpen,
  onCloseCreate,
  onOpenCreate,
  statusFilter,
}: {
  actionData?: ActionData;
  dancers: DancerListItem[];
  isCreateOpen: boolean;
  onCloseCreate: () => void;
  onOpenCreate: () => void;
  statusFilter: "active" | "archived";
}) {
  const isArchivedView = statusFilter === "archived";
  const copy = dancerStatusCopy[statusFilter];

  return (
    <section className="mt-8" aria-labelledby="bailarines-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p
            id="bailarines-title"
            className="text-sm font-semibold text-slate-950"
          >
            Bailarines
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {copy.description}
          </p>
        </div>
        {!isArchivedView ? (
          <button
            type="button"
            onClick={onOpenCreate}
            className="inline-flex h-10 items-center justify-center rounded-md bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
          >
            Cargar Bailarín
          </button>
        ) : null}
      </div>

      <div className="mt-4 flex gap-2">
        <StatusTab to="/portal/bailarines" isActive={!isArchivedView}>
          Activos
        </StatusTab>
        <StatusTab
          to="/portal/bailarines?estado=archivados"
          isActive={isArchivedView}
        >
          Archivados
        </StatusTab>
      </div>

      {dancers.length > 0 ? (
        <DancersTable dancers={dancers} statusFilter={statusFilter} />
      ) : (
        <PortalEmptyList
          title={copy.emptyTitle}
          description={copy.emptyDescription}
        />
      )}

      {isCreateOpen ? (
        <CreateDancerModal actionData={actionData} onClose={onCloseCreate} />
      ) : null}
    </section>
  );
}

function DancersTable({
  dancers,
  statusFilter,
}: {
  dancers: DancerListItem[];
  statusFilter: DancerStatusFilter;
}) {
  const detailSearch = getPortalRecordStatusSearch(statusFilter);

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-600">
          <tr>
            <th className="px-4 py-3">Bailarín</th>
            <th className="px-4 py-3">Fecha de nacimiento</th>
            <th className="px-4 py-3">Documento</th>
            <th className="px-4 py-3">Estado de verificación</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {dancers.map((dancer) => (
            <tr key={dancer.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-medium text-slate-950">
                <Link
                  to={`/portal/bailarines/${dancer.id}${detailSearch}`}
                  className="rounded-sm underline-offset-4 hover:text-teal-800 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
                >
                  {dancer.lastName}, {dancer.firstName}
                </Link>
                {!dancer.active ? (
                  <span className="ml-2 inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                    Archivado
                  </span>
                ) : null}
              </td>
              <td className="px-4 py-3 text-slate-700">
                {formatDateOnly(dancer.birthDate)}
              </td>
              <td className="px-4 py-3 text-slate-700">
                {formatDocument(dancer)}
              </td>
              <td className="px-4 py-3">
                <VerificationBadge status={dancer.verificationStatus} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusTab({
  children,
  isActive,
  to,
}: {
  children: string;
  isActive: boolean;
  to: LinkProps["to"];
}) {
  return (
    <Link
      to={to}
      className={clsx(
        "inline-flex h-9 items-center rounded-md px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100",
        isActive
          ? "bg-teal-50 text-teal-900"
          : "text-slate-700 hover:bg-slate-50 hover:text-slate-950",
      )}
    >
      {children}
    </Link>
  );
}

const dancerStatusCopy: Record<
  DancerStatusFilter,
  {
    description: string;
    emptyTitle: string;
    emptyDescription: string;
  }
> = {
  active: {
    description:
      "Esta lista muestra solo los bailarines activos de tu academia.",
    emptyTitle: "Todavía no cargaste bailarines",
    emptyDescription:
      "Cuando cargues bailarines, van a aparecer en esta lista para usarlos en coreografías.",
  },
  archived: {
    description:
      "Consultá los bailarines archivados y reactivalos desde su ficha cuando vuelvan a participar.",
    emptyTitle: "No hay bailarines archivados",
    emptyDescription:
      "Los bailarines archivados dejan de aparecer en las listas activas y se pueden reactivar desde su ficha.",
  },
};

function CreateDancerModal({
  actionData,
  onClose,
}: {
  actionData?: ActionData;
  onClose: () => void;
}) {
  const values = actionData?.values ?? {
    firstName: "",
    lastName: "",
    birthDate: "",
  };

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
      role="dialog"
    >
      <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-950">
              Cargar Bailarín
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Completá los datos mínimos para crear el registro.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm font-semibold text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
          >
            Cerrar
          </button>
        </div>

        {actionData ? (
          <div className="mt-4">
            <AccessNotice variant="error">{actionData.error}</AccessNotice>
          </div>
        ) : null}

        <form method="post" className="mt-5 space-y-4">
          <PortalField
            error={actionData?.fieldErrors.firstName}
            id="bailarin-nombre"
            label="Nombre"
            name="firstName"
            defaultValue={values.firstName}
            type="text"
          />
          <PortalField
            error={actionData?.fieldErrors.lastName}
            id="bailarin-apellido"
            label="Apellido"
            name="lastName"
            defaultValue={values.lastName}
            type="text"
          />
          <DateOnlyField
            error={actionData?.fieldErrors.birthDate}
            id="bailarin-fecha-nacimiento"
            label="Fecha de nacimiento"
            name="birthDate"
            defaultValue={values.birthDate}
            labelClassName="text-slate-800"
            buttonClassName="mt-0 h-10 w-full border-slate-300 bg-white text-slate-950 hover:bg-slate-50 focus:border-teal-700 focus:ring-4 focus:ring-teal-100 aria-[invalid=true]:border-red-500 aria-[invalid=true]:focus:border-red-600 aria-[invalid=true]:focus:ring-red-100"
            errorClassName="mt-0 font-medium"
          />
          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="inline-flex h-10 items-center justify-center rounded-md bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
            >
              Crear Bailarín
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PortalField({
  defaultValue,
  error,
  id,
  label,
  name,
  type,
}: {
  defaultValue: string;
  error?: string;
  id: string;
  label: string;
  name: keyof CreateDancerInput;
  type: "text";
}) {
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-800">
        {label}
      </label>
      <input
        aria-describedby={errorId}
        aria-invalid={error ? true : undefined}
        className="mt-2 h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-950 outline-none transition focus:border-teal-700 focus:ring-4 focus:ring-teal-100 aria-[invalid=true]:border-red-500 aria-[invalid=true]:focus:border-red-600 aria-[invalid=true]:focus:ring-red-100"
        defaultValue={defaultValue}
        id={id}
        name={name}
        type={type}
      />
      {error ? (
        <p id={errorId} className="mt-2 text-xs font-medium text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function VerificationBadge({
  status,
}: {
  status: DancerListItem["verificationStatus"];
}) {
  if (status === "missingImages") {
    return (
      <span className="inline-flex rounded-md bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800">
        Faltan imágenes
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-md bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
      Incompleto
    </span>
  );
}

function formatDateOnly(value: string) {
  const [year, month, day] = value.split("-");

  return `${day}/${month}/${year}`;
}

function formatDocument(dancer: DancerListItem) {
  if (!dancer.documentType || !dancer.documentNumber) {
    return "Sin documento";
  }

  return `${formatDocumentType(dancer.documentType)} ${dancer.documentNumber}`;
}

function formatDocumentType(
  value: NonNullable<DancerListItem["documentType"]>,
) {
  if (value === "dni") {
    return "DNI";
  }

  if (value === "passport") {
    return "Pasaporte";
  }

  return "Otro";
}

function readFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

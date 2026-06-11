import { Plus } from "lucide-react";
import { useState } from "react";
import { Link, redirect, useActionData, type LinkProps } from "react-router";
import { clsx } from "clsx";

import {
  AccessField,
  AccessNotice,
  AccessSecondaryLink,
  accessButtonClassName,
} from "@/components/access-ui";
import { PortalEmptyList, PortalShell } from "@/components/portal-ui";
import { requireAcademyUser } from "@/lib/internal-access.server";
import {
  createAcademyProfessor,
  listAcademyProfessors,
  type CreateProfessorInput,
} from "@/lib/portal-professors.server";

type PortalProfesoresRouteProps = {
  loaderData: Awaited<ReturnType<typeof loader>>;
  actionData?: Awaited<ReturnType<typeof action>>;
};

type ProfessorStatusFilter = "active" | "archived";

export const meta = () => [
  { title: "Profesores | Portal de academias | En Escena" },
];

export async function loader({ request }: { request: Request }) {
  const { user, academy } = await requireAcademyUser(request);
  const url = new URL(request.url);
  const statusFilter: ProfessorStatusFilter =
    url.searchParams.get("estado") === "archivados" ? "archived" : "active";
  const professorRows = await listAcademyProfessors(academy.id, {
    status: statusFilter,
  });

  return {
    email: user.email,
    academy,
    professors: professorRows,
    statusFilter,
    successMessage:
      url.searchParams.get("creado") === "1"
        ? "Profesor creado correctamente."
        : null,
  };
}

export async function action({ request }: { request: Request }) {
  const { academy } = await requireAcademyUser(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent !== "create-professor") {
    throw new Response("Acción no soportada.", { status: 400 });
  }

  const result = await createAcademyProfessor(academy.id, {
    firstName: formValue(formData, "firstName"),
    lastName: formValue(formData, "lastName"),
  });

  if (!result.ok) {
    return {
      status: "error" as const,
      message: result.message,
      fieldErrors: result.fieldErrors,
      values: result.values,
      modalOpen: true,
    };
  }

  throw redirect("/portal/profesores?creado=1");
}

export function PortalProfesoresRouteView({
  loaderData,
  actionData: actionDataOverride,
}: PortalProfesoresRouteProps) {
  const actionData = actionDataOverride;
  const actionValues = actionData?.values;
  const actionFieldErrors = actionData?.fieldErrors;
  const isModalOpen = actionData?.modalOpen === true;
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const statusFilterCopy = professorStatusCopy[loaderData.statusFilter];

  return (
    <PortalShell
      email={loaderData.email}
      academyName={loaderData.academy.name}
      description={
        <>
          Gestioná los profesores de la academia antes de vincularlos a
          coreografías.
        </>
      }
    >
      <section className="mt-8" aria-labelledby="profesores-title">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p
              id="profesores-title"
              className="text-sm font-semibold text-slate-950"
            >
              Profesores
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {statusFilterCopy.description}
            </p>
          </div>
          {loaderData.statusFilter === "active" ? (
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
            >
              <Plus aria-hidden="true" className="size-4" />
              Cargar profesor
            </button>
          ) : null}
        </div>

        <div className="mt-4 flex gap-2">
          <StatusTab
            to="/portal/profesores"
            isActive={loaderData.statusFilter === "active"}
          >
            Activos
          </StatusTab>
          <StatusTab
            to="/portal/profesores?estado=archivados"
            isActive={loaderData.statusFilter === "archived"}
          >
            Archivados
          </StatusTab>
        </div>

        {loaderData.successMessage ? (
          <div className="mt-4">
            <AccessNotice variant="success">
              {loaderData.successMessage}
            </AccessNotice>
          </div>
        ) : null}

        {loaderData.professors.length > 0 ? (
          <ProfessorTable
            professors={loaderData.professors}
            statusFilter={loaderData.statusFilter}
          />
        ) : (
          <PortalEmptyList
            title={statusFilterCopy.emptyTitle}
            description={statusFilterCopy.emptyDescription}
          />
        )}
      </section>

      <CreateProfessorModal
        isOpen={isModalOpen || isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        values={actionValues}
        fieldErrors={actionFieldErrors}
        message={actionData?.message}
      />

      <AccessSecondaryLink to="/portal" className="mt-8">
        Volver al inicio
      </AccessSecondaryLink>
    </PortalShell>
  );
}

export default function PortalProfesoresRoute({
  loaderData,
}: PortalProfesoresRouteProps) {
  const actionData = useActionData<typeof action>();

  return (
    <PortalProfesoresRouteView
      loaderData={loaderData}
      actionData={actionData}
    />
  );
}

type ProfessorListItem = Awaited<
  ReturnType<typeof loader>
>["professors"][number];

function ProfessorTable({
  professors,
  statusFilter,
}: {
  professors: ProfessorListItem[];
  statusFilter: "active" | "archived";
}) {
  const detailSearch = statusFilter === "archived" ? "?estado=archivados" : "";

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
      <table className="min-w-full divide-y divide-slate-200 text-sm">
        <thead className="bg-slate-50">
          <tr>
            <th
              scope="col"
              className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600"
            >
              Profesor
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600"
            >
              Documento
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600"
            >
              Estado
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {professors.map((professor) => (
            <tr key={professor.id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-medium text-slate-950">
                <Link
                  to={`/portal/profesores/${professor.id}${detailSearch}`}
                  className="rounded-sm underline-offset-4 hover:text-teal-800 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
                >
                  {professor.lastName}, {professor.firstName}
                </Link>
                {!professor.active ? (
                  <span className="ml-2 inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                    Archivado
                  </span>
                ) : null}
              </td>
              <td className="px-4 py-3 text-slate-700">
                {formatProfessorDocument(professor)}
              </td>
              <td className="px-4 py-3">
                {professor.isIncomplete ? (
                  <span className="inline-flex rounded-md bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                    Incompleto
                  </span>
                ) : null}
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

const professorStatusCopy: Record<
  ProfessorStatusFilter,
  {
    description: string;
    emptyTitle: string;
    emptyDescription: string;
  }
> = {
  active: {
    description:
      "Esta lista muestra solo los profesores activos de tu academia.",
    emptyTitle: "Todavía no cargaste profesores",
    emptyDescription:
      "Cuando cargues profesores, van a aparecer en esta lista para vincularlos a coreografías.",
  },
  archived: {
    description:
      "Consultá los profesores archivados y reactivalos desde su ficha cuando vuelvan a participar.",
    emptyTitle: "No hay profesores archivados",
    emptyDescription:
      "Los profesores archivados dejan de aparecer en las listas activas y se pueden reactivar desde su ficha.",
  },
};

function CreateProfessorModal({
  isOpen,
  onClose,
  values,
  fieldErrors,
  message,
}: {
  isOpen: boolean;
  onClose: () => void;
  values?: CreateProfessorInput;
  fieldErrors?: Partial<Record<keyof CreateProfessorInput, string>>;
  message?: string;
}) {
  return (
    <dialog
      id="crear-profesor"
      open={isOpen}
      className="m-auto w-[min(92vw,32rem)] rounded-lg border border-slate-200 bg-white p-6 shadow-xl backdrop:bg-slate-950/30 open:block"
    >
      <div>
        <p className="text-base font-semibold text-slate-950">
          Cargar profesor
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Usá nombre y apellido. La identificación se puede completar después.
        </p>
      </div>

      <form method="post" className="mt-6 space-y-5">
        <input type="hidden" name="intent" value="create-professor" />
        <AccessField
          id="firstName"
          label="Nombre"
          error={fieldErrors?.firstName}
          inputProps={{
            name: "firstName",
            type: "text",
            required: true,
            defaultValue: values?.firstName,
            autoComplete: "given-name",
          }}
        />
        <AccessField
          id="lastName"
          label="Apellido"
          error={fieldErrors?.lastName}
          inputProps={{
            name: "lastName",
            type: "text",
            required: true,
            defaultValue: values?.lastName,
            autoComplete: "family-name",
          }}
        />

        {message ? (
          <AccessNotice variant="error">{message}</AccessNotice>
        ) : null}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
          >
            Cancelar
          </button>
          <button type="submit" className={accessButtonClassName}>
            Guardar profesor
          </button>
        </div>
      </form>
    </dialog>
  );
}

function formatProfessorDocument(professor: ProfessorListItem) {
  if (!professor.documentType || !professor.documentNumber) {
    return "Sin documento";
  }

  return `${formatDocumentType(professor.documentType)} ${professor.documentNumber}`;
}

function formatDocumentType(
  documentType: NonNullable<ProfessorListItem["documentType"]>,
) {
  if (documentType === "dni") {
    return "DNI";
  }

  if (documentType === "passport") {
    return "Pasaporte";
  }

  return "Otro";
}

function formValue(formData: FormData, fieldName: keyof CreateProfessorInput) {
  const value = formData.get(fieldName);

  return typeof value === "string" ? value : "";
}

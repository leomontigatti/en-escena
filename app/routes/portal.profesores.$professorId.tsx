import { redirect, useActionData, useSearchParams } from "react-router";
import { clsx } from "clsx";

import {
  AccessField,
  AccessNotice,
  AccessSecondaryLink,
  accessButtonClassName,
} from "@/components/auth/access-ui";
import { PortalShell } from "@/components/portal/ui";
import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import {
  getPortalRecordStatusSearch,
  resolvePortalRecordStatusFilter,
} from "@/lib/portal/route-state";
import {
  archiveAcademyProfessor,
  findAcademyProfessor,
  reactivateAcademyProfessor,
  updateAcademyProfessor,
  type UpdateProfessorInput,
} from "@/lib/portal/professors.server";

const professorNotFoundMessage = "No encontramos ese Profesor.";
const professorUpdatedSearchParam = "actualizado";
const professorUpdatedSuccessMessage = "Profesor actualizado correctamente.";

type LoaderData = Awaited<ReturnType<typeof loader>>;

type PortalProfesorRouteProps = {
  loaderData: LoaderData;
  actionData?: Awaited<ReturnType<typeof action>>;
};

export const meta = () => [
  { title: "Editar Profesor | Portal de academias | En Escena" },
];

export async function loader({
  request,
  params,
}: {
  request: Request;
  params: { professorId?: string };
}) {
  const { user, academy } = await requireAcademyUser(request);
  const professorId = readProfessorId(params);
  const professor = await requireProfessor(academy.id, professorId);

  return {
    email: user.email,
    academy,
    professor,
    statusFilter: resolveProfessorStatusFilter(request, professor.active),
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
  params: { professorId?: string };
}) {
  const { academy } = await requireAcademyUser(request);
  const professorId = readProfessorId(params);

  const formData = await request.formData();
  const intent = readFormString(formData, "intent");

  if (intent === "archive-professor") {
    await archiveAcademyProfessor(academy.id, professorId);
    throw redirect(
      `/portal/profesores/${professorId}?${professorUpdatedSearchParam}=1`,
    );
  }

  if (intent === "reactivate-professor") {
    await reactivateAcademyProfessor(academy.id, professorId);
    throw redirect(
      `/portal/profesores/${professorId}?${professorUpdatedSearchParam}=1`,
    );
  }

  const result = await updateAcademyProfessor(academy.id, professorId, {
    firstName: readFormString(formData, "firstName"),
    lastName: readFormString(formData, "lastName"),
    documentType: readFormString(formData, "documentType"),
    documentNumber: readFormString(formData, "documentNumber"),
  });

  if (!result.ok) {
    return {
      status: "error" as const,
      message: result.message,
      fieldErrors: result.fieldErrors,
      values: result.values,
    };
  }

  throw redirect(
    `/portal/profesores/${professorId}?${professorUpdatedSearchParam}=1`,
  );
}

export function PortalProfesorRouteView({
  loaderData,
  actionData: actionDataOverride,
}: PortalProfesorRouteProps) {
  const actionData = actionDataOverride;
  const backToList = `/portal/profesores${getPortalRecordStatusSearch(loaderData.statusFilter)}`;
  const statusAction = loaderData.professor.active
    ? {
        description:
          "Archivá este Profesor para sacarlo de las listas activas y de los próximos selects de coreografías.",
        intent: "archive-professor" as const,
        buttonLabel: "Archivar Profesor",
        buttonClassName:
          "border border-slate-300 bg-white text-slate-800 hover:bg-slate-100",
      }
    : {
        description:
          "Reactivá este Profesor para que vuelva a aparecer en las listas activas y en los próximos selects de coreografías.",
        intent: "reactivate-professor" as const,
        buttonLabel: "Reactivar Profesor",
        buttonClassName: "bg-teal-700 text-white hover:bg-teal-800",
      };
  const values = actionData?.values ?? {
    firstName: loaderData.professor.firstName,
    lastName: loaderData.professor.lastName,
    documentType: loaderData.professor.documentType ?? "",
    documentNumber: loaderData.professor.documentNumber ?? "",
  };

  return (
    <PortalShell
      email={loaderData.email}
      academyName={loaderData.academy.name}
      description={
        <>Revisá y completá la identificación del Profesor desde esta ficha.</>
      }
    >
      <section className="mt-8 max-w-2xl" aria-labelledby="profesor-editar">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <p
              id="profesor-editar"
              className="text-sm font-semibold text-slate-950"
            >
              Editar Profesor
            </p>
            {!loaderData.professor.active ? (
              <span className="inline-flex rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                Archivado
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Completá nombre, apellido y documento para mantener el registro al
            día.
          </p>
        </div>

        {loaderData.successMessage ? (
          <div className="mt-4">
            <AccessNotice variant="success">
              {loaderData.successMessage}
            </AccessNotice>
          </div>
        ) : null}

        {loaderData.professor.isIncomplete ? (
          <div className="mt-4">
            <AccessNotice variant="info">
              Faltan datos para poder validar la identificación.
            </AccessNotice>
          </div>
        ) : null}

        {actionData?.message ? (
          <div className="mt-4">
            <AccessNotice variant="error">{actionData.message}</AccessNotice>
          </div>
        ) : null}

        <form method="post" className="mt-6 space-y-5">
          <input type="hidden" name="intent" value="update-professor" />
          <AccessField
            id="profesor-first-name"
            label="Nombre"
            error={actionData?.fieldErrors.firstName}
            inputProps={{
              name: "firstName",
              type: "text",
              required: true,
              defaultValue: values.firstName,
              autoComplete: "given-name",
            }}
          />
          <AccessField
            id="profesor-last-name"
            label="Apellido"
            error={actionData?.fieldErrors.lastName}
            inputProps={{
              name: "lastName",
              type: "text",
              required: true,
              defaultValue: values.lastName,
              autoComplete: "family-name",
            }}
          />
          <DocumentTypeField
            defaultValue={values.documentType}
            error={actionData?.fieldErrors.documentType}
          />
          <AccessField
            id="profesor-document-number"
            label="Número de documento"
            error={actionData?.fieldErrors.documentNumber}
            inputProps={{
              name: "documentNumber",
              type: "text",
              defaultValue: values.documentNumber,
              autoComplete: "off",
            }}
          />

          <button type="submit" className={accessButtonClassName}>
            Guardar cambios
          </button>
        </form>

        <form
          method="post"
          className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-6"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-950">Estado</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {statusAction.description}
              </p>
            </div>
            <button
              type="submit"
              name="intent"
              value={statusAction.intent}
              className={clsx(
                "inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100",
                statusAction.buttonClassName,
              )}
            >
              {statusAction.buttonLabel}
            </button>
          </div>
        </form>
      </section>

      <AccessSecondaryLink to={backToList} className="mt-8">
        Volver a Profesores
      </AccessSecondaryLink>
    </PortalShell>
  );
}

export default function PortalProfesorRoute({
  loaderData,
}: PortalProfesorRouteProps) {
  const actionData = useActionData<typeof action>();
  const [searchParams] = useSearchParams();

  return (
    <PortalProfesorRouteView
      loaderData={{
        ...loaderData,
        successMessage:
          readUpdatedSuccessMessage(searchParams) ?? loaderData.successMessage,
      }}
      actionData={actionData}
    />
  );
}

function DocumentTypeField({
  defaultValue,
  error,
}: {
  defaultValue: string;
  error?: string;
}) {
  const errorId = error ? "profesor-document-type-error" : undefined;

  return (
    <div>
      <label
        htmlFor="profesor-document-type"
        className="block text-sm font-medium text-slate-800"
      >
        Tipo de documento
      </label>
      <select
        id="profesor-document-type"
        name="documentType"
        defaultValue={defaultValue}
        aria-describedby={errorId}
        aria-invalid={error ? true : undefined}
        className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-950 shadow-sm transition-[border-color,box-shadow] focus-visible:border-teal-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100 aria-[invalid=true]:border-red-500 aria-[invalid=true]:focus-visible:border-red-600 aria-[invalid=true]:focus-visible:ring-red-100"
      >
        <option value="">Sin documento</option>
        <option value="dni">DNI</option>
        <option value="passport">Pasaporte</option>
        <option value="other">Otro</option>
      </select>
      {error ? (
        <p id={errorId} className="mt-2 text-sm leading-5 text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

async function requireProfessor(academyId: string, professorId: string) {
  const professor = await findAcademyProfessor(academyId, professorId);

  if (!professor) {
    throw new Response(professorNotFoundMessage, { status: 404 });
  }

  return professor;
}

function readProfessorId(params: { professorId?: string }) {
  if (!params.professorId) {
    throw new Response(professorNotFoundMessage, { status: 404 });
  }

  return params.professorId;
}

function readUpdatedSuccessMessage(searchParams: URLSearchParams) {
  return searchParams.get(professorUpdatedSearchParam) === "1"
    ? professorUpdatedSuccessMessage
    : null;
}

function resolveProfessorStatusFilter(request: Request, isActive: boolean) {
  return resolvePortalRecordStatusFilter(request, isActive);
}

function readFormString(formData: FormData, fieldName: string) {
  const value = formData.get(fieldName);

  return typeof value === "string" ? value : "";
}

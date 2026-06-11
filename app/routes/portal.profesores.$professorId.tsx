import { redirect, useActionData, useSearchParams } from "react-router";

import {
  AccessField,
  AccessNotice,
  AccessSecondaryLink,
  accessButtonClassName,
} from "@/components/access-ui";
import { PortalShell } from "@/components/portal-ui";
import { requireAcademyUser } from "@/lib/internal-access.server";
import {
  findAcademyProfessor,
  updateAcademyProfessor,
  type UpdateProfessorInput,
} from "@/lib/portal-professors.server";

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
  const professorId = params.professorId;

  if (!professorId) {
    throw new Response("No encontramos ese Profesor.", { status: 404 });
  }

  const professor = await findAcademyProfessor(academy.id, professorId);

  if (!professor) {
    throw new Response("No encontramos ese Profesor.", { status: 404 });
  }

  const url = new URL(request.url);

  return {
    email: user.email,
    academy,
    professor,
    successMessage:
      url.searchParams.get("actualizado") === "1"
        ? "Profesor actualizado correctamente."
        : null,
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
  const professorId = params.professorId;

  if (!professorId) {
    throw new Response("No encontramos ese Profesor.", { status: 404 });
  }

  const professor = await findAcademyProfessor(academy.id, professorId);

  if (!professor) {
    throw new Response("No encontramos ese Profesor.", { status: 404 });
  }

  const formData = await request.formData();
  const result = await updateAcademyProfessor(academy.id, professorId, {
    firstName: formValue(formData, "firstName"),
    lastName: formValue(formData, "lastName"),
    documentType: formValue(formData, "documentType"),
    documentNumber: formValue(formData, "documentNumber"),
  });

  if (!result.ok) {
    return {
      status: "error" as const,
      message: result.message,
      fieldErrors: result.fieldErrors,
      values: result.values,
    };
  }

  throw redirect(`/portal/profesores/${professorId}?actualizado=1`);
}

export function PortalProfesorRouteView({
  loaderData,
  actionData: actionDataOverride,
}: PortalProfesorRouteProps) {
  const actionData = actionDataOverride;
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
          <p
            id="profesor-editar"
            className="text-sm font-semibold text-slate-950"
          >
            Editar Profesor
          </p>
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
      </section>

      <AccessSecondaryLink to="/portal/profesores" className="mt-8">
        Volver a profesores
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
          searchParams.get("actualizado") === "1"
            ? "Profesor actualizado correctamente."
            : loaderData.successMessage,
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

function formValue(formData: FormData, fieldName: keyof UpdateProfessorInput) {
  const value = formData.get(fieldName);

  return typeof value === "string" ? value : "";
}

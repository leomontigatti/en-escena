import { ArrowLeft } from "lucide-react";
import { Link, redirect, useActionData } from "react-router";

import { AccessNotice } from "@/components/access-ui";
import { PortalShell } from "@/components/portal-ui";
import { requireAcademyUser } from "@/lib/internal-access.server";
import {
  findDancerForAcademy,
  updateDancerForAcademy,
  type UpdateDancerInput,
} from "@/lib/portal-dancers.server";

type ActionData = Extract<
  Awaited<ReturnType<typeof updateDancerForAcademy>>,
  { ok: false }
>;

type PortalBailarinDetalleRouteProps = {
  loaderData: Awaited<ReturnType<typeof loader>>;
  actionData?: ActionData;
};

const dancerNotFoundMessage = "No encontramos ese Bailarín.";

const documentTypeOptions = [
  { value: "", label: "Seleccionar" },
  { value: "dni", label: "DNI" },
  { value: "passport", label: "Pasaporte" },
  { value: "other", label: "Otro" },
] as const;

export const meta = () => [
  { title: "Editar Bailarín | Portal de academias | En Escena" },
];

export async function loader({
  request,
  params,
}: {
  request: Request;
  params: { dancerId?: string };
}) {
  const { academy, user } = await requireAcademyUser(request);
  const dancerId = params.dancerId;

  if (!dancerId) {
    throw new Response(dancerNotFoundMessage, { status: 404 });
  }

  const dancer = await findDancerForAcademy(academy.id, dancerId);

  if (!dancer) {
    throw new Response(dancerNotFoundMessage, { status: 404 });
  }

  return {
    email: user.email,
    academy,
    dancer,
    saved: new URL(request.url).searchParams.get("guardado") === "1",
  };
}

export async function action({
  request,
  params,
}: {
  request: Request;
  params: { dancerId?: string };
}) {
  const { academy } = await requireAcademyUser(request);
  const dancerId = params.dancerId;

  if (!dancerId) {
    throw new Response(dancerNotFoundMessage, { status: 404 });
  }

  const formData = await request.formData();
  const result = await updateDancerForAcademy(academy.id, dancerId, {
    firstName: readFormString(formData, "firstName"),
    lastName: readFormString(formData, "lastName"),
    birthDate: readFormString(formData, "birthDate"),
    documentType: readFormString(formData, "documentType"),
    documentNumber: readFormString(formData, "documentNumber"),
  });

  if (!result.ok) {
    return result;
  }

  throw redirect(`/portal/bailarines/${dancerId}?guardado=1`);
}

export function PortalBailarinDetalleRouteView({
  loaderData,
  actionData,
}: PortalBailarinDetalleRouteProps) {
  const values = actionData?.values ?? buildDancerFormValues(loaderData.dancer);
  const isIdentificationIncomplete =
    loaderData.dancer.documentType === null ||
    loaderData.dancer.documentNumber === null;

  return (
    <PortalShell
      email={loaderData.email}
      academyName={loaderData.academy.name}
      description={<>Completá o corregí la identificación del Bailarín.</>}
    >
      <section
        className="mt-8 space-y-6"
        aria-labelledby="bailarin-detalle-title"
      >
        <Link
          to="/portal/bailarines"
          className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Volver a Bailarines
        </Link>

        <div>
          <h2
            id="bailarin-detalle-title"
            className="text-xl font-semibold text-slate-950"
          >
            {loaderData.dancer.lastName}, {loaderData.dancer.firstName}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Actualizá los datos de identidad y documento del Bailarín.
          </p>
        </div>

        {loaderData.saved ? (
          <AccessNotice variant="success">
            El Bailarín se guardó correctamente.
          </AccessNotice>
        ) : null}

        {isIdentificationIncomplete ? (
          <AccessNotice variant="info">
            Faltan datos para poder validar la identificación.
          </AccessNotice>
        ) : null}

        {actionData ? (
          <AccessNotice variant="error">{actionData.error}</AccessNotice>
        ) : null}

        <form
          method="post"
          className="space-y-4 rounded-lg border border-slate-200 bg-white p-6"
        >
          <FormField
            id="bailarin-nombre"
            label="Nombre"
            name="firstName"
            type="text"
            defaultValue={values.firstName}
            error={actionData?.fieldErrors.firstName}
          />
          <FormField
            id="bailarin-apellido"
            label="Apellido"
            name="lastName"
            type="text"
            defaultValue={values.lastName}
            error={actionData?.fieldErrors.lastName}
          />
          <FormField
            id="bailarin-fecha-nacimiento"
            label="Fecha de nacimiento"
            name="birthDate"
            type="date"
            defaultValue={values.birthDate}
            error={actionData?.fieldErrors.birthDate}
          />
          <SelectField
            id="bailarin-tipo-documento"
            label="Tipo de documento"
            name="documentType"
            defaultValue={values.documentType}
            error={actionData?.fieldErrors.documentType}
            options={documentTypeOptions}
          />
          <FormField
            id="bailarin-numero-documento"
            label="Número de documento"
            name="documentNumber"
            type="text"
            defaultValue={values.documentNumber}
            error={actionData?.fieldErrors.documentNumber}
          />
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="inline-flex h-10 items-center justify-center rounded-md bg-teal-700 px-4 text-sm font-semibold text-white transition hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-100"
            >
              Guardar cambios
            </button>
          </div>
        </form>
      </section>
    </PortalShell>
  );
}

export default function PortalBailarinDetalleRoute(
  props: PortalBailarinDetalleRouteProps,
) {
  const actionData = useActionData<typeof action>();

  return (
    <PortalBailarinDetalleRouteView
      loaderData={props.loaderData}
      actionData={actionData}
    />
  );
}

function FormField({
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
  name: keyof UpdateDancerInput;
  type: "date" | "text";
}) {
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-800">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        defaultValue={defaultValue}
        aria-describedby={errorId}
        aria-invalid={error ? true : undefined}
        className="mt-2 h-10 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-950 outline-none transition focus:border-teal-700 focus:ring-4 focus:ring-teal-100 aria-[invalid=true]:border-red-500 aria-[invalid=true]:focus:border-red-600 aria-[invalid=true]:focus:ring-red-100"
      />
      {error ? (
        <p id={errorId} className="mt-2 text-xs font-medium text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function SelectField({
  defaultValue,
  error,
  id,
  label,
  name,
  options,
}: {
  defaultValue: string;
  error?: string;
  id: string;
  label: string;
  name: keyof UpdateDancerInput;
  options: ReadonlyArray<{ value: string; label: string }>;
}) {
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-800">
        {label}
      </label>
      <select
        id={id}
        name={name}
        defaultValue={defaultValue}
        aria-describedby={errorId}
        aria-invalid={error ? true : undefined}
        className="mt-2 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-teal-700 focus:ring-4 focus:ring-teal-100 aria-[invalid=true]:border-red-500 aria-[invalid=true]:focus:border-red-600 aria-[invalid=true]:focus:ring-red-100"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error ? (
        <p id={errorId} className="mt-2 text-xs font-medium text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function readFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

function buildDancerFormValues(
  dancer: Awaited<ReturnType<typeof loader>>["dancer"],
): UpdateDancerInput {
  return {
    firstName: dancer.firstName,
    lastName: dancer.lastName,
    birthDate: dancer.birthDate,
    documentType: dancer.documentType ?? "",
    documentNumber: dancer.documentNumber ?? "",
  };
}

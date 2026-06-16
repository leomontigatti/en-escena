import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useId } from "react";
import { Controller, useForm, type UseFormReturn } from "react-hook-form";
import { redirect, useActionData } from "react-router";
import { z } from "zod";

import { db } from "@/db";
import { academies } from "@/db/schema";
import { PortalShell } from "@/components/portal/ui";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { requireAcademyUser } from "@/lib/auth/internal-access.server";
import { getPortalEventContext } from "@/lib/portal/event-context.server";
import {
  createValidatedNativeSubmitHandler,
  requiredFieldMessage,
} from "@/lib/shared/forms";
import { eq } from "drizzle-orm";

type LoaderData = Awaited<ReturnType<typeof loader>>;
type ActionData = Awaited<ReturnType<typeof action>>;
type AcademyProfileValues = z.infer<typeof academyProfileSchema>;
type AcademyProfileFieldErrors = Partial<
  Record<keyof AcademyProfileValues, string>
>;
type AcademyProfileFormReturn = UseFormReturn<
  AcademyProfileValues,
  unknown,
  AcademyProfileValues
>;

type PortalPerfilRouteProps = {
  loaderData: LoaderData;
  actionData?: ActionData;
};

const academyProfileSchema = z.object({
  name: z.string().trim().min(1, requiredFieldMessage),
  contactName: z.string().trim().min(1, requiredFieldMessage),
  phone: z.string().trim().min(1, requiredFieldMessage),
});

const academyProfileFormId = "portal-perfil-form";
const updateAcademyProfileIntent = "update-academy-profile";
const emptyAcademyProfileFieldErrors: AcademyProfileFieldErrors = {};

export const meta = () => [
  { title: "Perfil | Portal de academias | En Escena" },
];

export async function loader({ request }: { request: Request }) {
  const { user, academy } = await requireAcademyUser(request);
  const eventContext = await getPortalEventContext(request);

  return {
    email: user.email,
    userName: user.name ?? "",
    academy,
    eventContext,
  };
}

export async function action({ request }: { request: Request }) {
  const { academy } = await requireAcademyUser(request);
  const formData = await request.formData();

  if (formData.get("intent") !== updateAcademyProfileIntent) {
    throw new Response("Acción no soportada.", { status: 400 });
  }

  const values = readAcademyProfileValues(formData);
  const parsed = academyProfileSchema.safeParse(values);

  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;

    return {
      status: "error" as const,
      fieldErrors: {
        name: fieldErrors.name?.[0],
        contactName: fieldErrors.contactName?.[0],
        phone: fieldErrors.phone?.[0],
      },
      values,
    };
  }

  await db
    .update(academies)
    .set({
      name: parsed.data.name,
      contactName: parsed.data.contactName,
      phone: parsed.data.phone,
      updatedAt: new Date(),
    })
    .where(eq(academies.id, academy.id));

  throw redirect("/portal/perfil?notificacion=perfil-guardado");
}

export function PortalPerfilRouteView({
  loaderData,
  actionData,
}: PortalPerfilRouteProps) {
  const actionError = actionData?.status === "error" ? actionData : undefined;
  const values = actionError?.values ?? {
    name: loaderData.academy.name,
    contactName: loaderData.academy.contactName,
    phone: loaderData.academy.phone,
  };
  const form = useAcademyProfileForm({
    fieldErrors: actionError?.fieldErrors,
    values,
  });

  return (
    <PortalShell
      userEmail={loaderData.email}
      userName={loaderData.userName}
      academyName={loaderData.academy.name}
      eventContext={loaderData.eventContext}
      title="Perfil"
    >
      <section className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Perfil
        </h1>
        <p className="text-sm text-muted-foreground">
          Actualizá los datos públicos de tu academia.
        </p>
      </section>

      <section className="rounded-lg border bg-card p-6 text-card-foreground">
        <h2 className="text-base font-semibold">Datos de la academia</h2>
        <form
          id={academyProfileFormId}
          method="post"
          noValidate
          onSubmit={form.handleSubmit}
          className="mt-5"
        >
          <input
            type="hidden"
            name="intent"
            value={updateAcademyProfileIntent}
          />
          <FieldGroup>
            <AcademyProfileField
              form={form.form}
              label="Nombre de la academia"
              name="name"
            />
            <AcademyProfileField
              form={form.form}
              label="Nombre de contacto"
              name="contactName"
            />
            <AcademyProfileField
              form={form.form}
              label="Teléfono"
              name="phone"
            />
            <ReadOnlyEmailField email={loaderData.email} />
          </FieldGroup>
        </form>
      </section>

      <div className="flex justify-end">
        <Button type="submit" form={academyProfileFormId}>
          Guardar cambios
        </Button>
      </div>
    </PortalShell>
  );
}

export default function PortalPerfilRoute({
  loaderData,
}: PortalPerfilRouteProps) {
  const actionData = useActionData<typeof action>();

  return (
    <PortalPerfilRouteView loaderData={loaderData} actionData={actionData} />
  );
}

function useAcademyProfileForm({
  fieldErrors = emptyAcademyProfileFieldErrors,
  values,
}: {
  fieldErrors?: AcademyProfileFieldErrors;
  values: AcademyProfileValues;
}) {
  const form = useForm<AcademyProfileValues, unknown, AcademyProfileValues>({
    defaultValues: values,
    mode: "onSubmit",
    resolver: zodResolver(academyProfileSchema),
  });

  useEffect(() => {
    form.reset(values);
  }, [form, values.contactName, values.name, values.phone]);

  useEffect(() => {
    for (const [fieldName, message] of Object.entries(fieldErrors)) {
      if (message) {
        form.setError(fieldName as keyof AcademyProfileValues, { message });
      }
    }
  }, [fieldErrors, form]);

  return {
    form,
    handleSubmit: createValidatedNativeSubmitHandler(form),
  };
}

function AcademyProfileField({
  form,
  label,
  name,
}: {
  form: AcademyProfileFormReturn;
  label: string;
  name: keyof AcademyProfileValues;
}) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <Controller
      control={form.control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.error ? true : undefined}>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          <FieldContent>
            <Input
              id={id}
              aria-invalid={fieldState.error ? true : undefined}
              aria-describedby={fieldState.error ? errorId : undefined}
              autoComplete="off"
              {...field}
            />
            <FieldError id={errorId}>{fieldState.error?.message}</FieldError>
          </FieldContent>
        </Field>
      )}
    />
  );
}

function ReadOnlyEmailField({ email }: { email: string }) {
  const id = useId();

  return (
    <Field>
      <FieldLabel htmlFor={id}>Email de acceso</FieldLabel>
      <FieldContent>
        <Input id={id} type="email" value={email} disabled />
        <FieldDescription>
          Para cambiar el email de acceso, contactá a administración.
        </FieldDescription>
      </FieldContent>
    </Field>
  );
}

function readAcademyProfileValues(formData: FormData): AcademyProfileValues {
  return {
    name: readFormString(formData, "name"),
    contactName: readFormString(formData, "contactName"),
    phone: readFormString(formData, "phone"),
  };
}

function readFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : "";
}

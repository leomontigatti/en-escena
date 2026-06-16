import { zodResolver } from "@hookform/resolvers/zod";
import { Check } from "lucide-react";
import { useEffect, useId } from "react";
import {
  Controller,
  useForm,
  type FieldPath,
  type UseFormReturn,
} from "react-hook-form";
import { redirect, useActionData } from "react-router";
import { z } from "zod";

import type { PortalRouteHandle } from "@/components/portal/ui";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  updateAcademyProfile,
  type AcademyProfileField,
} from "@/lib/portal/academy-profile.server";
import {
  createValidatedNativeSubmitHandler,
  requiredFieldMessage,
  useApplyServerFieldErrors,
} from "@/lib/shared/forms";
import { useServerActionToast } from "@/lib/shared/toasts";

const profileFormId = "portal-perfil-form";

const academyProfileSchema = z.object({
  name: z.string().trim().min(1, requiredFieldMessage),
  contactName: z.string().trim().min(1, requiredFieldMessage),
  phone: z.string().trim().min(1, requiredFieldMessage),
});

type LoaderData = Awaited<ReturnType<typeof loader>>;
type ActionData = Extract<
  Awaited<ReturnType<typeof action>>,
  { status: "error" }
>;
type AcademyProfileFormValues = z.infer<typeof academyProfileSchema>;
type AcademyProfileFormReturn = UseFormReturn<
  AcademyProfileFormValues,
  unknown,
  AcademyProfileFormValues
>;
type AcademyProfileFieldErrors = Partial<Record<AcademyProfileField, string>>;

const emptyAcademyProfileFieldErrors: AcademyProfileFieldErrors = {};

export const meta = () => [
  { title: "Perfil | Portal de academias | En Escena" },
];

export const handle = {
  portalBreadcrumbs: [{ label: "Perfil" }],
} satisfies PortalRouteHandle;

export async function loader({ request }: { request: Request }) {
  const { user, academy } = await requireAcademyUser(request);

  return {
    email: user.email,
    academy,
  };
}

export async function action({ request }: { request: Request }) {
  const { academy } = await requireAcademyUser(request);
  const formData = await request.formData();
  const intent = readFormString(formData, "intent");

  if (intent !== "" && intent !== "update-academy-profile") {
    throw new Response("Acción no soportada.", { status: 400 });
  }

  const values = {
    name: readFormString(formData, "name"),
    contactName: readFormString(formData, "contactName"),
    phone: readFormString(formData, "phone"),
  };
  const parsed = academyProfileSchema.safeParse(values);

  if (!parsed.success) {
    const flattened = parsed.error.flatten().fieldErrors;

    return {
      status: "error" as const,
      message: "Revisá los campos marcados.",
      fieldErrors: {
        name: flattened.name?.[0],
        contactName: flattened.contactName?.[0],
        phone: flattened.phone?.[0],
      },
      values,
    };
  }

  const result = await updateAcademyProfile(academy.id, parsed.data);

  if (!result.ok) {
    return {
      status: "error" as const,
      message: result.message,
      fieldErrors: result.fieldErrors,
      values: result.values,
    };
  }

  throw redirect("/portal/perfil?notificacion=perfil-guardado");
}

export function PortalPerfilRouteView({
  loaderData,
  actionData: actionDataOverride,
}: {
  loaderData: LoaderData;
  actionData?: ActionData;
}) {
  const actionData =
    actionDataOverride?.status === "error" ? actionDataOverride : undefined;
  const values = actionData?.values ?? {
    name: loaderData.academy.name,
    contactName: loaderData.academy.contactName,
    phone: loaderData.academy.phone,
  };
  const form = useAcademyProfileForm({
    fieldErrors: actionData?.fieldErrors,
    values,
  });

  useServerActionToast(getGeneralActionError(actionData), {
    toastId: "portal-perfil:error",
  });

  return (
    <section className="flex flex-col gap-6" aria-labelledby="perfil-title">
      <div className="flex flex-col gap-1">
        <h1 id="perfil-title" className="text-xl font-semibold">
          Perfil
        </h1>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          Actualizá los datos principales de tu academia.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Datos de la academia</CardTitle>
          <CardDescription>
            Esta información se usa para identificar a la academia y contactar a
            la persona responsable.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            id={profileFormId}
            method="post"
            noValidate
            onSubmit={form.handleSubmit}
          >
            <input type="hidden" name="intent" value="update-academy-profile" />
            <FieldGroup className="grid gap-5 md:grid-cols-2">
              <AcademyProfileTextField
                autoComplete="organization"
                error={actionData?.fieldErrors.name}
                form={form.form}
                label="Nombre de la academia"
                name="name"
              />
              <AcademyProfileTextField
                autoComplete="name"
                error={actionData?.fieldErrors.contactName}
                form={form.form}
                label="Nombre de contacto"
                name="contactName"
              />
              <AcademyProfileTextField
                autoComplete="tel"
                error={actionData?.fieldErrors.phone}
                form={form.form}
                inputMode="tel"
                label="Teléfono"
                name="phone"
                type="tel"
              />
              <Field data-disabled>
                <FieldLabel htmlFor="portal-perfil-email">
                  Email de acceso
                </FieldLabel>
                <FieldContent>
                  <Input
                    id="portal-perfil-email"
                    autoComplete="email"
                    disabled
                    type="email"
                    value={loaderData.email}
                  />
                  <FieldDescription>
                    Para cambiar el email de acceso, contactá a administración.
                  </FieldDescription>
                </FieldContent>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
        <CardFooter className="justify-end gap-3 border-0 bg-transparent pt-0">
          <Button type="submit" form={profileFormId} size="lg">
            <Check aria-hidden="true" data-icon="inline-start" />
            Guardar cambios
          </Button>
        </CardFooter>
      </Card>
    </section>
  );
}

export default function PortalPerfilRoute({
  loaderData,
}: {
  loaderData: LoaderData;
}) {
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
  values: AcademyProfileFormValues;
}) {
  const form = useForm<
    AcademyProfileFormValues,
    unknown,
    AcademyProfileFormValues
  >({
    defaultValues: values,
    mode: "onSubmit",
    resolver: zodResolver(academyProfileSchema),
  });

  useEffect(() => {
    form.reset(values);
  }, [form, values.contactName, values.name, values.phone]);

  useApplyServerFieldErrors(form, fieldErrors);

  return { form, handleSubmit: createValidatedNativeSubmitHandler(form) };
}

function AcademyProfileTextField({
  autoComplete,
  error,
  form,
  inputMode,
  label,
  name,
  type = "text",
}: {
  autoComplete: string;
  error?: string;
  form: AcademyProfileFormReturn;
  inputMode?: "tel";
  label: string;
  name: FieldPath<AcademyProfileFormValues>;
  type?: "tel" | "text";
}) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <Controller
      control={form.control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.error || error ? true : undefined}>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          <FieldContent>
            <Input
              id={id}
              autoComplete={autoComplete}
              aria-invalid={fieldState.error || error ? true : undefined}
              aria-describedby={fieldState.error || error ? errorId : undefined}
              inputMode={inputMode}
              type={type}
              {...field}
            />
            <FieldError id={errorId}>
              {fieldState.error?.message ?? error}
            </FieldError>
          </FieldContent>
        </Field>
      )}
    />
  );
}

function readFormString(formData: FormData, name: string) {
  const value = formData.get(name);

  return typeof value === "string" ? value : "";
}

function getGeneralActionError(actionData?: ActionData) {
  if (!actionData?.message) {
    return undefined;
  }

  if (Object.values(actionData.fieldErrors).some(Boolean)) {
    return undefined;
  }

  return {
    status: "error" as const,
    message: actionData.message,
  };
}

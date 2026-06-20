import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Info, KeyRound, Lock } from "lucide-react";
import { useEffect, useId, useState } from "react";
import {
  Controller,
  useForm,
  type FieldPath,
  type UseFormReturn,
} from "react-hook-form";
import { data, redirect, useActionData } from "react-router";
import { z } from "zod";

import type { PortalRouteHandle } from "@/components/portal/ui";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
  Field,
  FieldContent,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { requestAccessRecoveryEmail } from "@/lib/auth/access-recovery.server";
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
const passwordRecoveryFormId = "portal-password-recovery-form";
const updateAcademyProfileIntent = "update-academy-profile";
const requestPasswordRecoveryIntent = "request-password-recovery";

const academyProfileSchema = z.object({
  name: z.string().trim().min(1, requiredFieldMessage),
  contactName: z.string().trim().min(1, requiredFieldMessage),
  phone: z.string().trim().min(1, requiredFieldMessage),
});

type LoaderData = Awaited<ReturnType<typeof loader>>;
type ActionData =
  | {
      status: "success";
      message: string;
    }
  | {
      status: "error";
      message: string;
      fieldErrors: AcademyProfileFieldErrors;
      values: AcademyProfileFormValues;
    };
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
  const { academy, user } = await requireAcademyUser(request);
  const formData = await request.formData();
  const intent = readFormString(formData, "intent");

  if (intent === requestPasswordRecoveryIntent) {
    const result = await requestAccessRecoveryEmail({
      email: user.email,
      requestUrl: request.url,
      request,
    });

    return data(
      {
        status: "success" as const,
        message: result.message,
      },
      {
        headers: result.headers,
      },
    );
  }

  if (intent !== "" && intent !== updateAcademyProfileIntent) {
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

  const result = await updateAcademyProfile(academy.id, {
    ...parsed.data,
    name: academy.name,
  });

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
  const passwordRecoveryResult =
    actionDataOverride?.status === "success" ? actionDataOverride : undefined;
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
  useServerActionToast(passwordRecoveryResult, {
    toastId: "portal-perfil:password-recovery",
  });

  return (
    <section className="flex flex-col gap-6" aria-labelledby="perfil-title">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 id="perfil-title" className="text-xl font-semibold">
            Perfil
          </h1>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            Actualizá los datos para identificar a tu academia y contactar a la
            persona responsable.
          </p>
        </div>
        <ProfileActionsMenu />
      </header>

      <Alert>
        <Info aria-hidden="true" />
        <AlertDescription>
          Para cambiar el nombre de la academia o el email de acceso, comunicate
          con nosotros.
        </AlertDescription>
      </Alert>

      <Card>
        <CardContent>
          <form
            id={profileFormId}
            method="post"
            noValidate
            onSubmit={form.handleSubmit}
          >
            <input
              type="hidden"
              name="intent"
              value={updateAcademyProfileIntent}
            />
            <FieldGroup className="grid gap-5 md:grid-cols-2">
              <ReadOnlyTextField
                autoComplete="organization"
                label="Nombre de la academia"
                name="name"
                value={values.name}
              />
              <ReadOnlyEmailField email={loaderData.email} />
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
                label="Teléfono de contacto"
                name="phone"
                type="tel"
              />
            </FieldGroup>
          </form>
        </CardContent>
        <CardFooter className="justify-end gap-3 border-0 bg-transparent pt-0">
          <Button type="submit" form={profileFormId} size="lg">
            <Check aria-hidden="true" data-icon="inline-start" />
            Guardar
          </Button>
        </CardFooter>
      </Card>

      <PasswordRecoveryForm email={loaderData.email} />
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

function ReadOnlyTextField({
  autoComplete,
  label,
  name,
  value,
}: {
  autoComplete: string;
  label: string;
  name?: string;
  value: string;
}) {
  const id = useId();

  return (
    <Field data-disabled>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <FieldContent>
        {name ? <input type="hidden" name={name} value={value} /> : null}
        <div className="relative">
          <Input
            id={id}
            autoComplete={autoComplete}
            disabled
            readOnly
            value={value}
            className="pr-9"
          />
          <Lock
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-3 size-3 -translate-y-1/2 text-muted-foreground"
          />
        </div>
      </FieldContent>
    </Field>
  );
}

function ReadOnlyEmailField({ email }: { email: string }) {
  const id = useId();

  return (
    <Field data-disabled>
      <FieldLabel htmlFor={id}>Email de acceso</FieldLabel>
      <FieldContent>
        <div className="relative">
          <Input
            id={id}
            autoComplete="email"
            disabled
            readOnly
            type="email"
            value={email}
            className="pr-9"
          />
          <Lock
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-3 size-3 -translate-y-1/2 text-muted-foreground"
          />
        </div>
      </FieldContent>
    </Field>
  );
}

function ProfileActionsMenu() {
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);

  return (
    <>
      <ResourceActionsMenu contentClassName="w-48">
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            setIsPasswordDialogOpen(true);
          }}
        >
          <KeyRound aria-hidden="true" />
          Cambiar contraseña
        </DropdownMenuItem>
      </ResourceActionsMenu>
      <AlertDialog
        open={isPasswordDialogOpen}
        onOpenChange={setIsPasswordDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Enviar email para cambiar contraseña?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Te vamos a enviar un enlace al email de acceso de la academia para
              definir una nueva contraseña.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancelar</AlertDialogCancel>
            <Button type="submit" form={passwordRecoveryFormId}>
              <Check aria-hidden="true" data-icon="inline-start" />
              Enviar email
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function PasswordRecoveryForm({ email }: { email: string }) {
  return (
    <form id={passwordRecoveryFormId} method="post">
      <input
        type="hidden"
        name="intent"
        value={requestPasswordRecoveryIntent}
      />
      <input type="hidden" name="email" value={email} />
    </form>
  );
}

function readFormString(formData: FormData, name: string) {
  const value = formData.get(name);

  return typeof value === "string" ? value : "";
}

function getGeneralActionError(
  actionData?: Extract<ActionData, { status: "error" }>,
) {
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

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Info, KeyRound, Lock } from "lucide-react";
import { useEffect, useId, useState } from "react";
import {
  Controller,
  useForm,
  type FieldPath,
  type UseFormReturn,
} from "react-hook-form";
import { useNavigation, useSubmit } from "react-router";

import { SubmitButton } from "@/components/shared/action-buttons";
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
import type { loadPortalProfile } from "@/features/portal/profile/server";
import {
  academyProfileSchema,
  emptyAcademyProfileFieldErrors,
  passwordRecoveryFormId,
  profileFormId,
  requestPasswordRecoveryIntent,
  updateAcademyProfileIntent,
  type AcademyProfileFieldErrors,
  type AcademyProfileFormValues,
  type PortalProfileActionData,
} from "@/features/portal/profile/shared";
import { argentinePhonePlaceholder } from "@/lib/shared/argentine-phone";
import {
  createValidatedRouteSubmitHandler,
  isRouteFormPending,
  useApplyServerFieldErrors,
} from "@/lib/shared/forms";
import { useServerActionToast } from "@/lib/shared/toasts";

type PortalProfileLoaderData = Awaited<ReturnType<typeof loadPortalProfile>>;
type AcademyProfileFormReturn = UseFormReturn<
  AcademyProfileFormValues,
  unknown,
  AcademyProfileFormValues
>;

export function PortalProfileRouteView({
  loaderData,
  actionData: actionDataOverride,
}: {
  loaderData: PortalProfileLoaderData;
  actionData?: PortalProfileActionData;
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
  const navigation = useNavigation();
  const isProfileSaving = isRouteFormPending(navigation, {
    intent: updateAcademyProfileIntent,
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

      <Alert variant="info">
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
                maxLength={10}
                name="phone"
                placeholder={argentinePhonePlaceholder}
                type="tel"
              />
            </FieldGroup>
          </form>
        </CardContent>
        <CardFooter className="justify-end gap-3 border-0 bg-transparent pt-0">
          <SubmitButton
            form={profileFormId}
            size="lg"
            isPending={isProfileSaving}
          />
        </CardFooter>
      </Card>

      <PasswordRecoveryForm email={loaderData.email} />
    </section>
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
  const submit = useSubmit();

  return {
    form,
    handleSubmit: createValidatedRouteSubmitHandler(form, submit),
  };
}

function AcademyProfileTextField({
  autoComplete,
  error,
  form,
  inputMode,
  label,
  maxLength,
  name,
  placeholder,
  type = "text",
}: {
  autoComplete: string;
  error?: string;
  form: AcademyProfileFormReturn;
  inputMode?: "tel";
  label: string;
  maxLength?: number;
  name: FieldPath<AcademyProfileFormValues>;
  placeholder?: string;
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
              maxLength={maxLength}
              placeholder={placeholder}
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

function getGeneralActionError(
  actionData?: Extract<PortalProfileActionData, { status: "error" }>,
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

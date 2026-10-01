import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Info, KeyRound } from "lucide-react";
import { useState } from "react";
import { useForm, type FieldPath, type UseFormReturn } from "react-hook-form";
import { Form, useNavigation, useSubmit } from "react-router";

import { FormActions } from "@/components/shared/form-actions";
import { AlertStack } from "@/components/shared/alert-stack";
import { ReadOnlyField } from "@/components/shared/read-only-field";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { TextInputField } from "@/components/shared/text-input-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import type { loadPortalProfile } from "@/features/portal/profile/server";
import {
  academyProfileSchema,
  passwordRecoveryFormId,
  profileFormId,
  requestPasswordRecoveryIntent,
  updateAcademyProfileIntent,
  type AcademyProfileFormValues,
  type PortalProfileActionData,
} from "@/features/portal/profile/shared";
import { argentinePhonePlaceholder } from "@/lib/shared/argentine-phone";
import {
  createValidatedRouteSubmitHandler,
  isRouteFormPending,
  useCloseOnceSettled,
  useSavedFormValues,
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
  const successResult =
    actionDataOverride?.status === "success" ? actionDataOverride : undefined;
  const savedValues: AcademyProfileFormValues = {
    name: loaderData.academy.name,
    contactName: loaderData.academy.contactName,
    phone: loaderData.academy.phone,
  };
  const values = actionData?.values ?? savedValues;
  const form = useAcademyProfileForm({
    savedValues,
    values,
  });
  const navigation = useNavigation();
  const isProfileSaving = isRouteFormPending(navigation, {
    intent: updateAcademyProfileIntent,
  });

  useServerActionToast(getGeneralActionError(actionData), {
    toastId: "portal-perfil:error",
  });
  useServerActionToast(successResult, {
    toastId: "portal-perfil:success",
  });

  return (
    <section
      className="flex flex-1 flex-col gap-6"
      aria-labelledby="perfil-title"
    >
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

      <AlertStack>
        <Alert variant="info">
          <Info aria-hidden="true" />
          <AlertTitle>Datos de la academia</AlertTitle>
          <AlertDescription>
            Para cambiar el nombre de la academia o el email de acceso,
            comunicate con nosotros.
          </AlertDescription>
        </Alert>
      </AlertStack>

      <Card className="overflow-clip">
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
              <ReadOnlyField
                autoComplete="organization"
                label="Nombre de la academia"
                name="name"
                value={values.name}
              />
              <ReadOnlyField
                autoComplete="email"
                label="Email de acceso"
                type="email"
                value={loaderData.email}
              />
              <AcademyProfileTextField
                autoComplete="name"
                form={form.form}
                label="Nombre de contacto"
                name="contactName"
              />
              <AcademyProfileTextField
                autoComplete="tel"
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
        <FormActions
          backTo="/portal"
          form={profileFormId}
          hasChanges={form.form.formState.isDirty}
          isPending={isProfileSaving}
          onDiscard={form.discard}
        />
      </Card>

      <PasswordRecoveryForm email={loaderData.email} />
    </section>
  );
}

/**
 * `savedValues` is what "changed" is measured against; `values` is what the
 * form shows, which after a refused save is what was typed and still reads as
 * changed ({@link useSavedFormValues}).
 */
function useAcademyProfileForm({
  savedValues,
  values,
}: {
  savedValues: AcademyProfileFormValues;
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
  useSavedFormValues(form, savedValues, values);

  const submit = useSubmit();

  return {
    discard: () => form.reset(savedValues),
    form,
    handleSubmit: createValidatedRouteSubmitHandler(form, submit),
  };
}

function AcademyProfileTextField({
  autoComplete,
  form,
  inputMode,
  label,
  maxLength,
  name,
  placeholder,
  type = "text",
}: {
  autoComplete: string;
  form: AcademyProfileFormReturn;
  inputMode?: "tel";
  label: string;
  maxLength?: number;
  name: FieldPath<AcademyProfileFormValues>;
  placeholder?: string;
  type?: "tel" | "text";
}) {
  return (
    <TextInputField
      autoComplete={autoComplete}
      control={form.control}
      inputMode={inputMode}
      label={label}
      maxLength={maxLength}
      name={name}
      placeholder={placeholder}
      type={type}
    />
  );
}

function ProfileActionsMenu() {
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const navigation = useNavigation();
  const isSending = isRouteFormPending(navigation, {
    intent: requestPasswordRecoveryIntent,
  });

  useCloseOnceSettled({
    isPending: isSending,
    onClose: () => setIsPasswordDialogOpen(false),
  });

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
            <AlertDialogCancel type="button" disabled={isSending}>
              Cancelar
            </AlertDialogCancel>
            <Button
              type="submit"
              form={passwordRecoveryFormId}
              disabled={isSending}
            >
              {isSending ? (
                <Spinner aria-hidden="true" data-icon />
              ) : (
                <Check aria-hidden="true" data-icon="inline-start" />
              )}
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
    <Form id={passwordRecoveryFormId} method="post">
      <input
        type="hidden"
        name="intent"
        value={requestPasswordRecoveryIntent}
      />
      <input type="hidden" name="email" value={email} />
    </Form>
  );
}

function getGeneralActionError(
  actionData?: Extract<PortalProfileActionData, { status: "error" }>,
) {
  if (!actionData?.message) {
    return undefined;
  }

  return {
    status: "error" as const,
    message: actionData.message,
  };
}

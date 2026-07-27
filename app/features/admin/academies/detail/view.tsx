import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm, type FieldPath, type UseFormReturn } from "react-hook-form";
import { Link, useNavigation, useSubmit } from "react-router";

import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { SubmitButton } from "@/components/shared/action-buttons";
import { ReadOnlyField } from "@/components/shared/read-only-field";
import { TextInputField } from "@/components/shared/text-input-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { argentinePhonePlaceholder } from "@/lib/shared/argentine-phone";
import {
  createValidatedRouteSubmitHandler,
  isRouteFormPending,
} from "@/lib/shared/forms";
import { useServerActionToast } from "@/lib/shared/toasts";

import {
  academyDetailFormId,
  academyDetailSchema,
  updateAcademyIntent,
  type AcademyDetailActionData,
  type AcademyDetailFormValues,
} from "./shared";
import type { AcademyDetailLoaderData } from "./server";

type AcademyDetailFormReturn = UseFormReturn<
  AcademyDetailFormValues,
  unknown,
  AcademyDetailFormValues
>;

export function AdministracionAcademiaDetalleRouteView({
  actionData,
  loaderData,
}: {
  actionData?: AcademyDetailActionData;
  loaderData: AcademyDetailLoaderData;
}) {
  const { academy, canEdit } = loaderData;
  const errorData = actionData?.status === "error" ? actionData : undefined;
  const values = errorData?.values ?? {
    name: academy.name,
    contactName: academy.contactName,
    phone: academy.phone,
  };
  const form = useAcademyDetailForm({ values });
  const navigation = useNavigation();
  const isSaving = isRouteFormPending(navigation, {
    intent: updateAcademyIntent,
  });

  useServerActionToast(actionData, {
    toastId: "administracion-academia:feedback",
  });

  return (
    <AdminResourceLayout
      requireSelectedEvent={false}
      selectedEventId={loaderData.selectedEventId}
      title={academy.name}
      description="Consultá y actualizá los datos de contacto de la academia."
    >
      <Card>
        <CardContent>
          <form
            id={academyDetailFormId}
            method="post"
            noValidate
            onSubmit={form.handleSubmit}
          >
            <input type="hidden" name="intent" value={updateAcademyIntent} />
            <FieldGroup className="grid gap-5 md:grid-cols-2">
              <AcademyDetailTextField
                autoComplete="organization"
                disabled={!canEdit}
                form={form.form}
                label="Nombre de la academia"
                name="name"
              />
              <ReadOnlyField
                autoComplete="email"
                label="Email de acceso"
                type="email"
                value={academy.email}
              />
              <AcademyDetailTextField
                autoComplete="name"
                disabled={!canEdit}
                form={form.form}
                label="Nombre de contacto"
                name="contactName"
              />
              <AcademyDetailTextField
                autoComplete="tel"
                disabled={!canEdit}
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
        <CardFooter className="justify-end gap-2 border-0 bg-transparent pt-0">
          <Button asChild variant="outline">
            <Link to="/administracion/academias">Volver</Link>
          </Button>
          {canEdit ? (
            <SubmitButton form={academyDetailFormId} isPending={isSaving} />
          ) : null}
        </CardFooter>
      </Card>
    </AdminResourceLayout>
  );
}

function useAcademyDetailForm({ values }: { values: AcademyDetailFormValues }) {
  const form = useForm<
    AcademyDetailFormValues,
    unknown,
    AcademyDetailFormValues
  >({
    defaultValues: values,
    mode: "onSubmit",
    resolver: zodResolver(academyDetailSchema),
  });

  useEffect(() => {
    form.reset(values);
  }, [form, values.contactName, values.name, values.phone]);

  const submit = useSubmit();

  return {
    form,
    handleSubmit: createValidatedRouteSubmitHandler(form, submit),
  };
}

function AcademyDetailTextField({
  autoComplete,
  disabled,
  form,
  inputMode,
  label,
  maxLength,
  name,
  placeholder,
  type = "text",
}: {
  autoComplete: string;
  disabled?: boolean;
  form: AcademyDetailFormReturn;
  inputMode?: "tel";
  label: string;
  maxLength?: number;
  name: FieldPath<AcademyDetailFormValues>;
  placeholder?: string;
  type?: "tel" | "text";
}) {
  return (
    <TextInputField
      autoComplete={autoComplete}
      control={form.control}
      disabled={disabled}
      inputMode={inputMode}
      label={label}
      maxLength={maxLength}
      name={name}
      placeholder={placeholder}
      type={type}
    />
  );
}

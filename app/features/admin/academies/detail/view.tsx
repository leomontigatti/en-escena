import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigation, useSubmit } from "react-router";

import {
  AdminResourceFormCard,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { SubmitButton } from "@/components/shared/action-buttons";
import { ReadOnlyField } from "@/components/shared/read-only-field";
import { TextInputField } from "@/components/shared/text-input-field";
import { Button } from "@/components/ui/button";
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
  type AcademyDetailLoaderData,
} from "./shared";

export function AcademyDetailRouteView({
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
      <AdminResourceFormCard
        footer={
          <>
            <Button asChild variant="outline">
              <Link to="/administracion/academias">Volver</Link>
            </Button>
            {canEdit ? (
              <SubmitButton form={academyDetailFormId} isPending={isSaving} />
            ) : null}
          </>
        }
      >
        <form
          id={academyDetailFormId}
          method="post"
          noValidate
          onSubmit={form.handleSubmit}
        >
          <input type="hidden" name="intent" value={updateAcademyIntent} />
          <FieldGroup className="grid gap-5 md:grid-cols-2">
            <TextInputField
              autoComplete="organization"
              control={form.form.control}
              disabled={!canEdit}
              label="Nombre de la academia"
              name="name"
            />
            <ReadOnlyField
              autoComplete="email"
              label="Email de acceso"
              type="email"
              value={academy.email}
            />
            <TextInputField
              autoComplete="name"
              control={form.form.control}
              disabled={!canEdit}
              label="Nombre de contacto"
              name="contactName"
            />
            <TextInputField
              autoComplete="tel"
              control={form.form.control}
              disabled={!canEdit}
              inputMode="tel"
              label="Teléfono de contacto"
              maxLength={10}
              name="phone"
              placeholder={argentinePhonePlaceholder}
              type="tel"
            />
          </FieldGroup>
        </form>
      </AdminResourceFormCard>
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

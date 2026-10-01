import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useFormState } from "react-hook-form";
import { useSubmit } from "react-router";

import {
  AdminResourceFormCard,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { FormActions } from "@/components/shared/form-actions";
import { FieldGroup } from "@/components/ui/field";
import {
  PaymentAcademyField,
  PaymentFields,
} from "@/features/admin/payments/form-fields";
import {
  createValidatedRouteFormDataSubmitHandler,
  isRouteFormPending,
  useOptionalNavigation,
  useSavedFormValues,
} from "@/lib/shared/forms";
import { useServerActionToast } from "@/lib/shared/toasts";

import {
  createPaymentIntent,
  createPaymentSchema,
  type CreatePaymentActionData,
  type CreatePaymentFormValues,
  type CreatePaymentSubmissionValues,
} from "./shared";
import type { loadPaymentCreate } from "./server";

type LoaderData = Awaited<ReturnType<typeof loadPaymentCreate>>;

type NewPaymentRouteViewProps = {
  actionData?: CreatePaymentActionData;
  loaderData: LoaderData;
};

export function NewPaymentRouteView({
  actionData,
  loaderData,
}: NewPaymentRouteViewProps) {
  const navigation = useOptionalNavigation();
  const isPending = isRouteFormPending(navigation, {
    intent: createPaymentIntent,
  });
  const form = useForm<
    CreatePaymentFormValues,
    unknown,
    CreatePaymentSubmissionValues
  >({
    defaultValues: loaderData.values,
    mode: "onSubmit",
    resolver: zodResolver(createPaymentSchema),
  });
  const submit = useSubmit();
  const { isDirty } = useFormState({ control: form.control });
  useSavedFormValues(form, loaderData.values, actionData?.values);

  useServerActionToast(actionData);

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Nuevo pago"
      description="Registrá un pago recibido para una academia dentro del evento activo."
      eventRequiredEmptyState={{
        title: "No hay un evento activo para registrar pagos",
        description: "Activá un evento para registrar pagos recibidos.",
      }}
    >
      <form
        method="post"
        noValidate
        className="flex flex-1 flex-col gap-6"
        onSubmit={createValidatedRouteFormDataSubmitHandler(form, submit)}
      >
        <input type="hidden" name="intent" value={createPaymentIntent} />
        <AdminResourceFormCard
          contentClassName="gap-5"
          footer={
            <FormActions
              backTo="/administracion/pagos"
              hasChanges={isDirty}
              isPending={isPending}
              onDiscard={() => form.reset()}
            />
          }
        >
          <FieldGroup className="grid gap-5 md:grid-cols-2">
            <PaymentAcademyField
              academies={loaderData.academies}
              control={form.control}
            />
            <PaymentFields control={form.control} />
          </FieldGroup>
        </AdminResourceFormCard>
      </form>
    </AdminResourceLayout>
  );
}

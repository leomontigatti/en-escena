import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useFormState } from "react-hook-form";
import { useSubmit } from "react-router";

import {
  AdminResourceFormCard,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { FormActions } from "@/components/shared/form-actions";
import { SelectField } from "@/components/shared/select-field";
import { FieldGroup } from "@/components/ui/field";
import {
  PaymentAcademyField,
  PaymentFields,
} from "@/features/admin/payments/form-fields";
import {
  movementKindLabels,
  movementKinds,
} from "@/lib/finances/movement-kinds";
import {
  createValidatedRouteFormDataSubmitHandler,
  isRouteFormPending,
  useLastRefusedValues,
  useOptionalNavigation,
  useSavedFormValues,
} from "@/lib/shared/forms";
import { useServerActionToast } from "@/lib/shared/toasts";

import {
  createMovementIntent,
  createMovementSchema,
  type CreateMovementActionData,
  type CreateMovementFormValues,
  type CreateMovementSubmissionValues,
} from "./shared";
import type { loadMovementCreate } from "./server";

type LoaderData = Awaited<ReturnType<typeof loadMovementCreate>>;

type NewMovementRouteViewProps = {
  actionData?: CreateMovementActionData;
  loaderData: LoaderData;
};

const movementKindOptions = movementKinds.map((kind) => ({
  value: kind,
  label: movementKindLabels[kind],
}));

export function NewMovementRouteView({
  actionData,
  loaderData,
}: NewMovementRouteViewProps) {
  const navigation = useOptionalNavigation();
  const isPending = isRouteFormPending(navigation, {
    intent: createMovementIntent,
  });
  const form = useForm<
    CreateMovementFormValues,
    unknown,
    CreateMovementSubmissionValues
  >({
    defaultValues: loaderData.values,
    mode: "onSubmit",
    resolver: zodResolver(createMovementSchema),
  });
  const submit = useSubmit();
  const { isDirty } = useFormState({ control: form.control });
  useSavedFormValues(
    form,
    loaderData.values,
    useLastRefusedValues(actionData?.values),
  );

  useServerActionToast(actionData);

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Nuevo movimiento"
      description="Registrá un pago recibido o un reembolso para una academia dentro del evento activo."
      eventRequiredEmptyState={{
        title: "No hay un evento activo para registrar movimientos",
        description: "Activá un evento para registrar pagos y reembolsos.",
      }}
    >
      <form
        method="post"
        noValidate
        className="flex flex-1 flex-col gap-6"
        onSubmit={createValidatedRouteFormDataSubmitHandler(form, submit)}
      >
        <input type="hidden" name="intent" value={createMovementIntent} />
        <AdminResourceFormCard
          contentClassName="gap-5"
          footer={
            <FormActions
              backTo="/administracion/movimientos"
              hasChanges={isDirty}
              isPending={isPending}
              onDiscard={() => form.reset()}
            />
          }
        >
          <FieldGroup className="grid gap-5 md:grid-cols-2">
            <SelectField
              control={form.control}
              id="movement-kind"
              label="Tipo"
              name="movementKind"
              options={movementKindOptions}
            />
            <PaymentAcademyField
              academies={loaderData.academies}
              className="md:col-span-1"
              control={form.control}
            />
            <PaymentFields control={form.control} />
          </FieldGroup>
        </AdminResourceFormCard>
      </form>
    </AdminResourceLayout>
  );
}

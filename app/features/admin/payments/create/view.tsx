import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { type Control, useForm } from "react-hook-form";
import { Link, useSubmit } from "react-router";

import {
  AdminResourceFormCard,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { SubmitButton } from "@/components/shared/action-buttons";
import { ComboboxField } from "@/components/shared/combobox-field";
import { DateOnlyField } from "@/components/shared/date-only-field";
import { IntegerInputField } from "@/components/shared/integer-input-field";
import { SelectField } from "@/components/shared/select-field";
import { TextInputField } from "@/components/shared/text-input-field";
import { TextareaField } from "@/components/shared/textarea-field";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { paymentMethodOptions } from "@/features/admin/academies/account-current/shared";
import {
  createValidatedRouteFormDataSubmitHandler,
  isRouteFormPending,
  useOptionalNavigation,
} from "@/lib/shared/forms";
import { useServerActionToast } from "@/lib/shared/toasts";

import {
  createPaymentIntent,
  createPaymentSchema,
  type CreatePaymentActionData,
  type CreatePaymentFormValues,
  type CreatePaymentSubmissionValues,
} from "./shared";
import type { loadAdminPaymentCreate } from "./server";

type LoaderData = Awaited<ReturnType<typeof loadAdminPaymentCreate>>;
type CreatePaymentControl = Control<
  CreatePaymentFormValues,
  unknown,
  CreatePaymentSubmissionValues
>;

type AdministracionPagosNuevoRouteViewProps = {
  actionData?: CreatePaymentActionData;
  loaderData: LoaderData;
};

export function AdministracionPagosNuevoRouteView({
  actionData,
  loaderData,
}: AdministracionPagosNuevoRouteViewProps) {
  const navigation = useOptionalNavigation();
  const isPending = isRouteFormPending(navigation, {
    intent: createPaymentIntent,
  });
  const values = actionData?.values ?? loaderData.values;
  const form = useForm<
    CreatePaymentFormValues,
    unknown,
    CreatePaymentSubmissionValues
  >({
    defaultValues: values,
    mode: "onSubmit",
    resolver: zodResolver(createPaymentSchema),
  });
  const submit = useSubmit();
  const { reset } = form;
  const resetKey = JSON.stringify(values);

  useEffect(() => {
    reset(values);
  }, [reset, resetKey, values]);

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
        onSubmit={createValidatedRouteFormDataSubmitHandler(form, submit)}
      >
        <input type="hidden" name="intent" value={createPaymentIntent} />
        <AdminResourceFormCard
          contentClassName="gap-5"
          footer={
            <>
              <Button asChild variant="outline">
                <Link to={getPaymentsListUrl(loaderData.selectedEventId)}>
                  Volver
                </Link>
              </Button>
              <SubmitButton isPending={isPending} />
            </>
          }
        >
          <FieldGroup className="grid gap-5 md:grid-cols-2">
            <AcademyField
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

function AcademyField({
  academies,
  control,
}: {
  academies: LoaderData["academies"];
  control: CreatePaymentControl;
}) {
  return (
    <ComboboxField
      className="md:col-span-2"
      control={control}
      id="academy-id"
      label="Academia"
      name="academyId"
      options={academies.map((academy) => ({
        value: academy.id,
        label: academy.name,
      }))}
    />
  );
}

function PaymentFields({ control }: { control: CreatePaymentControl }) {
  return (
    <>
      <DateOnlyField
        control={control}
        name="paymentDate"
        className="md:col-start-1"
        id="payment-date"
        label="Fecha de pago"
      />

      <TextInputField
        className="md:col-start-2"
        control={control}
        id="payment-reference"
        label="Referencia"
        name="reference"
      />

      <IntegerInputField
        className="md:col-start-1"
        control={control}
        id="payment-amount"
        label="Monto"
        min="1"
        name="amount"
        step="1"
      />

      <SelectField
        className="md:col-start-2"
        control={control}
        id="payment-method"
        label="Medio de pago"
        name="paymentMethod"
        options={paymentMethodOptions}
        placeholder="Seleccioná un medio de pago"
      />

      <TextareaField
        className="md:col-span-2"
        control={control}
        id="payment-internalNote"
        label="Nota interna"
        name="internalNote"
      />
    </>
  );
}

function getPaymentsListUrl(selectedEventId: string | null) {
  return selectedEventId
    ? `/administracion/pagos?evento=${selectedEventId}`
    : "/administracion/pagos";
}

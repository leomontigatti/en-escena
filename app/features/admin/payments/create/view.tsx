import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Link, useSubmit } from "react-router";

import {
  AdminResourceFormCard,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { SubmitButton } from "@/components/shared/action-buttons";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import {
  PaymentAcademyField,
  PaymentFields,
} from "@/features/admin/payments/form-fields";
import {
  createValidatedRouteFormDataSubmitHandler,
  isRouteFormPending,
  useOptionalNavigation,
  useResetFormValues,
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
  useResetFormValues(form.reset, values);

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

function getPaymentsListUrl(selectedEventId: string | null) {
  return selectedEventId
    ? `/administracion/pagos?evento=${selectedEventId}`
    : "/administracion/pagos";
}

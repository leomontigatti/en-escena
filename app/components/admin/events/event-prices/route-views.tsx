import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import type { ActionData } from "@/lib/admin/events/bases-action.server";
import { buildPriceCreatePath } from "@/lib/admin/events/event-bases-navigation";
import type { EventBasesLoaderData } from "@/lib/admin/events/event-bases.server";
import { useServerActionToast } from "@/lib/shared/toasts";

import { DepositPercentageForm } from "./deposit-percentage-form";
import { EmptyResourceState, PriceActions } from "./actions";
import { PriceForm, PriceFormActions, PriceFormPanel } from "./form";
import { PriceListTable } from "./list-table";
import { getPriceSubmittedValues } from "./shared";

type EventBaseAreaProps = {
  loaderData: EventBasesLoaderData;
  actionData?: ActionData;
};

const createPriceFormId = "create-price-form";

export function EventPricesRouteView({
  loaderData,
  actionData,
}: {
  loaderData: EventBasesLoaderData;
  actionData?: ActionData;
}) {
  useServerActionToast(actionData);

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Precios"
      description="Revisá el alcance y el importe de cada precio del evento activo."
      action={{
        label: "Nuevo precio",
        to: buildPriceCreatePath(loaderData.selectedEventId),
      }}
    >
      <div className="flex flex-col gap-6">
        {loaderData.requiredDepositPercentage !== null ? (
          <DepositPercentageForm
            actionData={actionData}
            requiredDepositPercentage={loaderData.requiredDepositPercentage}
          />
        ) : null}
        {loaderData.prices.length > 0 ? (
          <PriceListTable
            prices={loaderData.prices}
            selectedEventId={loaderData.selectedEventId}
          />
        ) : (
          <AdminEmptyState
            title="Todavía no hay precios creados."
            description="Creá el primer precio para definir importes base o específicos por cronograma del evento activo."
          />
        )}
      </div>
    </AdminResourceLayout>
  );
}

export function NewEventPriceRouteView({
  loaderData,
  actionData,
}: EventBaseAreaProps) {
  useServerActionToast(actionData);

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Nuevo precio"
      description="Configurá tipo de grupo, importe y si el precio aplica como base o para un cronograma específico."
    >
      <PriceFormPanel>
        <PriceForm
          formId={createPriceFormId}
          intent="create-price"
          schedules={loaderData.schedules}
          fieldErrors={actionData?.fieldErrors}
          submittedValues={getPriceSubmittedValues(actionData, "create-price")}
        />
        <PriceFormActions
          formId={createPriceFormId}
          pendingScope={{ intent: "create-price" }}
        />
      </PriceFormPanel>
    </AdminResourceLayout>
  );
}

export function EventPriceDetailRouteView({
  loaderData,
  actionData,
  priceId,
}: EventBaseAreaProps & { priceId: string }) {
  useServerActionToast(actionData);

  const price = loaderData.prices.find((item) => item.id === priceId);

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title={price ? "Editar precio" : "Precio no encontrado"}
      description={
        price
          ? "Editá el alcance, importe y fecha límite de pago."
          : "No encontramos ese precio dentro del evento activo."
      }
      headerAction={price ? <PriceActions price={price} /> : null}
    >
      {price ? (
        <div className="flex flex-col gap-6">
          <PriceFormPanel>
            <PriceForm
              formId="update-price-form"
              id={price.id}
              intent="update-price"
              schedules={loaderData.schedules}
              name={price.name}
              groupType={price.groupType}
              amount={price.amount}
              paymentDeadline={price.paymentDeadline ?? ""}
              scheduleId={price.scheduleId}
              fieldErrors={actionData?.fieldErrors}
              submittedValues={getPriceSubmittedValues(
                actionData,
                "update-price",
                price.id,
              )}
            />
            <PriceFormActions
              formId="update-price-form"
              pendingScope={{
                intent: "update-price",
                fields: { id: price.id },
              }}
            />
          </PriceFormPanel>
        </div>
      ) : (
        <EmptyResourceState>
          No encontramos ese precio. Volvé a la lista para elegir otro registro.
        </EmptyResourceState>
      )}
    </AdminResourceLayout>
  );
}

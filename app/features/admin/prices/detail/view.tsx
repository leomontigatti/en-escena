import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { GuardAlert } from "@/components/shared/guard-alert";
import { readPriceGuard } from "@/lib/prices/guards";
import { useServerActionToast } from "@/lib/shared/toasts";
import type { PriceListItem } from "@/lib/events/bases.server";

import { EmptyResourceState, PriceActions } from "../actions";
import {
  PriceForm,
  PriceFormActions,
  PriceFormPanel,
  usePriceForm,
} from "../form";
import type {
  EventPriceActionData,
  EventPriceDetailLoaderData,
} from "../shared";
import { getPriceDisplayName, getPriceSubmittedValues } from "../view-shared";

export type EventPriceDetailViewProps = {
  actionData?: EventPriceActionData;
  loaderData: EventPriceDetailLoaderData;
  priceId: string;
  initialDeleteDialogOpen?: boolean;
};

export function EventPriceDetailView({
  loaderData,
  actionData,
  priceId,
  initialDeleteDialogOpen = false,
}: EventPriceDetailViewProps) {
  useServerActionToast(actionData);

  const price = loaderData.prices.find((item) => item.id === priceId);
  const guard = price ? readPriceGuard(price) : null;
  const form = usePriceForm({
    amount: price?.amount,
    groupType: price?.groupType,
    name: price?.name,
    paymentDeadline: price?.paymentDeadline,
    scheduleId: price?.scheduleId,
    submittedValues: getPriceSubmittedValues(
      actionData,
      "update-price",
      priceId,
    ),
  });

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title={price ? "Editar precio" : "Precio no encontrado"}
      description={
        price
          ? "Editá el alcance, importe y fecha límite de pago."
          : "No encontramos ese precio dentro del evento activo."
      }
      headerAction={
        price ? (
          <PriceActions
            price={price}
            initialDeleteDialogOpen={initialDeleteDialogOpen}
          />
        ) : null
      }
    >
      {price && guard ? (
        <div className="flex flex-col gap-6">
          <GuardAlert reason={guard.reason} />
          <PriceFormPanel>
            <PriceForm
              form={form}
              formId="update-price-form"
              guard={guard}
              id={price.id}
              intent="update-price"
              schedules={loaderData.schedules}
            />
            <PriceFormActions
              form={form}
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

export function getEventPriceDisplayName(price: PriceListItem | undefined) {
  return price ? getPriceDisplayName(price) : "Precio";
}

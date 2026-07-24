import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { useServerActionToast } from "@/lib/shared/toasts";
import type { PriceListItem } from "@/lib/events/bases.server";

import { EmptyResourceState, PriceActions } from "../actions";
import { PriceForm, PriceFormActions, PriceFormPanel } from "../form";
import type {
  AdministrativeEventPriceActionData,
  AdministrativeEventPriceDetailLoaderData,
} from "../shared";
import { getPriceDisplayName, getPriceSubmittedValues } from "../view-shared";

export type AdministrativeEventPriceDetailViewProps = {
  actionData?: AdministrativeEventPriceActionData;
  loaderData: AdministrativeEventPriceDetailLoaderData;
  priceId: string;
  initialDeleteDialogOpen?: boolean;
};

export function AdministrativeEventPriceDetailView({
  loaderData,
  actionData,
  priceId,
  initialDeleteDialogOpen = false,
}: AdministrativeEventPriceDetailViewProps) {
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
      headerAction={
        price ? (
          <PriceActions
            price={price}
            initialDeleteDialogOpen={initialDeleteDialogOpen}
          />
        ) : null
      }
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

export function getAdministrativeEventPriceDisplayName(
  price: PriceListItem | undefined,
) {
  return price ? getPriceDisplayName(price) : "Precio";
}

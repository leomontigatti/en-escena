import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { useServerActionToast } from "@/lib/shared/toasts";
import type { SeminarPriceListItem } from "@/lib/seminar-prices/repository.server";

import { EmptyResourceState } from "../../prices/actions";
import { SeminarPriceActions } from "../actions";
import {
  SeminarPriceForm,
  SeminarPriceFormActions,
  SeminarPriceFormPanel,
} from "../form";
import type {
  SeminarPriceActionData,
  SeminarPricesListLoaderData,
} from "../shared";
import {
  getSeminarPriceSubmittedValues,
  readSeminarPriceGuard,
} from "../view-shared";

export type SeminarPriceDetailViewProps = {
  actionData?: SeminarPriceActionData;
  loaderData: SeminarPricesListLoaderData;
  seminarPriceId: string;
  initialDeleteDialogOpen?: boolean;
};

export function SeminarPriceDetailView({
  loaderData,
  actionData,
  seminarPriceId,
  initialDeleteDialogOpen = false,
}: SeminarPriceDetailViewProps) {
  useServerActionToast(actionData);

  const seminarPrice = loaderData.seminarPrices.find(
    (item) => item.id === seminarPriceId,
  );

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title={
        seminarPrice ? "Editar precio de seminario" : "Precio no encontrado"
      }
      description={
        seminarPrice
          ? "Editá el tipo de seminario, a quiénes les aplica, el importe y su fecha límite de pago."
          : "No encontramos ese precio dentro del evento activo."
      }
      headerAction={
        seminarPrice ? (
          <SeminarPriceActions
            seminarPrice={seminarPrice}
            initialDeleteDialogOpen={initialDeleteDialogOpen}
          />
        ) : null
      }
    >
      {seminarPrice ? (
        <SeminarPriceFormPanel>
          <SeminarPriceForm
            formId="update-seminar-price-form"
            guard={readSeminarPriceGuard(seminarPrice)}
            id={seminarPrice.id}
            intent="update-seminar-price"
            name={seminarPrice.name}
            kind={seminarPrice.kind}
            forParticipants={seminarPrice.forParticipants}
            amount={seminarPrice.amount}
            paymentDeadline={seminarPrice.paymentDeadline}
            submittedValues={getSeminarPriceSubmittedValues(
              actionData,
              "update-seminar-price",
              seminarPrice.id,
            )}
          />
          <SeminarPriceFormActions
            formId="update-seminar-price-form"
            pendingScope={{
              intent: "update-seminar-price",
              fields: { id: seminarPrice.id },
            }}
          />
        </SeminarPriceFormPanel>
      ) : (
        <EmptyResourceState>
          No encontramos ese precio. Volvé a la lista para elegir otro registro.
        </EmptyResourceState>
      )}
    </AdminResourceLayout>
  );
}

export function getSeminarPriceDisplayName(
  seminarPrice: SeminarPriceListItem | undefined,
) {
  return seminarPrice ? seminarPrice.name : "Precio de seminario";
}

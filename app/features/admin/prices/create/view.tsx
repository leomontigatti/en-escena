import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { useServerActionToast } from "@/lib/shared/toasts";

import {
  PriceForm,
  PriceFormActions,
  PriceFormPanel,
  usePriceForm,
} from "../form";
import type { EventPriceActionData, EventPriceFormLoaderData } from "../shared";
import { getPriceSubmittedValues } from "../view-shared";

const createPriceFormId = "create-price-form";

export type EventPriceCreateViewProps = {
  actionData?: EventPriceActionData;
  loaderData: EventPriceFormLoaderData;
};

export function EventPriceCreateView({
  loaderData,
  actionData,
}: EventPriceCreateViewProps) {
  useServerActionToast(actionData);

  const form = usePriceForm({
    submittedValues: getPriceSubmittedValues(actionData, "create-price"),
  });

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Nuevo precio"
      description="Configurá tipo de grupo, importe y si el precio aplica como base o para un cronograma específico."
    >
      <PriceFormPanel>
        <PriceForm
          form={form}
          formId={createPriceFormId}
          intent="create-price"
          schedules={loaderData.schedules}
        />
        <PriceFormActions
          form={form}
          formId={createPriceFormId}
          pendingScope={{ intent: "create-price" }}
        />
      </PriceFormPanel>
    </AdminResourceLayout>
  );
}

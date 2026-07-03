import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { useServerActionToast } from "@/lib/shared/toasts";

import { PriceForm, PriceFormActions, PriceFormPanel } from "../form";
import type {
  AdministrativeEventPriceActionData,
  AdministrativeEventPriceFormLoaderData,
} from "../shared";
import { getPriceSubmittedValues } from "../view-shared";

const createPriceFormId = "create-price-form";

export type AdministrativeEventPriceCreateViewProps = {
  actionData?: AdministrativeEventPriceActionData;
  loaderData: AdministrativeEventPriceFormLoaderData;
};

export function AdministrativeEventPriceCreateView({
  loaderData,
  actionData,
}: AdministrativeEventPriceCreateViewProps) {
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

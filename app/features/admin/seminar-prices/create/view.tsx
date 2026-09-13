import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { useServerActionToast } from "@/lib/shared/toasts";

import {
  SeminarPriceForm,
  SeminarPriceFormActions,
  SeminarPriceFormPanel,
} from "../form";
import type {
  SeminarPriceActionData,
  SeminarPricesListLoaderData,
} from "../shared";
import { getSeminarPriceSubmittedValues } from "../view-shared";

const createSeminarPriceFormId = "create-seminar-price-form";

export type SeminarPriceCreateViewProps = {
  actionData?: SeminarPriceActionData;
  loaderData: SeminarPricesListLoaderData;
};

export function SeminarPriceCreateView({
  loaderData,
  actionData,
}: SeminarPriceCreateViewProps) {
  useServerActionToast(actionData);

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Nuevo precio de seminario"
      description="Configurá el tipo de seminario, a quiénes les aplica, el importe y su fecha límite de pago."
    >
      <SeminarPriceFormPanel>
        <SeminarPriceForm
          formId={createSeminarPriceFormId}
          intent="create-seminar-price"
          submittedValues={getSeminarPriceSubmittedValues(
            actionData,
            "create-seminar-price",
          )}
        />
        <SeminarPriceFormActions
          formId={createSeminarPriceFormId}
          pendingScope={{ intent: "create-seminar-price" }}
        />
      </SeminarPriceFormPanel>
    </AdminResourceLayout>
  );
}

import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import type { ActionData } from "@/lib/admin/events/bases-action/shared.server";
import { buildCreatePath } from "@/lib/shared/navigation";
import { useServerActionToast } from "@/lib/shared/toasts";

import { PriceListTable } from "../list-table";
import {
  basePath,
  type AdministrativeEventPricesListLoaderData,
} from "../shared";

export type AdministrativeEventPricesListViewProps = {
  loaderData: AdministrativeEventPricesListLoaderData;
  actionData?: ActionData;
};

export function AdministrativeEventPricesListView({
  loaderData,
  actionData,
}: AdministrativeEventPricesListViewProps) {
  useServerActionToast(actionData);

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Precios"
      description="Revisá el alcance y el importe de cada precio del evento activo."
      action={{
        label: "Nuevo precio",
        to: buildCreatePath(basePath, loaderData.selectedEventId),
      }}
    >
      <div className="flex flex-col gap-6">
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

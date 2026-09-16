import { AlertCircleIcon } from "lucide-react";
import { useSearchParams } from "react-router";

import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { AlertStack } from "@/components/shared/alert-stack";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ActionData } from "@/lib/admin/events/bases-action/shared.server";
import { buildCreatePath } from "@/lib/shared/navigation";
import { useServerActionToast } from "@/lib/shared/toasts";

import { SeminarPriceListTable } from "../../seminar-prices/list-table";
import {
  seminarPricesBasePath,
  seminarPricesTabParam,
  seminarPricesTabValue,
} from "../../seminar-prices/shared";
import { readMissingSeminarPriceCellsWarning } from "../../seminar-prices/view-shared";
import { PriceListTable } from "../list-table";
import { basePath, type EventPricesListLoaderData } from "../shared";

const choreographiesTabValue = "coreografias";

export type EventPricesListViewProps = {
  loaderData: EventPricesListLoaderData;
  actionData?: ActionData;
};

export function EventPricesListView({
  loaderData,
  actionData,
}: EventPricesListViewProps) {
  useServerActionToast(actionData);

  // The tab lives in the URL rather than in state, so that `Nuevo precio`, the
  // breadcrumb of a seminar price and the redirect after a delete can all name
  // the list the administrator was reading.
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab =
    searchParams.get(seminarPricesTabParam) === seminarPricesTabValue
      ? seminarPricesTabValue
      : choreographiesTabValue;
  const isSeminarTab = activeTab === seminarPricesTabValue;
  const missingCellsWarning = readMissingSeminarPriceCellsWarning(
    loaderData.seminarPrices,
    loaderData.hasSeminars,
  );

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title="Precios"
      description="Revisá el alcance y el importe de cada precio del evento activo."
      action={{
        label: "Nuevo precio",
        to: buildCreatePath(
          isSeminarTab ? seminarPricesBasePath : basePath,
          loaderData.selectedEventId,
        ),
      }}
    >
      {/* Above the tabs, never inside one: the alerts are about the event's
          price lists as a whole, so they read the same from either tab. */}
      <AlertStack>
        {missingCellsWarning ? (
          <Alert variant="warning">
            <AlertCircleIcon aria-hidden="true" />
            <AlertDescription>{missingCellsWarning}</AlertDescription>
          </Alert>
        ) : null}
      </AlertStack>
      <Tabs
        value={activeTab}
        onValueChange={(value) => {
          setSearchParams(
            (current) => {
              const next = new URLSearchParams(current);

              if (value === seminarPricesTabValue) {
                next.set(seminarPricesTabParam, seminarPricesTabValue);
              } else {
                next.delete(seminarPricesTabParam);
              }

              return next;
            },
            { preventScrollReset: true, replace: true },
          );
        }}
      >
        <TabsList variant="line">
          <TabsTrigger value={choreographiesTabValue}>Coreografías</TabsTrigger>
          <TabsTrigger value={seminarPricesTabValue}>Seminarios</TabsTrigger>
        </TabsList>
        <TabsContent value={choreographiesTabValue} className="pt-2">
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
        </TabsContent>
        <TabsContent value={seminarPricesTabValue} className="pt-2">
          {loaderData.seminarPrices.length > 0 ? (
            <SeminarPriceListTable
              seminarPrices={loaderData.seminarPrices}
              selectedEventId={loaderData.selectedEventId}
            />
          ) : (
            <AdminEmptyState
              title="Todavía no hay precios de seminario creados."
              description="Creá los precios que comparten todos los seminarios del evento activo."
            />
          )}
        </TabsContent>
      </Tabs>
    </AdminResourceLayout>
  );
}

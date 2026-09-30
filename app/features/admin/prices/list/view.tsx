import { TriangleAlert } from "lucide-react";

import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { AlertStack } from "@/components/shared/alert-stack";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ActionData } from "@/lib/admin/events/bases-action/shared.server";
import { buildCreatePath } from "@/lib/shared/navigation";
import { useServerActionToast } from "@/lib/shared/toasts";
import { kindTabParam, useUrlTab } from "@/lib/shared/url-tab";
import { describeEmptyList } from "@/lib/list-query/list-query";

import { SeminarPriceListTable } from "../../seminar-prices/list-table";
import {
  seminarPricesBasePath,
  seminarPricesTabValue,
} from "../../seminar-prices/shared";
import { readMissingSeminarPriceCellsWarning } from "../../seminar-prices/view-shared";
import { PriceListTable } from "../list-table";
import { basePath, type EventPricesListLoaderData } from "../shared";

const emptyPriceList = describeEmptyList("precios", "search-and-filters");
const emptySeminarPriceList = describeEmptyList(
  "precios de seminario",
  "search-and-filters",
);

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
  const tab = useUrlTab({
    defaultValue: choreographiesTabValue,
    param: kindTabParam,
    values: [choreographiesTabValue, seminarPricesTabValue],
  });
  const isSeminarTab = tab.value === seminarPricesTabValue;
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
            <TriangleAlert aria-hidden="true" />
            <AlertTitle>Precios de seminario incompletos</AlertTitle>
            <AlertDescription>{missingCellsWarning}</AlertDescription>
          </Alert>
        ) : null}
      </AlertStack>
      <Tabs value={tab.value} onValueChange={tab.onValueChange}>
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
              title={emptyPriceList.nothingYet}
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
              title={emptySeminarPriceList.nothingYet}
              description="Creá los precios que comparten todos los seminarios del evento activo."
            />
          )}
        </TabsContent>
      </Tabs>
    </AdminResourceLayout>
  );
}

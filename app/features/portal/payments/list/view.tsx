import { HandCoins } from "lucide-react";

import { PortalEmptyState, PortalListPage } from "@/components/portal/ui";
import { ClientDataTable } from "@/components/shared/data-table";
import type { loadPortalAcademyPayments } from "@/features/portal/payments/list/server";
import { PaymentInstructionsAlert } from "@/components/shared/payment-instructions-alert";
import {
  ownerPaymentColumns,
  ownerPaymentFacetedFilterIds,
  ownerPaymentFacetedFilters,
} from "@/lib/finances/owner-payment-columns";

type PortalAcademyPaymentsLoaderData = Awaited<
  ReturnType<typeof loadPortalAcademyPayments>
>;

export const portalPaymentFacetedFilterIds = ownerPaymentFacetedFilterIds;

export function PortalAcademyPaymentsRouteView({
  loaderData,
}: {
  loaderData: PortalAcademyPaymentsLoaderData;
}) {
  if (!loaderData.activeEvent) {
    return (
      <PortalListPage
        titleId="payments-title"
        title="Pagos"
        description="Consultá los pagos que administración registró para tu academia."
      >
        <PortalEmptyState
          title="Todavía no hay un evento activo"
          description="Cuando administración active un evento, vas a poder consultar acá los pagos registrados."
          icon={<HandCoins aria-hidden="true" />}
        />
      </PortalListPage>
    );
  }

  // One alert for both active-event branches, and the first child of
  // `PortalListPage` in each: the page's own `flex flex-col gap-6` separates it
  // from the subtitle and from what follows.
  const instructionsAlert = loaderData.paymentInstructions ? (
    <PaymentInstructionsAlert instructions={loaderData.paymentInstructions} />
  ) : null;

  if (loaderData.payments.length === 0) {
    return (
      <PortalListPage
        titleId="payments-title"
        title="Pagos"
        description="Consultá los pagos que administración registró para tu academia."
      >
        {instructionsAlert}
        <PortalEmptyState
          title="Todavía no hay pagos registrados"
          description="Cuando administración registre un pago de tu academia en este evento, lo vas a poder revisar acá."
          icon={<HandCoins aria-hidden="true" />}
        />
      </PortalListPage>
    );
  }

  return (
    <PortalListPage
      titleId="payments-title"
      title="Pagos"
      description="Consultá los pagos que administración registró para tu academia."
    >
      {instructionsAlert}
      <ClientDataTable
        rows={loaderData.payments}
        columns={ownerPaymentColumns}
        facetedFilters={ownerPaymentFacetedFilters}
        getRowKey={(row) => row.id}
        searchPlaceholder="Buscar por referencia o número"
        initialSort={{
          columnId: "paymentDate",
          direction: "desc",
        }}
        emptyMessage="No hay pagos para mostrar."
      />
    </PortalListPage>
  );
}

import { HandCoins } from "lucide-react";

import { PortalEmptyState, PortalListPage } from "@/components/portal/ui";
import { ClientDataTable } from "@/components/shared/data-table";
import type { loadPortalAcademyPayments } from "@/features/portal/payments/list/server";
import { PaymentInstructionsAlert } from "@/components/shared/payment-instructions-alert";
import {
  OwnerMovementCard,
  ownerMovementColumns,
  ownerMovementFacetedFilterIds,
  ownerMovementFacetedFilters,
} from "@/lib/finances/owner-movement-columns";

type PortalAcademyPaymentsLoaderData = Awaited<
  ReturnType<typeof loadPortalAcademyPayments>
>;

export const portalPaymentFacetedFilterIds = ownerMovementFacetedFilterIds;

export function PortalAcademyPaymentsRouteView({
  loaderData,
}: {
  loaderData: PortalAcademyPaymentsLoaderData;
}) {
  if (!loaderData.activeEvent) {
    return (
      <PortalListPage
        titleId="payments-title"
        title="Movimientos"
        description="Consultá los pagos y reembolsos que administración registró para tu academia."
      >
        <PortalEmptyState
          title="Todavía no hay un evento activo"
          description="Cuando administración active un evento, vas a poder consultar acá los pagos y reembolsos registrados."
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

  if (loaderData.movements.length === 0) {
    return (
      <PortalListPage
        titleId="payments-title"
        title="Movimientos"
        description="Consultá los pagos y reembolsos que administración registró para tu academia."
      >
        {instructionsAlert}
        <PortalEmptyState
          title="Todavía no hay movimientos registrados"
          description="Cuando administración registre un pago o un reembolso de tu academia en este evento, lo vas a poder revisar acá."
          icon={<HandCoins aria-hidden="true" />}
        />
      </PortalListPage>
    );
  }

  return (
    <PortalListPage
      titleId="payments-title"
      title="Movimientos"
      description="Consultá los pagos y reembolsos que administración registró para tu academia."
    >
      {instructionsAlert}
      <ClientDataTable
        rows={loaderData.movements}
        columns={ownerMovementColumns}
        facetedFilters={ownerMovementFacetedFilters}
        getRowKey={(row) => `${row.kind}:${row.id}`}
        renderCard={(row) => <OwnerMovementCard row={row} />}
        searchPlaceholder="Buscar por referencia o número"
        initialSort={{
          columnId: "date",
          direction: "desc",
        }}
        emptyMessage="No hay movimientos para mostrar."
      />
    </PortalListPage>
  );
}

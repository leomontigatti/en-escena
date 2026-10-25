import { HandCoins } from "lucide-react";

import { PortalEmptyState, PortalListPage } from "@/components/portal/ui";
import { ClientDataTable } from "@/components/shared/data-table";
import { PaymentInstructionsAlert } from "@/components/shared/payment-instructions-alert";
import {
  OwnerMovementCard,
  ownerMovementColumns,
  ownerMovementFacetedFilters,
} from "@/lib/finances/owner-movement-columns";

import type { loadIndividualPayments } from "./server";

type IndividualPaymentsLoaderData = Awaited<
  ReturnType<typeof loadIndividualPayments>
>;

const description =
  "Consultá los pagos y reembolsos que administración registró para vos.";

/**
 * `Movimientos` (ADR-0019): how to pay, then the payments and refunds administration recorded. It is
 * read-only, as the portal's `Movimientos` is: administration records and allocates.
 */
export function IndividualPaymentsView({
  loaderData,
}: {
  loaderData: IndividualPaymentsLoaderData;
}) {
  return (
    <PortalListPage
      titleId="individual-payments-title"
      title="Movimientos"
      description={description}
    >
      {loaderData.activeEvent ? (
        <>
          {loaderData.paymentInstructions ? (
            <PaymentInstructionsAlert
              instructions={loaderData.paymentInstructions}
            />
          ) : null}
          <ClientDataTable
            rows={loaderData.movements}
            columns={ownerMovementColumns}
            facetedFilters={ownerMovementFacetedFilters}
            getRowKey={(row) => `${row.kind}:${row.id}`}
            renderCard={(row) => <OwnerMovementCard row={row} />}
            searchPlaceholder="Buscar por referencia o número"
            initialSort={{ columnId: "date", direction: "desc" }}
            emptyMessage="Todavía no hay movimientos registrados."
          />
        </>
      ) : (
        <PortalEmptyState
          title="No hay un evento activo"
          description="Cuando administración active un evento, vas a poder consultar acá tus pagos y reembolsos."
          icon={<HandCoins aria-hidden="true" />}
        />
      )}
    </PortalListPage>
  );
}

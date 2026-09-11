// PROTOTYPE — throwaway, lives only on branch `prototype/890-seminar-money-admin`.
//
// Part of the admin seminar-money prototype for wayfinder ticket #890 (map #884):
// the (seminar, academy) financial detail.
import { Info } from "lucide-react";
import { useState } from "react";
import { AdminResourceLayout } from "@/components/admin/resource-layout";
import {
  ClientDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { EmissionDialog } from "@/features/admin/finances/academy-choreographies/choreography-detail/comprobante-emission";
import { formatDate } from "@/features/admin/schedules/view-shared";
import {
  inscriptionFinanceColumns,
  inscriptionFinanceFacetedFilters,
  type InscriptionFinanceRow,
} from "@/lib/finances/inscription-finance-columns";
import { OperationalFinanceMetrics } from "@/lib/finances/operational-finance-metrics";
import type { OperationalFinanceAmount } from "@/lib/finances/operational-summary";
import type {
  PrototypeSeminar,
  SeminarInscriptionFigures,
  SeminarPriceRow,
} from "@/features/admin/seminars/prototype/seminar-money-fixtures.prototype";
import { SeminarMoneyDialog } from "./seminar-money-dialog.prototype";

type Record = (entry: string) => void;

type SeminarFinanceRow = InscriptionFinanceRow & {
  inscription: SeminarInscriptionFigures;
};

/**
 * Twin of the choreography financial detail for one academy's inscriptions in
 * one seminar (#894). The `Precio` badge shows the effective row's name, as the
 * choreography badge shows `price.name` (review on #890, name amended on #904);
 * the money dialog carries the `Participando` readout beside the price picker
 * (#887, #904). No "no prices" alert: a seminar only opens once both
 * deadline-less `Común` rows exist, and they cannot go while inscriptions do
 * (#904).
 */
export function SeminarFinanceDetailPrototype({
  availableBalanceAmount,
  inscriptions,
  isFull,
  prices,
  record,
  seminar,
}: {
  availableBalanceAmount: number;
  inscriptions: SeminarInscriptionFigures[];
  isFull: boolean;
  prices: SeminarPriceRow[];
  record: Record;
  seminar: PrototypeSeminar;
}) {
  const [openInscriptionId, setOpenInscriptionId] = useState<string | null>(
    null,
  );
  const [isEmitting, setIsEmitting] = useState(false);
  const rows: SeminarFinanceRow[] = inscriptions.map((inscription) => ({
    allocatedAmount: inscription.allocatedAmount,
    anomalies: [],
    depositAmount: inscription.depositAmount,
    effectivePrice: inscription.price ? { name: inscription.price.name } : null,
    financialStatus: inscription.financialStatus,
    inscription,
    owedBalanceAmount: inscription.owedBalanceAmount,
    totalAmount: inscription.totalAmount,
    withdrawn: inscription.withdrawn,
  }));
  const columns: DataTableColumn<SeminarFinanceRow>[] = [
    {
      id: "inscripto",
      header: "Inscripto",
      className: "font-medium",
      cell: (row) => (
        <Button
          type="button"
          variant="link"
          className="h-auto p-0 text-left font-medium"
          onClick={() => setOpenInscriptionId(row.inscription.id)}
        >
          {row.inscription.fullName}
        </Button>
      ),
      filterValue: (row) => row.inscription.fullName,
      sortValue: (row) => row.inscription.fullName,
    },
    {
      id: "personKind",
      header: "Tipo",
      cell: (row) => (
        <Badge variant="secondary">
          {row.inscription.personKind === "professor" ? "Profesor" : "Bailarín"}
        </Badge>
      ),
    },
    ...inscriptionFinanceColumns,
  ];
  const openInscription =
    inscriptions.find((inscription) => inscription.id === openInscriptionId) ??
    null;
  const unitFigures = {
    depositAmount: sumFigures(inscriptions.map((row) => row.depositAmount)),
    owedBalanceAmount: sumFigures(
      inscriptions.map((row) => row.owedBalanceAmount),
    ),
    owedDepositAmount: sumFigures(
      inscriptions.map((row) => row.owedDepositAmount),
    ),
    totalAmount: sumFigures(inscriptions.map((row) => row.totalAmount)),
  };
  const billableAmount = inscriptions.reduce(
    (sum, row) => sum + row.allocatedAmount,
    0,
  );

  return (
    <AdminResourceLayout
      selectedEventId="evento-prototipo"
      title={`Seminario ${seminar.instructorName}, ${formatDate(seminar.scheduledDate)}`}
      description="Revisá y/o modificá las asignaciones de cada inscripción desde la lista."
      headerAction={
        <>
          <ResourceActionsMenu contentClassName="w-48">
            <DropdownMenuItem
              disabled={billableAmount === 0}
              onSelect={(event) => {
                event.preventDefault();
                setIsEmitting(true);
              }}
            >
              Emitir factura
            </DropdownMenuItem>
          </ResourceActionsMenu>
          {isEmitting ? (
            <EmissionDialog
              billableAmount={billableAmount}
              open
              onOpenChange={setIsEmitting}
            />
          ) : null}
        </>
      }
    >
      <div className="flex flex-col gap-6">
        {isFull ? (
          <Alert>
            <Info aria-hidden="true" />
            <AlertDescription>
              No quedan lugares en el seminario: las inscripciones con seña
              pendiente no pueden cubrirla hasta que se libere uno.
            </AlertDescription>
          </Alert>
        ) : null}

        <OperationalFinanceMetrics
          availableBalanceAmount={availableBalanceAmount}
          depositAmount={unitFigures.depositAmount}
          owedBalanceAmount={unitFigures.owedBalanceAmount}
          owedDepositAmount={unitFigures.owedDepositAmount}
          totalAmount={unitFigures.totalAmount}
        />

        <section aria-label="Inscripciones">
          <ClientDataTable
            rows={rows}
            columns={columns}
            facetedFilters={inscriptionFinanceFacetedFilters}
            getRowKey={(row) => row.inscription.id}
            searchPlaceholder="Buscar inscripción por nombre"
            textFilterColumnId="inscripto"
            emptyMessage="No hay inscripciones para mostrar."
          />
        </section>
      </div>

      {openInscription ? (
        <SeminarMoneyDialog
          key={openInscription.id}
          availableBalanceAmount={availableBalanceAmount}
          inscription={openInscription}
          isFull={isFull}
          onOpenChange={(open) => (open ? null : setOpenInscriptionId(null))}
          prices={prices}
          rate={seminar.requiredDepositPercentage}
          record={record}
          seminarKind={seminar.kind}
        />
      ) : null}
    </AdminResourceLayout>
  );
}

function sumFigures(values: Array<number | null>): OperationalFinanceAmount {
  const missingPriceCount = values.filter((value) => value === null).length;
  const amount = values.reduce<number>((sum, value) => sum + (value ?? 0), 0);

  return missingPriceCount > 0
    ? { amount, missingPriceCount, status: "incomplete" }
    : { amount, status: "complete" };
}

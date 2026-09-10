// PROTOTYPE — throwaway, lives only on branch `prototype/890-seminar-money-admin`.
//
// Part of the admin seminar-money prototype for wayfinder ticket #890 (map #884):
// the (seminar, academy) financial detail variants.
import { AlertTriangle, Info } from "lucide-react";
import { useState } from "react";
import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { AlertStack } from "@/components/shared/alert-stack";
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
import {
  formatKindLabel,
  formatTierLabel,
  type PrototypeSeminar,
  type SeminarInscriptionFigures,
} from "@/features/admin/seminars/prototype/seminar-money-fixtures.prototype";
import { SeminarMoneyDialog } from "./seminar-money-dialog.prototype";

const selectedEventId = "evento-prototipo";

type Record = (entry: string) => void;

function formatSeminarTitle(
  seminar: Pick<PrototypeSeminar, "instructorName" | "scheduledDate">,
) {
  return `Seminario ${seminar.instructorName}, ${formatDate(seminar.scheduledDate)}`;
}

type SeminarFinanceRow = InscriptionFinanceRow & {
  inscription: SeminarInscriptionFigures;
};

/**
 * The table's reading of the amount kind is what the two variants disagree on;
 * the dialog is the same in both and always carries the `Precio aplicado`
 * readout beside the tier picker (#887).
 *
 * A — `Precio` names the tier (`Hasta 20/09/2026`) and a `Precio aplicado`
 * column beside it says which of the tier's two amounts applies.
 *
 * B — no extra column: the kind rides inside the `Precio` badge
 * (`Hasta 20/09/2026 · participante`).
 */
export function SeminarFinanceDetailPrototype({
  availableBalanceAmount,
  inscriptions,
  isFull,
  record,
  seminar,
  variant,
}: {
  availableBalanceAmount: number;
  inscriptions: SeminarInscriptionFigures[];
  isFull: boolean;
  record: Record;
  seminar: PrototypeSeminar;
  variant: string;
}) {
  const [openInscriptionId, setOpenInscriptionId] = useState<string | null>(
    null,
  );
  const [isEmitting, setIsEmitting] = useState(false);
  const hasTiers = seminar.tiers.length > 0;
  const rows: SeminarFinanceRow[] = inscriptions.map((inscription) => ({
    allocatedAmount: inscription.allocatedAmount,
    anomalies: [],
    depositAmount: inscription.depositAmount,
    effectivePrice: inscription.tier
      ? {
          name:
            variant === "B"
              ? `${formatTierLabel(inscription.tier)} · ${formatKindLabel(inscription.kind).toLowerCase()}`
              : formatTierLabel(inscription.tier),
        }
      : null,
    financialStatus: inscription.financialStatus,
    inscription,
    owedBalanceAmount: inscription.owedBalanceAmount,
    totalAmount: inscription.totalAmount,
    withdrawn: inscription.withdrawn,
  }));
  const [priceColumn, ...moneyColumns] = inscriptionFinanceColumns;
  const nameColumns: DataTableColumn<SeminarFinanceRow>[] = [
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
  ];
  const appliedKindColumn: DataTableColumn<SeminarFinanceRow> = {
    id: "appliedKind",
    header: "Precio aplicado",
    className: "text-muted-foreground",
    cell: (row) =>
      row.inscription.tier ? formatKindLabel(row.inscription.kind) : "—",
  };
  const columns: DataTableColumn<SeminarFinanceRow>[] =
    variant === "B" || !priceColumn
      ? [...nameColumns, ...inscriptionFinanceColumns]
      : [...nameColumns, priceColumn, appliedKindColumn, ...moneyColumns];
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
      selectedEventId={selectedEventId}
      title={formatSeminarTitle(seminar)}
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
        {!hasTiers || isFull ? (
          <AlertStack>
            {!hasTiers ? (
              <Alert variant="warning">
                <AlertTriangle aria-hidden="true" />
                <AlertDescription>
                  Este seminario no tiene precios configurados: no se puede
                  calcular lo que adeuda ni cobrarlo.
                </AlertDescription>
              </Alert>
            ) : null}
            {isFull ? (
              <Alert>
                <Info aria-hidden="true" />
                <AlertDescription>
                  No quedan lugares en el seminario: las inscripciones con seña
                  pendiente no pueden cubrirla hasta que se libere uno.
                </AlertDescription>
              </Alert>
            ) : null}
          </AlertStack>
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
          rate={seminar.requiredDepositPercentage}
          record={record}
          tiers={seminar.tiers}
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

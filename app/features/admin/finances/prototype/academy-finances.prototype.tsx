// PROTOTYPE — throwaway, lives only on branch `prototype/890-seminar-money-admin`.
//
// Part of the admin seminar-money prototype for wayfinder ticket #890 (map #884):
// the academy financial list variants.
import { useState } from "react";
import { toast } from "sonner";
import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { financePresetLabels } from "@/features/admin/finances/academy-choreographies/presets";
import { OperationalFinanceMetrics } from "@/lib/finances/operational-finance-metrics";
import type { OperationalFinanceAmount } from "@/lib/finances/operational-summary";
import {
  type ChoreographyUnitRow,
  type SeminarUnitRow,
} from "@/features/admin/seminars/prototype/seminar-money-fixtures.prototype";
import {
  ChoreographyUnitsTable,
  SeminarUnitsTable,
  MixedUnitsTable,
} from "./academy-finance-tables.prototype";

const selectedEventId = "evento-prototipo";

type AcademySummary = {
  availableBalanceAmount: number;
  depositAmount: OperationalFinanceAmount;
  owedBalanceAmount: OperationalFinanceAmount;
  owedDepositAmount: OperationalFinanceAmount;
  totalAmount: OperationalFinanceAmount;
};

/**
 * A — `Coreografías` and `Seminarios` as line tabs under the five figures, each
 * its own table. The collections act on the choreography tab only.
 *
 * B — one table for both kinds, with `Tipo` as a column and a facet. A seminar
 * row can be selected too, which is exactly what makes the collections refuse.
 *
 * C — two stacked sections, each with a heading and its own table; only the
 * choreography table is selectable.
 */
export function AcademyFinancesPrototype({
  academyName,
  buildSeminarHref,
  choreographyRows,
  seminarRows,
  summary,
  variant,
}: {
  academyName: string;
  buildSeminarHref: () => string;
  choreographyRows: ChoreographyUnitRow[];
  seminarRows: SeminarUnitRow[];
  summary: AcademySummary;
  variant: string;
}) {
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const selectsSeminar = selectedRowIds.some((id) =>
    seminarRows.some((row) => row.id === id),
  );
  const canCollect = selectedRowIds.length > 0 && !selectsSeminar;

  return (
    <AdminResourceLayout
      selectedEventId={selectedEventId}
      title={academyName}
      description="Lista financiera de las coreografías y los seminarios de esta academia."
      headerAction={
        <ResourceActionsMenu contentClassName="w-48">
          {(["deposit", "balance"] as const).map((stage) => (
            <DropdownMenuItem
              key={stage}
              disabled={!canCollect}
              onSelect={(event) => {
                event.preventDefault();
                toast.success(
                  `Prototipo: ${financePresetLabels[stage]} sobre ${selectedRowIds.length} coreografías.`,
                );
              }}
            >
              {financePresetLabels[stage]}
            </DropdownMenuItem>
          ))}
        </ResourceActionsMenu>
      }
    >
      <div className="flex flex-col gap-6">
        <OperationalFinanceMetrics
          availableBalanceAmount={summary.availableBalanceAmount}
          depositAmount={summary.depositAmount}
          owedBalanceAmount={summary.owedBalanceAmount}
          owedDepositAmount={summary.owedDepositAmount}
          totalAmount={summary.totalAmount}
        />

        {variant === "B" ? (
          <MixedUnitsTable
            buildSeminarHref={buildSeminarHref}
            choreographyRows={choreographyRows}
            onSelectedRowIdsChange={setSelectedRowIds}
            selectedRowIds={selectedRowIds}
            selectsSeminar={selectsSeminar}
            seminarRows={seminarRows}
          />
        ) : variant === "C" ? (
          <>
            <section
              aria-labelledby="prototipo-coreografias"
              className="flex flex-col gap-3"
            >
              <h2 id="prototipo-coreografias" className="text-base font-medium">
                Coreografías
              </h2>
              <ChoreographyUnitsTable
                onSelectedRowIdsChange={setSelectedRowIds}
                rows={choreographyRows}
                selectedRowIds={selectedRowIds}
              />
            </section>
            <section
              aria-labelledby="prototipo-seminarios"
              className="flex flex-col gap-3"
            >
              <h2 id="prototipo-seminarios" className="text-base font-medium">
                Seminarios
              </h2>
              {/* Two tables on one page would share the URL's search and page
                  parameters, so the second one shows neither. */}
              <SeminarUnitsTable
                buildSeminarHref={buildSeminarHref}
                hideControls
                rows={seminarRows}
              />
            </section>
          </>
        ) : (
          <Tabs
            defaultValue="coreografias"
            onValueChange={() => setSelectedRowIds([])}
          >
            <TabsList variant="line">
              <TabsTrigger value="coreografias">Coreografías</TabsTrigger>
              <TabsTrigger value="seminarios">Seminarios</TabsTrigger>
            </TabsList>
            <TabsContent value="coreografias" className="pt-2">
              <ChoreographyUnitsTable
                onSelectedRowIdsChange={setSelectedRowIds}
                rows={choreographyRows}
                selectedRowIds={selectedRowIds}
              />
            </TabsContent>
            <TabsContent value="seminarios" className="pt-2">
              <SeminarUnitsTable
                buildSeminarHref={buildSeminarHref}
                rows={seminarRows}
              />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AdminResourceLayout>
  );
}

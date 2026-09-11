// PROTOTYPE — throwaway, lives only on branch `prototype/890-seminar-money-admin`.
//
// Part of the admin seminar-money prototype for wayfinder ticket #890 (map #884):
// the academy financial list, with a tab per kind.
import { useState } from "react";
import { toast } from "sonner";
import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { financePresetLabels } from "@/features/admin/finances/academy-choreographies/presets";
import { OperationalFinanceMetrics } from "@/lib/finances/operational-finance-metrics";
import { sumOperationalFinanceAmounts } from "@/lib/finances/operational-summary";
import { resolveSelectedOperationalTotals } from "@/lib/finances/selected-operational-totals";
import {
  type ChoreographyUnitRow,
  type SeminarUnitRow,
} from "@/features/admin/seminars/prototype/seminar-money-fixtures.prototype";
import {
  ChoreographyUnitsTable,
  SeminarUnitsTable,
} from "./academy-finance-tables.prototype";

const selectedEventId = "evento-prototipo";

type FinanceTab = "coreografias" | "seminarios";

/**
 * `Coreografías` and `Seminarios` as line tabs under the five figures, each tab
 * its own selectable table. The figures follow the tab: the thresholds and the
 * owed amounts are the active kind's, and the owed pair narrows further to the
 * selection, exactly as the choreography list does today. `Saldo disponible`
 * never moves — unallocated money belongs to neither kind.
 *
 * Each tab keeps its own selection, so switching back does not lose it. The
 * collections act on the choreography selection only: there is no preset over
 * seminar money (#888), so on the seminar tab they stay disabled.
 */
export function AcademyFinancesPrototype({
  academyName,
  availableBalanceAmount,
  buildSeminarHref,
  choreographyRows,
  seminarRows,
}: {
  academyName: string;
  availableBalanceAmount: number;
  buildSeminarHref: () => string;
  choreographyRows: ChoreographyUnitRow[];
  seminarRows: SeminarUnitRow[];
}) {
  const [tab, setTab] = useState<FinanceTab>("coreografias");
  const [choreographySelection, setChoreographySelection] = useState<string[]>(
    [],
  );
  const [seminarSelection, setSeminarSelection] = useState<string[]>([]);
  const activeRows: Array<ChoreographyUnitRow | SeminarUnitRow> =
    tab === "coreografias" ? choreographyRows : seminarRows;
  const activeSelection =
    tab === "coreografias" ? choreographySelection : seminarSelection;
  const kindSummary = {
    depositAmount: sumOperationalFinanceAmounts(
      activeRows.map((row) => row.depositAmount),
    ),
    owedBalanceAmount: sumOperationalFinanceAmounts(
      activeRows.map((row) => row.owedBalanceAmount),
    ),
    owedDepositAmount: sumOperationalFinanceAmounts(
      activeRows.map((row) => row.owedDepositAmount),
    ),
    totalAmount: sumOperationalFinanceAmounts(
      activeRows.map((row) => row.totalAmount),
    ),
  };
  const { owedBalanceAmount, owedDepositAmount } =
    resolveSelectedOperationalTotals({
      rows: activeRows,
      selectedRowIds: activeSelection,
      summary: kindSummary,
    });
  const canCollect = tab === "coreografias" && choreographySelection.length > 0;

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
                  `Prototipo: ${financePresetLabels[stage]} sobre ${choreographySelection.length} coreografías.`,
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
          availableBalanceAmount={availableBalanceAmount}
          depositAmount={kindSummary.depositAmount}
          owedBalanceAmount={owedBalanceAmount}
          owedDepositAmount={owedDepositAmount}
          totalAmount={kindSummary.totalAmount}
        />

        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as FinanceTab)}
        >
          <TabsList variant="line">
            <TabsTrigger value="coreografias">Coreografías</TabsTrigger>
            <TabsTrigger value="seminarios">Seminarios</TabsTrigger>
          </TabsList>
          <TabsContent value="coreografias" className="pt-2">
            <ChoreographyUnitsTable
              onSelectedRowIdsChange={setChoreographySelection}
              rows={choreographyRows}
              selectedRowIds={choreographySelection}
            />
          </TabsContent>
          <TabsContent value="seminarios" className="pt-2">
            <SeminarUnitsTable
              buildSeminarHref={buildSeminarHref}
              onSelectedRowIdsChange={setSeminarSelection}
              rows={seminarRows}
              selectedRowIds={seminarSelection}
            />
          </TabsContent>
        </Tabs>
      </div>
    </AdminResourceLayout>
  );
}

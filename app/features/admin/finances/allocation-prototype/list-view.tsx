/**
 * PROTOTIPO DESCARTABLE — ticket #550 del mapa #547. Vista 1 de 2.
 *
 * La lista financiera de coreografías de una academia
 * (`/administracion/finanzas/:academyId` en la app real). Ya no hay variantes:
 * quedó la A, con las correcciones pedidas al reaccionar al prototipo.
 *
 * `Pagar seña` y `Pagar saldo` son **acciones de lista** (#551) y viven donde
 * viven todas las acciones del repo: el `ResourceActionsMenu` del header,
 * deshabilitadas hasta que haya al menos una coreografía elegida.
 *
 * Excepción declarada: no hay loader, ni `action`, ni validación de servidor.
 * `ServerDataTable` navega con `q`, `orden` y `page`, y acá se resuelven en
 * memoria porque los datos son una fixture: la forma de la tabla sigue abierta
 * en #549.
 */
import { useState } from "react";
import { useSearchParams } from "react-router";

import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { MetricCard } from "@/components/shared/metric-card";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { ServerDataTable } from "@/components/shared/server-data-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { compareSortValues } from "@/components/shared/data-table-helpers";

import { formatAmount } from "../formatters";
import { buildChoreographyColumns } from "./list-table";
import { PresetDialog } from "./preset-dialog";
import { presetLabels, type PresetKind } from "./presets";
import type { ChoreographyReading } from "./rollup";
import { StateReadout } from "./state-readout";
import { usePrototype } from "./store";

const pageSize = 10;

export function AllocationListPrototypeView() {
  const [searchParams] = useSearchParams();
  const prototype = usePrototype();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [preset, setPreset] = useState<PresetKind | null>(null);

  const selected = prototype.choreographies.filter((row) =>
    selectedIds.includes(row.id),
  );
  const rows = readRows(prototype.choreographies, searchParams);
  const currentPage = Number(searchParams.get("page") ?? "1");
  const pageRows = rows.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  // Las dos figuras de deuda se reencuadran sobre lo elegido: sin selección son
  // las de la academia, con selección son la suma de lo elegido. Es la lectura
  // que hace falta para decidir un preset sin salir de la lista.
  const scoped = selected.length > 0;
  const owedDepositAmount = scoped
    ? sumBy(selected, (row) => row.owedDepositAmount)
    : prototype.academy.owedDepositAmount;
  const owedBalanceAmount = scoped
    ? sumBy(selected, (row) => row.owedBalanceAmount)
    : prototype.academy.owedBalanceAmount;

  return (
    <AdminResourceLayout
      title="Prototipo · lista financiera"
      description="Danza Viva — prototipo descartable del ticket #550. Datos en memoria, nada se guarda."
      requireSelectedEvent={false}
      headerAction={
        <ResourceActionsMenu>
          <DropdownMenuItem
            disabled={selected.length === 0}
            onSelect={(event) => {
              event.preventDefault();
              setPreset("deposit");
            }}
          >
            {presetLabels.deposit}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={selected.length === 0}
            onSelect={(event) => {
              event.preventDefault();
              setPreset("balance");
            }}
          >
            {presetLabels.balance}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              setSelectedIds(
                selectedIds.length === prototype.choreographies.length
                  ? []
                  : prototype.choreographies.map((row) => row.id),
              );
            }}
          >
            {selectedIds.length === prototype.choreographies.length
              ? "Deseleccionar todo"
              : "Seleccionar todo"}
          </DropdownMenuItem>
        </ResourceActionsMenu>
      }
    >
      <div className="flex flex-col gap-6 pb-24">
        <Alert>
          <AlertTitle>Prototipo, no funcionalidad</AlertTitle>
          <AlertDescription>
            Vista 1 de 2. Los presets están en el menú de acciones del header y
            se habilitan al elegir coreografías. El nombre lleva al detalle.
          </AlertDescription>
        </Alert>

        <section className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
          <MetricCard
            title="Seña"
            value={formatAmount(prototype.academy.depositAmount)}
          />
          <MetricCard
            title="Seña adeudada"
            value={formatAmount(owedDepositAmount)}
            slot={scoped ? <ScopeBadge count={selected.length} /> : undefined}
          />
          <MetricCard
            title="Total"
            value={formatAmount(prototype.academy.totalAmount)}
          />
          <MetricCard
            title="Saldo adeudado"
            value={formatAmount(owedBalanceAmount)}
            slot={scoped ? <ScopeBadge count={selected.length} /> : undefined}
          />
          <MetricCard
            title="Saldo disponible"
            value={formatAmount(prototype.academy.availableBalanceAmount)}
          />
        </section>

        <ServerDataTable
          rows={pageRows}
          columns={buildChoreographyColumns({
            selectedIds,
            onToggle: (id) =>
              setSelectedIds((current) =>
                current.includes(id)
                  ? current.filter((value) => value !== id)
                  : [...current, id],
              ),
          })}
          getRowKey={(row) => row.id}
          searchPlaceholder="Buscar coreografía por nombre"
          initialSearchValue={searchParams.get("q") ?? ""}
          currentPage={currentPage}
          totalPages={Math.max(1, Math.ceil(rows.length / pageSize))}
          totalRows={prototype.choreographies.length}
          emptyMessage="No hay coreografías para mostrar."
        />

        <p className="text-xs text-muted-foreground">
          * Figura tentativa: la coreografía tiene inscripciones sin precio
          elegido.
        </p>

        <StateReadout />
      </div>

      {preset !== null ? (
        <PresetDialog
          kind={preset}
          targets={selected.flatMap((row) => row.inscriptions)}
          payments={prototype.payments}
          open
          onClose={() => setPreset(null)}
          onApply={prototype.onApplyUpserts}
        />
      ) : null}
    </AdminResourceLayout>
  );
}

function ScopeBadge({ count }: { count: number }) {
  return <Badge variant="info">{count} elegidas</Badge>;
}

/** Buscar y ordenar, resueltos en memoria sobre lo que `ServerDataTable` puso en la URL. */
function readRows(
  choreographies: ChoreographyReading[],
  searchParams: URLSearchParams,
) {
  const query = (searchParams.get("q") ?? "").trim().toLowerCase();
  const rows =
    query === ""
      ? [...choreographies]
      : choreographies.filter((row) => row.name.toLowerCase().includes(query));

  const [columnId, direction] = (searchParams.get("orden") ?? "name:asc").split(
    ":",
  );
  const readSortValue = sortValues[columnId] ?? sortValues.name;

  return rows.sort((left, right) => {
    const comparison = compareSortValues(
      readSortValue(left),
      readSortValue(right),
    );
    return direction === "desc" ? -comparison : comparison;
  });
}

const sortValues: Record<
  string,
  (row: ChoreographyReading) => string | number
> = {
  name: (row) => row.name,
  groupType: (row) => row.groupType,
  depositAmount: (row) => row.depositAmount,
  totalAmount: (row) => row.totalAmount,
  owedBalanceAmount: (row) => row.owedBalanceAmount,
  status: (row) => row.status ?? "",
};

function sumBy<T>(rows: T[], read: (row: T) => number) {
  return rows.reduce((total, row) => total + read(row), 0);
}

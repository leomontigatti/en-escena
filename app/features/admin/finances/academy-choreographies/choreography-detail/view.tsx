import { AlertTriangle } from "lucide-react";
import { useMemo, useState } from "react";

import {
  AdminEmptyState,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { AlertStack } from "@/components/shared/alert-stack";
import { MetricCard } from "@/components/shared/metric-card";
import {
  ReadOnlyField,
  ReadOnlySelectField,
} from "@/components/shared/read-only-field";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import {
  ClientDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { FieldGroup } from "@/components/ui/field";
import { formatInscriptionStatusBadge } from "@/lib/finances/choreography-financial-status";
import { resolveInscriptionStatusBadge } from "@/lib/finances/inscription-financial-status";
import { choreographyGroupTypeOptions } from "@/lib/portal/choreographies";

import { formatAmount, formatOperationalAmount } from "../../formatters";
import { EmissionDialog } from "./comprobante-emission";
import { InscriptionMoneyDialog } from "./inscription-money-dialog";
import { formatDancerName } from "./shared";
import type { loadChoreographyFinanceDetail, PortionCoverage } from "./server";

type ChoreographyFinanceDetailLoaderData = Awaited<
  ReturnType<typeof loadChoreographyFinanceDetail>
>;

type InscriptionRow =
  ChoreographyFinanceDetailLoaderData["inscriptions"][number];

type PriceOption = ChoreographyFinanceDetailLoaderData["priceOptions"][number];

type ChoreographyFinanceDetailViewProps = {
  loaderData: ChoreographyFinanceDetailLoaderData;
};

export function ChoreographyFinanceDetailView({
  loaderData,
}: ChoreographyFinanceDetailViewProps) {
  const choreography = loaderData.choreography;

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title={choreography ? "Detalle financiero" : "Coreografía no encontrada"}
      description={
        choreography
          ? "Revisá los importes, datos y participaciones vinculadas a esta coreografía."
          : "No encontramos esa coreografía dentro de la lista financiera de la academia."
      }
      eventRequiredEmptyState={{
        title: "Elegí un evento activo para revisar la coreografía",
        description:
          "Activá un evento para consultar el detalle financiero de una coreografía.",
      }}
      headerAction={
        choreography ? (
          <ChoreographyActions loaderData={loaderData} />
        ) : undefined
      }
    >
      {choreography ? (
        <div className="flex flex-col gap-6">
          <ChoreographyAlerts loaderData={loaderData} />

          <section className="grid gap-4 md:grid-cols-3">
            <MetricCard
              title="Seña"
              value={formatOperationalAmount(choreography.depositAmount)}
              slot={portionCoverageBadge(loaderData.invoicing.sena)}
              to={portionCoverageHref(loaderData.invoicing.sena)}
              linkLabel="Ver comprobante que cubre la seña"
            />
            <MetricCard
              title="Saldo adeudado"
              value={formatOperationalAmount(choreography.owedBalanceAmount)}
              slot={portionCoverageBadge(loaderData.invoicing.saldo)}
              to={portionCoverageHref(loaderData.invoicing.saldo)}
              linkLabel="Ver comprobante que cubre el saldo"
            />
            <MetricCard
              title="Total"
              value={formatOperationalAmount(choreography.totalAmount)}
            />
          </section>

          <Card aria-label="Información financiera">
            <CardContent>
              <FieldGroup className="grid gap-4 md:grid-cols-2">
                <ReadOnlyField
                  id="finance-choreography-academy"
                  label="Academia"
                  value={loaderData.academy.name}
                />
                <ReadOnlyField
                  id="finance-choreography-name"
                  label="Nombre"
                  value={choreography.name}
                />
                <ReadOnlySelectField
                  label="Tipo de grupo"
                  options={choreographyGroupTypeOptions}
                  value={choreography.groupType}
                />
              </FieldGroup>
            </CardContent>
          </Card>

          <InscriptionsTable
            inscriptions={loaderData.inscriptions}
            priceOptions={loaderData.priceOptions}
          />
        </div>
      ) : (
        <AdminEmptyState
          title="Coreografía no encontrada"
          description="Volvé a la lista financiera y elegí una coreografía."
        />
      )}
    </AdminResourceLayout>
  );
}

/**
 * Badge de vigencia de la porción (Seña/Saldo): `Vigente` o `Desactualizada`
 * (ADR-0011). Devuelve `undefined` cuando ninguna factura vigente cubre la porción
 * —incluido el caso en que la única que la cubría fue anulada—, así la MetricCard
 * cae en su ícono por defecto y no queda un estado `Anulado` muerto. El link al
 * comprobante ya no es un botón aparte: lo lleva la card entera vía `to`.
 */
function portionCoverageBadge(coverage: PortionCoverage | null) {
  if (coverage === null) {
    return undefined;
  }

  return (
    <Badge variant={coverage.currency === "vigente" ? "success" : "warning"}>
      {coverage.currency === "vigente" ? "Vigente" : "Desactualizada"}
    </Badge>
  );
}

/**
 * Destino de la card de una porción: el comprobante vigente que la cubre. `null`
 * cuando no hay cobertura, y entonces la card no es un link.
 */
function portionCoverageHref(coverage: PortionCoverage | null) {
  return coverage === null
    ? undefined
    : `/administracion/comprobantes/${coverage.comprobanteId}`;
}

function ChoreographyAlerts({
  loaderData,
}: ChoreographyFinanceDetailViewProps) {
  const missingPrice =
    loaderData.choreography?.depositAmount.status === "incomplete";
  const overAllocated =
    loaderData.choreography?.anomalies.includes("overAllocated") ?? false;

  if (!missingPrice && !overAllocated) {
    return null;
  }

  return (
    <AlertStack>
      {overAllocated ? <OverAllocatedAlert /> : null}
      {missingPrice ? (
        <Alert variant="warning">
          <AlertTriangle aria-hidden="true" />
          <AlertDescription>
            Esta coreografía no tiene un precio configurado para cobrar la seña.
          </AlertDescription>
        </Alert>
      ) : null}
    </AlertStack>
  );
}

/**
 * La anomalía `Sobreasignada` en el detalle, como alerta y no como badge: en la
 * lista es cómo se lee esa coreografía, acá es algo que alguien tiene que
 * resolver.
 *
 * **Genérica y sin título, y no enumera bailarines.** Una alerta que los lista se
 * vuelve una copia peor de la tabla que está justo abajo y crece sin límite con
 * el roster. La tabla es donde están las filas. Es auto-resolutiva —se deriva del
 * dinero de hoy—, así que no hay nada que descartar: se va cuando se va el
 * problema.
 *
 * `destructive` y no ámbar, como el badge: `Seña pendiente` ya es una advertencia,
 * y una seña pendiente es el estado normal de una inscripción impaga; dinero de
 * más es dinero en el lugar equivocado.
 */
function OverAllocatedAlert() {
  return (
    <Alert variant="destructive">
      <AlertTriangle aria-hidden="true" />
      <AlertDescription>
        Hay inscripciones con más dinero asignado que su total. Podés corregirlo
        desde la lista de inscripciones.
      </AlertDescription>
    </Alert>
  );
}

/**
 * Menú único de acciones del header (`...`, ADR-0011): `Emitir factura` en un
 * `ResourceActionsMenu`, en lugar de un botón suelto. El item abre su propio
 * diálogo, montado como hermano del menú para que no se desmonte al cerrarse el
 * dropdown. Si no hay ninguna acción disponible el menú no se muestra. Los
 * presets de `Pagar seña` / `Pagar saldo` no viven acá: son acciones de lista
 * sobre las coreografías elegidas.
 */
function ChoreographyActions({
  loaderData,
}: ChoreographyFinanceDetailViewProps) {
  const invoicing = loaderData.invoicing;
  const canEmit = invoicing?.canEmit ?? false;
  // El facturable se congela al abrir y el diálogo se desmonta al CERRARLO, no
  // al perder la afordancia: una emisión recuperada por "Verificar ahora"
  // persiste el comprobante y revalida el detalle, que deja de ser facturable.
  // Desmontar ahí se llevaría puesto el estado `recovered` (#577).
  const [emission, setEmission] = useState<typeof invoicing | null>(null);

  if (!canEmit && !emission) {
    return null;
  }

  return (
    <>
      <ResourceActionsMenu contentClassName="w-48">
        {canEmit && invoicing ? (
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              setEmission(invoicing);
            }}
          >
            Emitir factura
          </DropdownMenuItem>
        ) : null}
      </ResourceActionsMenu>
      {emission ? (
        <EmissionDialog
          billableAmount={emission.billableAmount}
          porcion={emission.porcion}
          open
          onOpenChange={(next) => setEmission(next ? emission : null)}
        />
      ) : null}
    </>
  );
}

function InscriptionsTable({
  inscriptions,
  priceOptions,
}: {
  inscriptions: InscriptionRow[];
  priceOptions: PriceOption[];
}) {
  // Las columnas se memoizan para conservar una referencia estable entre
  // renders: sin esto, cada render recrea el array y React Table remonta las
  // celdas, perdiendo el estado `open` del diálogo por fila (se abría y se
  // cerraba de inmediato al re-renderizar la página).
  const columns = useMemo(
    () => buildInscriptionColumns(priceOptions),
    [priceOptions],
  );

  return (
    <section aria-label="Inscripciones">
      <ClientDataTable
        rows={inscriptions}
        columns={columns}
        getRowKey={(inscription) => inscription.dancerId}
        searchPlaceholder="Buscar inscripción por bailarín"
        emptyMessage="No hay inscripciones para mostrar."
        hideSearch
      />
    </section>
  );
}

function buildInscriptionColumns(
  priceOptions: PriceOption[],
): DataTableColumn<InscriptionRow>[] {
  return [
    {
      id: "dancer",
      header: "Bailarín",
      className: "font-medium",
      cell: (inscription) => (
        <DancerNameCell inscription={inscription} priceOptions={priceOptions} />
      ),
      filterValue: (inscription) => formatDancerName(inscription),
      sortValue: (inscription) => formatDancerName(inscription),
    },
    ...inscriptionAmountColumns,
  ];
}

/**
 * The dancer's name is **the** entry point for money on that inscription: one
 * button per row, and the dialog behind it decides its own shape from what the
 * row holds. There is no price control in this cell and no second affordance —
 * a row without an inscription yet is the only one that stays plain text,
 * because there is nothing to put money on.
 */
function DancerNameCell({
  inscription,
  priceOptions,
}: {
  inscription: InscriptionRow;
  priceOptions: PriceOption[];
}) {
  const [open, setOpen] = useState(false);

  if (inscription.inscriptionId === null) {
    return <>{formatDancerName(inscription)}</>;
  }

  return (
    <>
      <Button
        type="button"
        variant="link"
        className="h-auto p-0 text-left font-medium"
        onClick={() => setOpen(true)}
      >
        {formatDancerName(inscription)}
      </Button>
      {open ? (
        <InscriptionMoneyDialog
          inscription={inscription}
          onOpenChange={setOpen}
          priceOptions={priceOptions}
        />
      ) : null}
    </>
  );
}

const inscriptionAmountColumns: DataTableColumn<InscriptionRow>[] = [
  {
    id: "financialStatus",
    header: "Estado",
    cell: (inscription) => <InscriptionStatusCell inscription={inscription} />,
  },
  {
    id: "basePrice",
    header: "Precio base",
    className: "text-right tabular-nums",
    headerClassName: "text-right",
    cell: (inscription) => formatInscriptionAmount(inscription.basePriceAmount),
  },
  {
    id: "deposit",
    header: "Seña",
    className: "text-right tabular-nums",
    headerClassName: "text-right",
    cell: (inscription) => formatInscriptionAmount(inscription.depositAmount),
  },
  {
    // Decorativo y sin condición: `Total` es la columna de contexto —contra qué
    // se mide lo adeudado—, así que va atenuada entera. Nunca por fila: ninguna
    // cifra es provisoria, y un gris que varía vuelve a significar algo.
    id: "total",
    header: "Total",
    className: "text-right tabular-nums text-muted-foreground",
    headerClassName: "text-right",
    cell: (inscription) => formatInscriptionAmount(inscription.totalAmount),
  },
  {
    // La única cifra accionable de la fila, destacada por columna.
    id: "owedBalance",
    header: "Saldo adeudado",
    className: "text-right font-medium tabular-nums",
    headerClassName: "text-right",
    cell: (inscription) =>
      formatInscriptionAmount(inscription.owedBalanceAmount),
  },
];

/**
 * The badge of the `Estado` column. `Retirada` **replaces** the status, just as
 * an anomaly does: the roster-withdrawal axis and the money axis do not share a
 * cell.
 *
 * It carries the retained amount inside because that is half of the fact: the
 * row is still there *because* money was left on it, and a bare `Retirada`
 * would not say how much. It is the same number as the `Total` column —for a
 * withdrawn row the total **is** what is allocated— and repeating it here is
 * what makes the cell readable on its own.
 */
function InscriptionStatusCell({
  inscription,
}: {
  inscription: InscriptionRow;
}) {
  const badge = formatInscriptionStatusBadge(
    resolveInscriptionStatusBadge({
      anomalies: inscription.anomalies,
      financialStatus: inscription.financialStatus,
      withdrawn: inscription.withdrawn,
    }),
  );

  return (
    <Badge variant={badge.variant}>
      {badge.kind === "withdrawn"
        ? `${badge.label} · ${formatAmount(inscription.allocatedAmount)}`
        : badge.label}
    </Badge>
  );
}

function formatInscriptionAmount(amount: number | null) {
  return amount === null ? "Sin precio" : formatAmount(amount);
}

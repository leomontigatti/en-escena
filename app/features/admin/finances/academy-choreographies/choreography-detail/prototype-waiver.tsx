// PROTOTYPE — throwaway, never merge. The `Bonificada` waiver on the
// choreography financial detail (`?variant=A` on this same route), redone under
// the dialog and button rules of #1352/#1360: a confirmation is a question with
// `Cancelar` and the verb. One deliberate departure: `Bonificar coreografía`
// stays enabled and, while money blocks it, opens an acknowledgment saying why
// instead of a standing alert on the page. Everything is in memory: nothing is
// written, and "Quitar dinero" here only pretends the money went back to the pool.
import { Check, Info } from "lucide-react";
import { useMemo, useState } from "react";

import { AdminResourceLayout } from "@/components/admin/resource-layout";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import {
  ClientDataTable,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { ReadOnlyField } from "@/components/shared/read-only-field";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatEventSequenceNumber } from "@/lib/events/sequence-number";
import { formatInscriptionStatusBadge } from "@/lib/finances/choreography-financial-status";
import { formatAmount, formatDancerName } from "@/lib/finances/formatters";
import { inscriptionFinanceColumns } from "@/lib/finances/inscription-finance-columns";
import { resolveInscriptionStatusBadge } from "@/lib/finances/inscription-financial-status";
import { OperationalFinanceMetrics } from "@/lib/finances/operational-finance-metrics";
import type { OperationalFinanceAmount } from "@/lib/finances/operational-summary";

import type { loadChoreographyFinanceDetail } from "./server";

type LoaderData = Awaited<ReturnType<typeof loadChoreographyFinanceDetail>>;
type Row = LoaderData["inscriptions"][number] & { waived: boolean };

type Confirmation =
  | { kind: "waiveInscription"; row: Row }
  | { kind: "unwaiveInscription"; row: Row }
  | { kind: "waiveChoreography" }
  | { kind: "unwaiveChoreography" }
  | { kind: "choreographyBlocked" };

export function PrototypeWaiverView({
  loaderData,
}: {
  loaderData: LoaderData;
}) {
  const choreography = loaderData.choreography;
  const [waived, setWaived] = useState<Set<string>>(new Set());
  const [cleared, setCleared] = useState<Set<string>>(new Set());
  const [openDancerId, setOpenDancerId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  const rows: Row[] = useMemo(
    () =>
      loaderData.inscriptions.map((row) => {
        const allocatedAmount = cleared.has(row.dancerId)
          ? 0
          : row.allocatedAmount;
        const isWaived = waived.has(row.dancerId);

        return {
          ...row,
          allocatedAmount,
          waived: isWaived,
          ...(isWaived
            ? {
                depositAmount: 0,
                owedBalanceAmount: 0,
                owedDepositAmount: 0,
                totalAmount: 0,
              }
            : cleared.has(row.dancerId)
              ? {
                  owedBalanceAmount: row.totalAmount,
                  owedDepositAmount: row.depositAmount,
                  financialStatus: "depositPending" as const,
                }
              : {}),
        };
      }),
    [cleared, loaderData.inscriptions, waived],
  );

  const eligible = rows.filter(
    (row) => row.inscriptionId !== null && !row.withdrawn,
  );
  const withMoney = eligible.filter(
    (row) => !row.waived && row.allocatedAmount > 0,
  );
  const toWaive = eligible.filter((row) => !row.waived);
  const allWaived = eligible.length > 0 && toWaive.length === 0;

  const setWaivedFor = (dancerIds: string[], value: boolean) =>
    setWaived((previous) => {
      const next = new Set(previous);
      dancerIds.forEach((id) => (value ? next.add(id) : next.delete(id)));
      return next;
    });

  const openRow = rows.find((row) => row.dancerId === openDancerId) ?? null;
  const columns = useMemo(() => buildColumns(setOpenDancerId), []);
  // The page's figures, moved by what changed in memory: the real rollup sums
  // the rows, and a waived row's figures are zero.
  const adjust = (
    figure: OperationalFinanceAmount,
    key:
      | "depositAmount"
      | "owedBalanceAmount"
      | "owedDepositAmount"
      | "totalAmount",
  ): OperationalFinanceAmount => {
    let amount = figure.amount;
    let missing = figure.status === "incomplete" ? figure.missingPriceCount : 0;

    rows.forEach((row, index) => {
      const before = loaderData.inscriptions[index][key];
      const after = row[key];

      if (before === null && after !== null) missing--;
      amount += (after ?? 0) - (before ?? 0);
    });

    return missing > 0
      ? { amount, missingPriceCount: missing, status: "incomplete" }
      : { amount, status: "complete" };
  };

  if (!choreography) {
    return null;
  }

  function confirm() {
    if (!confirmation) return;

    if (confirmation.kind === "waiveInscription") {
      setWaivedFor([confirmation.row.dancerId], true);
    } else if (confirmation.kind === "unwaiveInscription") {
      setWaivedFor([confirmation.row.dancerId], false);
    } else if (confirmation.kind === "waiveChoreography") {
      setWaivedFor(
        toWaive.map((row) => row.dancerId),
        true,
      );
    } else {
      setWaivedFor(
        eligible.map((row) => row.dancerId),
        false,
      );
    }

    setConfirmation(null);
  }

  return (
    <AdminResourceLayout
      selectedEventId={loaderData.selectedEventId}
      title={`${choreography.name} # ${formatEventSequenceNumber(
        choreography.choreographyNumber,
      )}`}
      description="Revisá y/o modificá las asignaciones de cada inscripción desde la lista."
      eventRequiredEmptyState={{ title: "", description: "" }}
      headerAction={
        <ResourceActionsMenu contentClassName="w-56">
          <DropdownMenuItem disabled>Emitir factura</DropdownMenuItem>
          {allWaived ? (
            <DropdownMenuItem
              onSelect={() => setConfirmation({ kind: "unwaiveChoreography" })}
            >
              Quitar bonificación
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              disabled={toWaive.length === 0}
              onSelect={() =>
                setConfirmation({
                  kind:
                    withMoney.length > 0
                      ? "choreographyBlocked"
                      : "waiveChoreography",
                })
              }
            >
              Bonificar coreografía
            </DropdownMenuItem>
          )}
        </ResourceActionsMenu>
      }
    >
      <div className="flex flex-col gap-6">
        <OperationalFinanceMetrics
          availableBalanceAmount={
            loaderData.availableBalanceAmount +
            loaderData.inscriptions.reduce(
              (sum, row, index) =>
                sum + row.allocatedAmount - rows[index].allocatedAmount,
              0,
            )
          }
          depositAmount={adjust(choreography.depositAmount, "depositAmount")}
          owedBalanceAmount={adjust(
            choreography.owedBalanceAmount,
            "owedBalanceAmount",
          )}
          owedDepositAmount={adjust(
            choreography.owedDepositAmount,
            "owedDepositAmount",
          )}
          totalAmount={adjust(choreography.totalAmount, "totalAmount")}
        />

        <section aria-label="Inscripciones">
          <ClientDataTable
            rows={rows}
            columns={columns}
            getRowKey={(row) => row.dancerId}
            searchPlaceholder="Buscar inscripción por bailarín"
            textFilterColumnId="dancer"
            emptyMessage="No hay inscripciones para mostrar."
          />
        </section>
      </div>

      {openRow ? (
        <InscriptionDialog
          key={openRow.dancerId}
          onClearMoney={() =>
            setCleared((previous) => new Set(previous).add(openRow.dancerId))
          }
          onClose={() => setOpenDancerId(null)}
          onUnwaive={() => {
            setOpenDancerId(null);
            setConfirmation({ kind: "unwaiveInscription", row: openRow });
          }}
          onWaive={() => {
            setOpenDancerId(null);
            setConfirmation({ kind: "waiveInscription", row: openRow });
          }}
          row={openRow}
        />
      ) : null}

      {confirmation?.kind === "choreographyBlocked" ? (
        <ChoreographyWaiverBlockedDialog
          onOpenChange={(open) => (open ? null : setConfirmation(null))}
          withMoney={withMoney}
        />
      ) : confirmation ? (
        <WaiverConfirmation
          confirmation={confirmation}
          onConfirm={confirm}
          onOpenChange={(open) => (open ? null : setConfirmation(null))}
          toWaiveCount={toWaive.length}
          waivedCount={eligible.length}
        />
      ) : null}
    </AdminResourceLayout>
  );
}

function buildColumns(
  onOpen: (dancerId: string) => void,
): DataTableColumn<Row>[] {
  return [
    {
      id: "dancer",
      header: "Bailarín",
      className: "font-medium",
      cell: (row) =>
        row.inscriptionId === null ? (
          formatDancerName(row)
        ) : (
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 text-left font-medium"
            onClick={() => onOpen(row.dancerId)}
          >
            {formatDancerName(row)}
          </Button>
        ),
      filterValue: (row) => formatDancerName(row),
    },
    ...inscriptionFinanceColumns.filter(
      (column) => column.id !== "financialStatus",
    ),
    {
      id: "financialStatus",
      header: "Estado",
      cell: (row) => {
        if (row.waived) {
          return <Badge variant="success">Bonificada</Badge>;
        }
        const badge = formatInscriptionStatusBadge(
          resolveInscriptionStatusBadge({
            anomalies: row.anomalies,
            financialStatus: row.financialStatus,
            withdrawn: row.withdrawn,
          }),
        );
        return <Badge variant={badge.variant}>{badge.label}</Badge>;
      },
    },
  ];
}

/**
 * What `Bonificar coreografía` opens while any inscription holds money: an
 * acknowledgment and not a confirmation, so it has no verb, only `Cerrar` — the
 * same shape as the blocked mode of `DeleteDialog`. It names every inscription
 * in the way, which a standing alert on the page would have to do on nearly
 * every paid choreography.
 */
function ChoreographyWaiverBlockedDialog({
  onOpenChange,
  withMoney,
}: {
  onOpenChange: (open: boolean) => void;
  withMoney: Row[];
}) {
  return (
    <AlertDialog open onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>
            No se puede bonificar la coreografía
          </AlertDialogTitle>
          <AlertDialogDescription>
            Para bonificarla, primero quitá el dinero de sus inscripciones desde
            la lista. Al quitarlo vuelve al saldo disponible de la academia.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Alert variant="info">
          <Info aria-hidden="true" />
          <AlertTitle>Inscripciones con dinero asignado</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-5">
              {withMoney.map((row) => (
                <li key={row.dancerId}>
                  {formatDancerName(row)} tiene{" "}
                  {formatAmount(row.allocatedAmount)} asignados.
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
        <AlertDialogFooter>
          <AlertDialogCancel>Cerrar</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** A stand-in for today's allocation fields, read-only in the prototype. */
function AllocationFieldsStub({ row }: { row: Row }) {
  return (
    <FieldGroup>
      <ReadOnlyField
        label="Precio"
        value={
          row.effectivePrice
            ? `${row.effectivePrice.name} · ${formatAmount(row.effectivePrice.amount)}`
            : "Sin precio"
        }
      />
      <Field>
        <FieldLabel htmlFor="prototype-amount">Monto</FieldLabel>
        <Input
          id="prototype-amount"
          placeholder={formatAmount(row.owedBalanceAmount ?? 0)}
          inputMode="numeric"
        />
      </Field>
    </FieldGroup>
  );
}

/**
 * The money dialog with the waiver in it. `Bonificar` sits with `Quitar dinero`
 * on the far side of the footer, and is disabled — with an `info` alert above
 * the fields saying why — while the inscription holds money. Clicking it hands
 * over to the confirmation; the dialog does not grow a confirm shape of its own.
 */
function InscriptionDialog({
  onClearMoney,
  onClose,
  onUnwaive,
  onWaive,
  row,
}: {
  onClearMoney: () => void;
  onClose: () => void;
  onUnwaive: () => void;
  onWaive: () => void;
  row: Row;
}) {
  const name = formatDancerName(row);
  const holdsMoney = row.allocatedAmount > 0;

  return (
    <Dialog open onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{name}</DialogTitle>
          <DialogDescription>
            {row.waived
              ? "Inscripción bonificada: no adeuda nada."
              : "El dinero se asigna desde el saldo disponible de la academia."}
          </DialogDescription>
        </DialogHeader>

        {row.waived ? (
          <>
            <Alert variant="info">
              <Info aria-hidden="true" />
              <AlertTitle>Inscripción bonificada</AlertTitle>
              <AlertDescription>
                No se le puede asignar dinero. Para cobrarla, quitá la
                bonificación.
              </AlertDescription>
            </Alert>
            <DialogFooter className="sm:justify-between">
              <Button variant="destructive" onClick={onUnwaive}>
                Quitar bonificación
              </Button>
              <Button variant="outline" onClick={onClose}>
                Cerrar
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            {holdsMoney ? (
              <Alert variant="info">
                <Info aria-hidden="true" />
                <AlertTitle>Para bonificarla, quitá su dinero</AlertTitle>
                <AlertDescription>
                  Tiene {formatAmount(row.allocatedAmount)} asignados. Al
                  quitarlos vuelven al saldo disponible de la academia.
                </AlertDescription>
              </Alert>
            ) : null}
            <AllocationFieldsStub row={row} />
            <DialogFooter className="sm:justify-between">
              <div className="flex gap-2">
                {holdsMoney ? (
                  <Button variant="destructive" onClick={onClearMoney}>
                    Quitar dinero
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  disabled={holdsMoney}
                  onClick={onWaive}
                >
                  Bonificar
                </Button>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose}>
                  Cancelar
                </Button>
                <Button disabled>
                  <Check aria-hidden="true" data-icon="inline-start" />
                  Guardar
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * The four questions the waiver asks, through the shared confirmation. Waiving
 * gives something and reverses nothing, so its verb is the default button;
 * removing the waiver reverses one, so it is `destructive`.
 */
function WaiverConfirmation({
  confirmation,
  onConfirm,
  onOpenChange,
  toWaiveCount,
  waivedCount,
}: {
  confirmation: Exclude<Confirmation, { kind: "choreographyBlocked" }>;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  toWaiveCount: number;
  waivedCount: number;
}) {
  const copy = {
    waiveInscription: {
      title: "¿Bonificar la inscripción?",
      description:
        confirmation.kind === "waiveInscription"
          ? `La inscripción de ${formatDancerName(confirmation.row)} pasa a ser gratis: no adeuda nada y participa igual que las demás.`
          : "",
      confirmLabel: "Bonificar",
      destructive: false,
    },
    unwaiveInscription: {
      title: "¿Quitar la bonificación?",
      description:
        confirmation.kind === "unwaiveInscription"
          ? `La inscripción de ${formatDancerName(confirmation.row)} vuelve al precio que le corresponde y queda con la seña pendiente. Si la coreografía ya tiene número de presentación, lo conserva.`
          : "",
      confirmLabel: "Quitar",
      destructive: true,
    },
    waiveChoreography: {
      title: "¿Bonificar la coreografía?",
      description:
        toWaiveCount === 1
          ? "Su inscripción pasa a ser gratis: no adeuda nada y participa igual que las demás."
          : `Sus ${toWaiveCount} inscripciones pasan a ser gratis: no adeudan nada y participan igual que las demás.`,
      confirmLabel: "Bonificar",
      destructive: false,
    },
    unwaiveChoreography: {
      title: "¿Quitar la bonificación de la coreografía?",
      description: `Sus ${waivedCount} inscripciones vuelven al precio que les corresponde y quedan con la seña pendiente. Si ya tiene número de presentación, lo conserva.`,
      confirmLabel: "Quitar",
      destructive: true,
    },
  }[confirmation.kind];

  return (
    <ConfirmationDialog
      confirmLabel={copy.confirmLabel}
      description={copy.description}
      destructive={copy.destructive}
      onConfirm={onConfirm}
      onOpenChange={onOpenChange}
      open
      title={copy.title}
    />
  );
}

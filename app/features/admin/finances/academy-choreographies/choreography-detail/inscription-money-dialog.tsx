/**
 * The money dialog of an inscription: one entry point — the dancer's name —
 * whose shape is decided by what the row *is*, so an administrator is never
 * shown a control that cannot apply.
 *
 * | Row                            | What opens                                    |
 * | ------------------------------ | --------------------------------------------- |
 * | over-allocated                 | Release the excess. One button, nothing else.  |
 * | nothing owed, money on it      | Remove money, prefilled with everything        |
 * | anything else                  | Price + amount, hinting the deposit then the balance |
 *
 * A row that still owes something but already holds money reaches the removal
 * shape from inside the allocation one, which keeps the entry point single
 * while leaving `Quitar dinero` reachable wherever there is money to take off.
 * The switch only goes that way: a row opens on removal exactly when adding
 * money would be refused anyway.
 *
 * **No removal shape carries a price control**, not even a locked one. Price is
 * an allocation-time concern, and taking money off is how the picker comes back.
 *
 * That last part is **stricter than the rule**: the price is fixed at the
 * deposit threshold, so a below-threshold change is accepted by every write path
 * and by the database guard, yet this dialog swaps the picker for a readout at
 * the first peso and says so in its hint. The divergence is deliberate for now
 * and recorded in `docs/domain/finances.md`; the readout at least names the
 * **effective** price, so no figure on this screen contradicts another.
 */

import { AlertTriangle, Check, LoaderCircle, Undo2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useFetcher } from "react-router";

import { ReadOnlyField } from "@/components/shared/read-only-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { formatAmount } from "../../formatters";
import type { loadChoreographyFinanceDetail } from "./server";
import {
  allocateInscriptionIntent,
  formatDancerName,
  releaseInscriptionExcessIntent,
  removeInscriptionMoneyIntent,
} from "./shared";

type ChoreographyFinanceDetailLoaderData = Awaited<
  ReturnType<typeof loadChoreographyFinanceDetail>
>;
type InscriptionRow =
  ChoreographyFinanceDetailLoaderData["inscriptions"][number];
type PriceOption = ChoreographyFinanceDetailLoaderData["priceOptions"][number];

export type InscriptionMoneyDialogShape =
  | "releaseExcess"
  | "remove"
  | "allocate";

/**
 * Which shape the row opens on. The excess outranks everything: an
 * over-allocated row is fully paid too, and the only sane act on it is getting
 * the surplus off. A row that owes nothing and holds money opens on removal,
 * because allocating onto it would be refused.
 */
export function readInscriptionMoneyDialogShape(
  inscription: Pick<
    InscriptionRow,
    "allocatedAmount" | "overAllocatedAmount" | "owedBalanceAmount"
  >,
): InscriptionMoneyDialogShape {
  if ((inscription.overAllocatedAmount ?? 0) > 0) {
    return "releaseExcess";
  }

  return inscription.owedBalanceAmount === 0 && inscription.allocatedAmount > 0
    ? "remove"
    : "allocate";
}

export function InscriptionMoneyDialog({
  inscription,
  onOpenChange,
  priceOptions,
}: {
  inscription: InscriptionRow;
  onOpenChange: (open: boolean) => void;
  priceOptions: PriceOption[];
}) {
  const shape = readInscriptionMoneyDialogShape(inscription);
  const [removing, setRemoving] = useState(shape === "remove");

  if (shape === "releaseExcess") {
    return (
      <ReleaseExcessDialog
        inscription={inscription}
        onOpenChange={onOpenChange}
      />
    );
  }

  if (removing) {
    return (
      <RemoveMoneyDialog
        inscription={inscription}
        onOpenChange={onOpenChange}
      />
    );
  }

  return (
    <AllocateMoneyDialog
      inscription={inscription}
      onOpenChange={onOpenChange}
      onRemoveMoney={
        inscription.allocatedAmount > 0 ? () => setRemoving(true) : null
      }
      priceOptions={priceOptions}
    />
  );
}

/**
 * The allocation dialog. Any amount goes in, and the owed figure is a
 * **placeholder** rather than a prefilled value: it moves while the dialog is
 * open — the discount is live, so a sibling registering elsewhere changes it —
 * and typing over a prefilled figure is worse than typing into an empty box.
 *
 * The hint is the figure that finishes the next thing: the deposit while that
 * threshold is unmet, the balance once it is met.
 */
function AllocateMoneyDialog({
  inscription,
  onOpenChange,
  onRemoveMoney,
  priceOptions,
}: {
  inscription: InscriptionRow;
  onOpenChange: (open: boolean) => void;
  onRemoveMoney: (() => void) | null;
  priceOptions: PriceOption[];
}) {
  const fetcher = useMoneyWriteFetcher(onOpenChange);
  const [amount, setAmount] = useState("");
  const [priceId, setPriceId] = useState(inscription.selectedPrice?.id ?? "");
  const isSaving = fetcher.state !== "idle";
  const isPriceLocked = inscription.allocatedAmount > 0;
  const hintedAmount =
    inscription.owedDepositAmount === null || inscription.owedDepositAmount > 0
      ? inscription.owedDepositAmount
      : inscription.owedBalanceAmount;

  return (
    <MoneyDialog
      description={`Se asigna a ${formatDancerName(inscription)} desde el saldo disponible de la academia.`}
      isSaving={isSaving}
      onOpenChange={onOpenChange}
      title="Asignar dinero"
    >
      <fetcher.Form method="post" className="flex flex-col gap-4">
        <input type="hidden" name="intent" value={allocateInscriptionIntent} />
        <input
          type="hidden"
          name="inscriptionId"
          value={inscription.inscriptionId ?? ""}
        />

        <FieldGroup>
          {isPriceLocked ? (
            <div className="flex flex-col gap-1.5">
              <ReadOnlyField
                label="Precio"
                value={formatEffectivePrice(inscription.effectivePrice)}
              />
              <p className="text-xs text-muted-foreground">
                Tiene {formatAmount(inscription.allocatedAmount)} asignados.
                Para cambiarle el precio hay que quitarle todo el dinero.
              </p>
            </div>
          ) : (
            <Field>
              <FieldLabel htmlFor="inscription-price">Precio</FieldLabel>
              <Select
                name="priceId"
                value={priceId}
                onValueChange={setPriceId}
                disabled={isSaving}
              >
                <SelectTrigger id="inscription-price" className="w-full">
                  <SelectValue placeholder="Elegí un precio" />
                </SelectTrigger>
                <SelectContent>
                  {priceOptions.map((price) => (
                    <SelectItem key={price.id} value={price.id}>
                      {price.name} · {formatAmount(price.amount)} · seña{" "}
                      {formatAmount(price.depositAmount)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}

          <Field>
            <FieldLabel htmlFor="inscription-amount">Monto</FieldLabel>
            <Input
              id="inscription-amount"
              name="amount"
              inputMode="numeric"
              autoComplete="off"
              className="tabular-nums"
              disabled={isSaving}
              placeholder={
                hintedAmount === null ? undefined : formatAmount(hintedAmount)
              }
              value={amount}
              onChange={(event) =>
                setAmount(event.target.value.replace(/\D/g, ""))
              }
            />
          </Field>
        </FieldGroup>

        <OwedSummary inscription={inscription} />

        <FetcherError data={fetcher.data} />

        <DialogFooter className={onRemoveMoney ? "sm:justify-between" : ""}>
          {onRemoveMoney ? (
            <Button
              type="button"
              variant="ghost"
              disabled={isSaving}
              onClick={onRemoveMoney}
            >
              <Undo2 aria-hidden="true" data-icon="inline-start" />
              Quitar dinero
            </Button>
          ) : null}
          <div className="flex gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isSaving}>
                Cancelar
              </Button>
            </DialogClose>
            <Button
              type="submit"
              disabled={
                isSaving ||
                amount === "" ||
                (!isPriceLocked && priceOptions.length === 0)
              }
            >
              <SubmitIcon isSaving={isSaving} />
              Guardar
            </Button>
          </div>
        </DialogFooter>
      </fetcher.Form>
    </MoneyDialog>
  );
}

/**
 * The removal dialog: an amount **prefilled** with everything the inscription
 * holds, which is the common case, and any smaller amount is accepted. Unlike
 * the allocation hint this is a real value, because it does not move under the
 * administrator — what is allocated is a fact, not a projection.
 *
 * There is no payment to pick: the amount unwinds newest-first through the pool
 * rule. And there is no price control, because nothing here depends on a price.
 */
function RemoveMoneyDialog({
  inscription,
  onOpenChange,
}: {
  inscription: InscriptionRow;
  onOpenChange: (open: boolean) => void;
}) {
  const fetcher = useMoneyWriteFetcher(onOpenChange);
  const [amount, setAmount] = useState(String(inscription.allocatedAmount));
  const isSaving = fetcher.state !== "idle";

  return (
    <MoneyDialog
      description={`Se le quitan a ${formatDancerName(inscription)} y vuelven al saldo disponible de la academia.`}
      isSaving={isSaving}
      onOpenChange={onOpenChange}
      title="Quitar dinero"
    >
      <fetcher.Form method="post" className="flex flex-col gap-4">
        <input
          type="hidden"
          name="intent"
          value={removeInscriptionMoneyIntent}
        />
        <input
          type="hidden"
          name="inscriptionId"
          value={inscription.inscriptionId ?? ""}
        />

        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="inscription-removed-amount">Monto</FieldLabel>
            <Input
              id="inscription-removed-amount"
              name="amount"
              inputMode="numeric"
              autoComplete="off"
              className="tabular-nums"
              disabled={isSaving}
              value={amount}
              onChange={(event) =>
                setAmount(event.target.value.replace(/\D/g, ""))
              }
            />
          </Field>
        </FieldGroup>

        <SummaryRow
          label="Asignado"
          value={formatAmount(inscription.allocatedAmount)}
        />

        <FetcherError data={fetcher.data} />

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={isSaving}>
              Cancelar
            </Button>
          </DialogClose>
          <Button
            type="submit"
            variant="destructive"
            disabled={isSaving || amount === ""}
          >
            <SubmitIcon isSaving={isSaving} />
            Quitar
          </Button>
        </DialogFooter>
      </fetcher.Form>
    </MoneyDialog>
  );
}

/**
 * Releasing the excess: the amount is computed, so there is nothing to type and
 * nothing to pick — one button that takes off exactly what is above the total
 * and leaves the rest where it is.
 */
function ReleaseExcessDialog({
  inscription,
  onOpenChange,
}: {
  inscription: InscriptionRow;
  onOpenChange: (open: boolean) => void;
}) {
  const fetcher = useMoneyWriteFetcher(onOpenChange);
  const isSaving = fetcher.state !== "idle";
  const excessAmount = inscription.overAllocatedAmount ?? 0;

  return (
    <MoneyDialog
      description={`${formatDancerName(inscription)} tiene ${formatAmount(excessAmount)} de más. Vuelven al saldo disponible de la academia y el resto queda como está.`}
      isSaving={isSaving}
      onOpenChange={onOpenChange}
      title="Liberar el excedente"
    >
      <fetcher.Form method="post" className="flex flex-col gap-4">
        <input
          type="hidden"
          name="intent"
          value={releaseInscriptionExcessIntent}
        />
        <input
          type="hidden"
          name="inscriptionId"
          value={inscription.inscriptionId ?? ""}
        />

        <FetcherError data={fetcher.data} />

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={isSaving}>
              Cancelar
            </Button>
          </DialogClose>
          <Button type="submit" variant="destructive" disabled={isSaving}>
            <SubmitIcon isSaving={isSaving} />
            Liberar {formatAmount(excessAmount)}
          </Button>
        </DialogFooter>
      </fetcher.Form>
    </MoneyDialog>
  );
}

/**
 * The fetcher the three shapes write with, and the one rule about when the
 * dialog goes away: **only a write that went through closes it.** A refusal
 * comes back as a message in `fetcher.data` and has to stay readable, which it
 * is not if the dialog closes on top of it (#708).
 *
 * The refusal is read off `data.status`, not off the mere presence of `data`.
 * Today the action redirects once it has written and so brings nothing back,
 * which makes the two tests equivalent — but that is a deviation from the
 * dialog-write row of `docs/agents/form-feedback.md`, which expects the result
 * to come back from `fetcher.data`. Keying off presence would make the dialog
 * silently stop closing the day the action is aligned to the matrix.
 */
function useMoneyWriteFetcher(onOpenChange: (open: boolean) => void) {
  const fetcher = useFetcher<{ status: "error"; message: string }>();
  const isSaving = fetcher.state !== "idle";
  const isRefused = fetcher.data?.status === "error";
  const hasSubmittedRef = useRef(false);

  useEffect(() => {
    if (isSaving) {
      hasSubmittedRef.current = true;
      return;
    }

    if (!hasSubmittedRef.current) {
      return;
    }

    hasSubmittedRef.current = false;

    if (!isRefused) {
      onOpenChange(false);
    }
  }, [isRefused, isSaving, onOpenChange]);

  return fetcher;
}

/** The chrome the three shapes share, so only their contents differ. */
function MoneyDialog({
  children,
  description,
  isSaving,
  onOpenChange,
  title,
}: {
  children: ReactNode;
  description: string;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
}) {
  return (
    <Dialog open onOpenChange={(next) => !isSaving && onOpenChange(next)}>
      <DialogContent overlayClassName="backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

/**
 * What the inscription owes, deposit first and balance second — the order the money
 * is meant to travel in, and the reason the amount field hints the deposit while
 * that threshold is unmet.
 */
function OwedSummary({ inscription }: { inscription: InscriptionRow }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border bg-muted/50 px-3 py-2">
      <SummaryRow
        label="Seña adeudada"
        value={formatOwedAmount(inscription.owedDepositAmount)}
      />
      <SummaryRow
        label="Saldo adeudado"
        value={formatOwedAmount(inscription.owedBalanceAmount)}
      />
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium tabular-nums">{value}</span>
    </div>
  );
}

function FetcherError({ data }: { data: { message: string } | undefined }) {
  if (!data) {
    return null;
  }

  return (
    <Alert variant="destructive">
      <AlertTriangle aria-hidden="true" />
      <AlertDescription>{data.message}</AlertDescription>
    </Alert>
  );
}

function SubmitIcon({ isSaving }: { isSaving: boolean }) {
  return isSaving ? (
    <LoaderCircle
      aria-hidden="true"
      className="animate-spin"
      data-icon="inline-start"
    />
  ) : (
    <Check aria-hidden="true" data-icon="inline-start" />
  );
}

function formatOwedAmount(amount: number | null) {
  return amount === null ? "Sin precio" : formatAmount(amount);
}

/**
 * The readout names the **effective** price — what the inscription is charged at
 * — and not the stored row, so it cannot show a figure the detail row behind it
 * contradicts. Below the deposit threshold the two can be different rows: the
 * stored one is only what was last said, while every figure on this screen —
 * `Seña adeudada`, `Saldo adeudado` and the row's own `Total` — is derived from
 * the effective one.
 */
function formatEffectivePrice(price: InscriptionRow["effectivePrice"]) {
  return price === null
    ? "Sin precio"
    : `${price.name} · ${formatAmount(price.amount)}`;
}

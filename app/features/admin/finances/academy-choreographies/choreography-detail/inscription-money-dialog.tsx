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
 * The three shapes share a header: the title is the dancer's name — who the
 * money is about, which is the one thing an administrator cannot re-read off the
 * table behind the dialog — and the description says where the money comes from
 * or goes back to. The action itself is named by the submit button.
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
 * **The picker locks where the rule locks it**: at the deposit threshold, which
 * is what the deposit buys, and not at the first peso. Below it the price still moves
 * on its own —the effective row is re-derived against today— so offering the
 * picker there is offering to confirm a row that is going to be re-read anyway,
 * which is exactly what the rule intends.
 *
 * The threshold is read here off the row's **effective** deposit, while the
 * write path tests the **stored** one. They agree wherever it matters: once the
 * stored row is crossed the effective row *is* the stored row. They can differ
 * only when the list moved *down* under a row holding money, and there this
 * dialog is the stricter of the two — the same direction the old first-peso lock
 * erred in, and far rarer.
 */

import { AlertTriangle, Check, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useFetcher } from "react-router";

import { SharedFieldLayout } from "@/components/shared/field-layout";
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

import { hasCrossedDepositThreshold } from "@/lib/finances/inscription-financial-status";

import { formatAmount, formatDancerName } from "@/lib/finances/formatters";
import {
  deriveOwedAgainstPrice,
  formatDialogPrice,
  formatOwedAmount,
  readInscriptionMoneyDialogShape,
  selectPickedPrice,
  type InscriptionRow,
  type OwedAgainstPrice,
  type PriceOption,
} from "./inscription-money-figures";
import {
  allocateInscriptionIntent,
  releaseInscriptionExcessIntent,
  removeInscriptionMoneyIntent,
} from "./shared";

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
 * threshold is unmet, the balance once it is met. It is the **picked** price's
 * figure, not the row's: confirming applies the pick, so every amount the dialog
 * names is one it is actually about to charge.
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
  // It starts on the **effective** price: it is the one the row behind the dialog
  // shows, and the one the figures are derived from until something else is
  // picked. Opening it on the stored price left the picker saying one thing and
  // everything else another, and confirming without touching it fixed that old
  // price as soon as the allocation covered the deposit.
  const [priceId, setPriceId] = useState(inscription.effectivePrice?.id ?? "");
  const isSaving = fetcher.state !== "idle";
  // It locks where the rule locks it: on covering the deposit, not on the
  // first peso.
  const isPriceLocked = hasCrossedDepositThreshold({
    allocatedAmount: inscription.allocatedAmount,
    depositAmount: inscription.depositAmount,
  });
  // Every figure follows the **picked** price and not the row's, because
  // confirming applies the pick: hinting the deposit of a price the administrator
  // just moved away from asks them to type a figure this dialog is not about to
  // charge. Below the threshold that is a live choice, so the figures are
  // re-derived on each change rather than read off the loader.
  const owed = deriveOwedAgainstPrice({
    inscription,
    price: selectPickedPrice({ inscription, priceId, priceOptions }),
  });
  const hintedAmount =
    owed.owedDepositAmount === null || owed.owedDepositAmount > 0
      ? owed.owedDepositAmount
      : owed.owedBalanceAmount;
  // The ceiling is what the inscription owes, which is what the server refuses
  // against. The academy's pool is another ceiling, and that one is not known
  // here: it stays an alert.
  const owedBalanceAmount = owed.owedBalanceAmount;
  const isOutOfRange =
    amount !== "" &&
    owedBalanceAmount !== null &&
    (Number(amount) < 1 || Number(amount) > owedBalanceAmount);

  return (
    <MoneyDialog
      description="El dinero se asigna desde el saldo disponible de la academia."
      isSaving={isSaving}
      onOpenChange={onOpenChange}
      title={formatDancerName(inscription)}
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
            <ReadOnlyField
              label="Precio"
              value={formatDialogPrice(inscription.effectivePrice)}
            />
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
                      {formatDialogPrice(price)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}

          <SharedFieldLayout
            error={
              isOutOfRange && owedBalanceAmount !== null
                ? `Ingresá un monto entre ${formatAmount(1)} y ${formatAmount(owedBalanceAmount)}.`
                : undefined
            }
            id="inscription-amount"
            label="Monto"
          >
            {({ describedBy, isInvalid }) => (
              <Input
                id="inscription-amount"
                name="amount"
                inputMode="numeric"
                autoComplete="off"
                aria-describedby={describedBy}
                aria-invalid={isInvalid}
                autoFocus
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
            )}
          </SharedFieldLayout>
        </FieldGroup>

        {/* The two owed figures only once there is money on it: on an empty
            inscription they restate the price sitting right above. */}
        {inscription.allocatedAmount > 0 ? <OwedSummary owed={owed} /> : null}

        <FetcherError data={fetcher.data} />

        <DialogFooter className={onRemoveMoney ? "sm:justify-between" : ""}>
          {onRemoveMoney ? (
            <Button
              type="button"
              variant="destructive"
              disabled={isSaving}
              onClick={onRemoveMoney}
            >
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
                isOutOfRange ||
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
 * The removal dialog: an amount **hinted** with everything the inscription holds,
 * which is the common case, and any smaller amount is accepted. The hint is a
 * placeholder rather than a prefilled value, like the allocation one — the two
 * gestures are typed the same way, and a figure that has to be cleared before it
 * can be replaced is worse than an empty box.
 *
 * What is out of range is said **under the field and not as an alert**: it is
 * about what was typed, and the bound is known here — what is allocated is a
 * fact, not a projection, so the dialog can name the range instead of waiting
 * for the server to refuse it. The two server refusals it stands in for
 * ("El monto a quitar tiene que ser mayor a 0." and "La inscripción no tiene ese
 * dinero asignado.") survive as guards, and still surface in the alert if the
 * figure moved under the administrator while the dialog was open.
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
  const [amount, setAmount] = useState("");
  const isSaving = fetcher.state !== "idle";
  const isOutOfRange =
    amount !== "" &&
    (Number(amount) < 1 || Number(amount) > inscription.allocatedAmount);

  return (
    <MoneyDialog
      description="El dinero que se quita vuelve al saldo disponible de la academia."
      isSaving={isSaving}
      onOpenChange={onOpenChange}
      title={formatDancerName(inscription)}
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
          <SharedFieldLayout
            error={
              isOutOfRange
                ? `Ingresá un monto entre ${formatAmount(1)} y ${formatAmount(inscription.allocatedAmount)}.`
                : undefined
            }
            id="inscription-removed-amount"
            label="Monto"
          >
            {({ describedBy, isInvalid }) => (
              <Input
                id="inscription-removed-amount"
                name="amount"
                inputMode="numeric"
                autoComplete="off"
                aria-describedby={describedBy}
                aria-invalid={isInvalid}
                autoFocus
                className="tabular-nums"
                disabled={isSaving}
                placeholder={formatAmount(inscription.allocatedAmount)}
                value={amount}
                onChange={(event) =>
                  setAmount(event.target.value.replace(/\D/g, ""))
                }
              />
            )}
          </SharedFieldLayout>
        </FieldGroup>

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
            disabled={isSaving || amount === "" || isOutOfRange}
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
      description={`Tiene ${formatAmount(excessAmount)} de más. Vuelven al saldo disponible de la academia y el resto queda como está.`}
      isSaving={isSaving}
      onOpenChange={onOpenChange}
      title={formatDancerName(inscription)}
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
function OwedSummary({ owed }: { owed: OwedAgainstPrice }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border bg-muted/50 px-3 py-2">
      <SummaryRow
        label="Seña adeudada"
        value={formatOwedAmount(owed.owedDepositAmount)}
      />
      <SummaryRow
        label="Saldo adeudado"
        value={formatOwedAmount(owed.owedBalanceAmount)}
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

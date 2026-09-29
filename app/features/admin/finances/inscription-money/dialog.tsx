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
 * The dialog is **one dialog for the two kinds of inscription**, not a shape
 * per kind: a seminar inscription is funded from the same pool, against the same
 * two thresholds, with the same price lock. What the caller passes is the target
 * kind, which travels in the form so the action it posts to knows which writer to
 * call.
 *
 * The threshold is read here off the row's **effective** deposit, while the
 * write path tests the **stored** one. They agree wherever it matters: once the
 * stored row is crossed the effective row *is* the stored row. They can differ
 * only when the list moved *down* under a row holding money, and there this
 * dialog is the stricter of the two — the same direction the old first-peso lock
 * erred in, and far rarer.
 */

import { Info } from "lucide-react";
import { useState } from "react";

import { SharedFieldLayout } from "@/components/shared/field-layout";
import { ReadOnlyField } from "@/components/shared/read-only-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AllocationTargetKind } from "@/lib/finances/allocation-target.server";
import { formatAmount, formatDancerName } from "@/lib/finances/formatters";

import {
  FetcherError,
  MoneyDialog,
  MoneyTargetFields,
  OwedSummary,
  SubmitIcon,
  useMoneyWriteFetcher,
} from "./dialog-parts";
import {
  formatDialogPrice,
  isAmountOutOfRange,
  readInscriptionMoneyDialogShape,
  resolveAllocationDialogFigures,
  type InscriptionRow,
  type PriceOption,
} from "./figures";
import {
  allocateInscriptionIntent,
  releaseInscriptionExcessIntent,
  removeInscriptionMoneyIntent,
} from "./intents";

export function InscriptionMoneyDialog({
  inscription,
  onOpenChange,
  priceOptions,
  targetKind,
}: {
  inscription: InscriptionRow;
  onOpenChange: (open: boolean) => void;
  priceOptions: PriceOption[];
  // Required rather than defaulted to `"choreography"`: the kind decides which
  // inscription table the action writes against, so an omission at a call site
  // has to fail to typecheck instead of silently allocating to the other kind.
  targetKind: AllocationTargetKind;
}) {
  const shape = readInscriptionMoneyDialogShape(inscription);
  const [removing, setRemoving] = useState(shape === "remove");

  if (shape === "releaseExcess") {
    return (
      <ReleaseExcessDialog
        inscription={inscription}
        onOpenChange={onOpenChange}
        targetKind={targetKind}
      />
    );
  }

  if (removing) {
    return (
      <RemoveMoneyDialog
        inscription={inscription}
        onOpenChange={onOpenChange}
        targetKind={targetKind}
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
      targetKind={targetKind}
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
  targetKind,
}: {
  inscription: InscriptionRow;
  onOpenChange: (open: boolean) => void;
  onRemoveMoney: (() => void) | null;
  priceOptions: PriceOption[];
  targetKind: AllocationTargetKind;
}) {
  const fetcher = useMoneyWriteFetcher(onOpenChange);
  const [amount, setAmount] = useState("");
  // It starts on the **effective** price: it is the one the row behind the dialog
  // shows, and the one the figures are derived from until something else is
  // picked. Opening it on the stored price left the picker saying one thing and
  // everything else another, and confirming without touching it fixed that old
  // price as soon as the allocation covered the deposit.
  const initialPriceId = inscription.effectivePrice?.id ?? "";
  const [priceId, setPriceId] = useState(initialPriceId);
  const isSaving = fetcher.state !== "idle";
  // Below the threshold the price is a live choice, so every figure is
  // re-derived on each change rather than read off the loader.
  const { hintedAmount, isPriceLocked, ...owed } =
    resolveAllocationDialogFigures({ inscription, priceId, priceOptions });
  // The ceiling is what the inscription owes, which is what the server refuses
  // against. The academy's pool is another ceiling, and that one is not known
  // here: it stays an alert.
  const owedBalanceAmount = owed.owedBalanceAmount;

  return (
    <MoneyDialog
      description="El dinero se asigna desde el saldo disponible de la academia."
      isDirty={amount !== "" || priceId !== initialPriceId}
      isSaving={isSaving}
      onOpenChange={onOpenChange}
      title={formatDancerName(inscription)}
    >
      {(requestClose) => (
        <fetcher.Form method="post" className="flex flex-col gap-4">
          <input
            type="hidden"
            name="intent"
            value={allocateInscriptionIntent}
          />
          {isPriceLocked ? <LockedPriceAlert /> : null}

          <MoneyTargetFields
            inscription={inscription}
            targetKind={targetKind}
          />

          <FieldGroup>
            <AllocationPriceField
              effectivePrice={inscription.effectivePrice}
              isLocked={isPriceLocked}
              isSaving={isSaving}
              onPriceIdChange={setPriceId}
              priceId={priceId}
              priceOptions={priceOptions}
            />

            <MoneyAmountField
              amount={amount}
              id="inscription-amount"
              isSaving={isSaving}
              maxAmount={owedBalanceAmount}
              onAmountChange={setAmount}
              placeholderAmount={hintedAmount}
            />
          </FieldGroup>

          {/* The two owed figures only once there is money on it: on an empty
            inscription they restate the price sitting right above. */}
          {inscription.allocatedAmount > 0 ? <OwedSummary owed={owed} /> : null}

          <FetcherError data={fetcher.data} />

          <AllocationFooter
            isSaving={isSaving}
            isSubmitDisabled={
              isSaving ||
              amount === "" ||
              isAmountOutOfRange(amount, owedBalanceAmount) ||
              (!isPriceLocked && priceOptions.length === 0)
            }
            onCancel={requestClose}
            onRemoveMoney={onRemoveMoney}
          />
        </fetcher.Form>
      )}
    </MoneyDialog>
  );
}

/**
 * The price control of the allocation shape, which is a picker or a readout and
 * never both. Locked, it says exactly what the picker it replaces said — name,
 * amount and `Seña`, through the one formatter — so crossing the threshold
 * cannot quietly drop a figure the administrator was choosing by.
 */
function AllocationPriceField({
  effectivePrice,
  isLocked,
  isSaving,
  onPriceIdChange,
  priceId,
  priceOptions,
}: {
  effectivePrice: InscriptionRow["effectivePrice"];
  isLocked: boolean;
  isSaving: boolean;
  onPriceIdChange: (priceId: string) => void;
  priceId: string;
  priceOptions: PriceOption[];
}) {
  if (isLocked) {
    return (
      <ReadOnlyField label="Precio" value={formatDialogPrice(effectivePrice)} />
    );
  }

  return (
    <Field>
      <FieldLabel htmlFor="inscription-price">Precio</FieldLabel>
      <Select
        name="priceId"
        value={priceId}
        onValueChange={onPriceIdChange}
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
  );
}

/**
 * The amount field of the two shapes that take one. Allocating and removing are
 * typed the same way on purpose — a placeholder and never a prefilled value, and
 * the range said under the field rather than as an alert — so they share the
 * control instead of agreeing twice.
 *
 * `maxAmount` is `null` only where the ceiling is unknown, which is an
 * inscription with no applicable price: there is no range to name, so nothing is
 * said and the server's refusal is what catches it.
 */
function MoneyAmountField({
  amount,
  id,
  isSaving,
  maxAmount,
  onAmountChange,
  placeholderAmount,
}: {
  amount: string;
  id: string;
  isSaving: boolean;
  maxAmount: number | null;
  onAmountChange: (amount: string) => void;
  placeholderAmount: number | null;
}) {
  return (
    <SharedFieldLayout
      error={
        isAmountOutOfRange(amount, maxAmount) && maxAmount !== null
          ? `Ingresá un monto entre ${formatAmount(1)} y ${formatAmount(maxAmount)}.`
          : undefined
      }
      id={id}
      label="Monto"
    >
      {({ describedBy, isInvalid }) => (
        <Input
          id={id}
          name="amount"
          inputMode="numeric"
          autoComplete="off"
          aria-describedby={describedBy}
          aria-invalid={isInvalid}
          autoFocus
          className="tabular-nums"
          disabled={isSaving}
          placeholder={
            placeholderAmount === null
              ? undefined
              : formatAmount(placeholderAmount)
          }
          value={amount}
          onChange={(event) =>
            onAmountChange(event.target.value.replace(/\D/g, ""))
          }
        />
      )}
    </SharedFieldLayout>
  );
}

/**
 * The allocation footer. `Quitar dinero` is the way into the removal shape and
 * is pushed to the far side, away from the confirming pair: it is a different
 * gesture, not a second way of saving.
 */
function AllocationFooter({
  isSaving,
  isSubmitDisabled,
  onCancel,
  onRemoveMoney,
}: {
  isSaving: boolean;
  isSubmitDisabled: boolean;
  onCancel: () => void;
  onRemoveMoney: (() => void) | null;
}) {
  return (
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
        <Button
          type="button"
          variant="outline"
          disabled={isSaving}
          onClick={onCancel}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitDisabled}>
          <SubmitIcon isSaving={isSaving} />
          Guardar
        </Button>
      </div>
    </DialogFooter>
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
  targetKind,
}: {
  inscription: InscriptionRow;
  onOpenChange: (open: boolean) => void;
  targetKind: AllocationTargetKind;
}) {
  const fetcher = useMoneyWriteFetcher(onOpenChange);
  const [amount, setAmount] = useState("");
  const isSaving = fetcher.state !== "idle";
  const isOutOfRange = isAmountOutOfRange(amount, inscription.allocatedAmount);

  return (
    <MoneyDialog
      description="El dinero que se quita vuelve al saldo disponible de la academia."
      isDirty={amount !== ""}
      isSaving={isSaving}
      onOpenChange={onOpenChange}
      title={formatDancerName(inscription)}
    >
      {(requestClose) => (
        <fetcher.Form method="post" className="flex flex-col gap-4">
          <input
            type="hidden"
            name="intent"
            value={removeInscriptionMoneyIntent}
          />
          <MoneyTargetFields
            inscription={inscription}
            targetKind={targetKind}
          />

          <FieldGroup>
            <MoneyAmountField
              amount={amount}
              id="inscription-removed-amount"
              isSaving={isSaving}
              maxAmount={inscription.allocatedAmount}
              onAmountChange={setAmount}
              placeholderAmount={inscription.allocatedAmount}
            />
          </FieldGroup>

          <FetcherError data={fetcher.data} />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isSaving}
              onClick={requestClose}
            >
              Cancelar
            </Button>
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
      )}
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
  targetKind,
}: {
  inscription: InscriptionRow;
  onOpenChange: (open: boolean) => void;
  targetKind: AllocationTargetKind;
}) {
  const fetcher = useMoneyWriteFetcher(onOpenChange);
  const isSaving = fetcher.state !== "idle";
  const excessAmount = inscription.overAllocatedAmount ?? 0;

  return (
    <MoneyDialog
      description={`Tiene ${formatAmount(excessAmount)} de más. Vuelven al saldo disponible de la academia y el resto queda como está.`}
      // Nothing is typed or picked here, so there is nothing to lose.
      isDirty={false}
      isSaving={isSaving}
      onOpenChange={onOpenChange}
      title={formatDancerName(inscription)}
    >
      {(requestClose) => (
        <fetcher.Form method="post" className="flex flex-col gap-4">
          <input
            type="hidden"
            name="intent"
            value={releaseInscriptionExcessIntent}
          />
          <MoneyTargetFields
            inscription={inscription}
            targetKind={targetKind}
          />

          <FetcherError data={fetcher.data} />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isSaving}
              onClick={requestClose}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="destructive" disabled={isSaving}>
              <SubmitIcon isSaving={isSaving} />
              Liberar {formatAmount(excessAmount)}
            </Button>
          </DialogFooter>
        </fetcher.Form>
      )}
    </MoneyDialog>
  );
}

/**
 * Why `Precio` is read-only: once the money on the inscription covers the
 * deposit, its price is fixed. Taking money off below the deposit is what
 * opens it again.
 */
function LockedPriceAlert() {
  return (
    <Alert variant="info">
      <Info aria-hidden="true" />
      <AlertTitle>Precio bloqueado</AlertTitle>
      <AlertDescription>
        El dinero asignado ya cubre la seña, así que el precio de la inscripción
        queda fijo. Para cambiarlo, quitá dinero hasta quedar por debajo de la
        seña.
      </AlertDescription>
    </Alert>
  );
}

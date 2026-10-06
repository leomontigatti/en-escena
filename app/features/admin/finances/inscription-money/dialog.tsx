/**
 * The money dialog of an inscription: one entry point — the dancer's name —
 * whose shape is decided by what the row *is*, so an administrator is never
 * shown a control that cannot apply.
 *
 * | Row                            | What opens                                    |
 * | ------------------------------ | --------------------------------------------- |
 * | over-allocated                 | Release the excess. One button, nothing else.  |
 * | waived (`Bonificada`)          | The waiver, and the way to take it off         |
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

import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import type { AllocationTargetKind } from "@/lib/finances/allocation-target.server";
import { formatAmount, formatDancerName } from "@/lib/finances/formatters";
import {
  createValidatedRouteSubmitHandler,
  useOptionalFormAction,
} from "@/lib/shared/forms";

import {
  AllocationPriceField,
  MoneyAmountField,
  moneyFormValidationMode,
  type AllocationFormValues,
  type RemovalFormValues,
} from "./dialog-fields";
import {
  MoneyDialog,
  MoneyTargetFields,
  OwedSummary,
  SubmitIcon,
  useMoneyWriteFetcher,
} from "./dialog-parts";
import {
  buildAllocationFormSchema,
  buildRemovalFormSchema,
  isAmountOutOfRange,
  readInscriptionMoneyDialogShape,
  resolveAllocationDialogFigures,
  type InscriptionRow,
  type PriceOption,
} from "./figures";
import {
  type InscriptionMoneyWaiver,
  WaivedInscriptionDialog,
  useWaiverGesture,
  WaiverBlockedDialog,
} from "./dialog-waiver";
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
  waiver = null,
}: {
  inscription: InscriptionRow;
  onOpenChange: (open: boolean) => void;
  priceOptions: PriceOption[];
  // Required rather than defaulted to `"choreography"`: the kind decides which
  // inscription table the action writes against, so an omission at a call site
  // has to fail to typecheck instead of silently allocating to the other kind.
  targetKind: AllocationTargetKind;
  waiver?: InscriptionMoneyWaiver | null;
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

  if (shape === "waived") {
    return (
      <WaivedInscriptionDialog
        inscription={inscription}
        onOpenChange={onOpenChange}
        onUnwaive={waiver?.onUnwaive ?? null}
      />
    );
  }

  if (removing) {
    return (
      <RemoveMoneyDialog
        inscription={inscription}
        isWaivable={waiver !== null}
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
      onWaive={waiver?.onWaive ?? null}
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
  onWaive,
  priceOptions,
  targetKind,
}: {
  inscription: InscriptionRow;
  onOpenChange: (open: boolean) => void;
  onRemoveMoney: (() => void) | null;
  onWaive: (() => void) | null;
  priceOptions: PriceOption[];
  targetKind: AllocationTargetKind;
}) {
  const fetcher = useMoneyWriteFetcher(onOpenChange);
  const formAction = useOptionalFormAction();
  // It starts on the **effective** price: it is the one the row behind the dialog
  // shows, and the one the figures are derived from until something else is
  // picked. Opening it on the stored price left the picker saying one thing and
  // everything else another, and confirming without touching it fixed that old
  // price as soon as the allocation covered the deposit.
  const initialPriceId = inscription.effectivePrice?.id ?? "";
  const form = useForm<AllocationFormValues>({
    defaultValues: { amount: "", priceId: initialPriceId },
    mode: moneyFormValidationMode,
    resolver: zodResolver(
      buildAllocationFormSchema({ inscription, priceOptions }),
    ),
  });
  const { getValues, trigger } = form;
  const [amount, priceId] = useWatch({
    control: form.control,
    name: ["amount", "priceId"],
  });
  const isSaving = fetcher.state !== "idle";
  // Below the threshold the price is a live choice, so every figure is
  // re-derived on each change rather than read off the loader.
  const { hintedAmount, isPriceLocked, ...owed } =
    resolveAllocationDialogFigures({ inscription, priceId, priceOptions });
  // The ceiling is what the inscription owes, which is what the server refuses
  // against. The academy's pool is another ceiling, and that one is not known
  // here: it stays an alert.
  const owedBalanceAmount = owed.owedBalanceAmount;
  const holdsMoney = inscription.allocatedAmount > 0;
  const isSubmitDisabled =
    isSaving ||
    amount === "" ||
    isAmountOutOfRange(amount, owedBalanceAmount) ||
    (!isPriceLocked && priceOptions.length === 0);
  const { blockedDialog, waive } = useWaiverGesture({
    allocatedAmount: inscription.allocatedAmount,
    onWaive,
  });

  // A pick moves the ceiling, so a typed amount is read against the new one.
  useEffect(() => {
    if (getValues("amount") !== "") {
      void trigger("amount");
    }
  }, [getValues, priceId, trigger]);

  return (
    <MoneyDialog
      description="El dinero se asigna desde el saldo disponible de la academia."
      isDirty={form.formState.isDirty}
      isSaving={isSaving}
      onOpenChange={onOpenChange}
      title={formatDancerName(inscription)}
    >
      {(requestClose) => (
        <form
          method="post"
          noValidate
          onSubmit={createValidatedRouteSubmitHandler(
            form,
            fetcher.submit,
            formAction,
          )}
          className="flex flex-col gap-4"
        >
          <input
            type="hidden"
            name="intent"
            value={allocateInscriptionIntent}
          />
          <WaiverBlockedDialog
            allocatedAmount={inscription.allocatedAmount}
            {...blockedDialog}
          />
          {isPriceLocked ? <LockedPriceAlert /> : null}

          <MoneyTargetFields
            inscription={inscription}
            targetKind={targetKind}
          />

          <FieldGroup>
            <AllocationPriceField
              control={form.control}
              effectivePrice={inscription.effectivePrice}
              isLocked={isPriceLocked}
              isSaving={isSaving}
              priceOptions={priceOptions}
            />

            <MoneyAmountField
              control={form.control}
              id="inscription-amount"
              isSaving={isSaving}
              name="amount"
              placeholderAmount={hintedAmount}
            />
          </FieldGroup>

          {/* The two owed figures only once there is money on it: on an empty
            inscription they restate the price sitting right above. */}
          {holdsMoney ? <OwedSummary owed={owed} /> : null}

          <AllocationFooter
            isSaving={isSaving}
            isSubmitDisabled={isSubmitDisabled}
            onCancel={requestClose}
            onRemoveMoney={onRemoveMoney}
            onWaive={waive}
          />
        </form>
      )}
    </MoneyDialog>
  );
}

/**
 * The allocation footer. `Quitar dinero` and `Bonificar` are pushed to the far
 * side, away from the confirming pair: they are different gestures, not second
 * ways of saving.
 */
function AllocationFooter({
  isSaving,
  isSubmitDisabled,
  onCancel,
  onRemoveMoney,
  onWaive,
}: {
  isSaving: boolean;
  isSubmitDisabled: boolean;
  onCancel: () => void;
  onRemoveMoney: (() => void) | null;
  onWaive: (() => void) | null;
}) {
  const hasSideGestures = onRemoveMoney !== null || onWaive !== null;

  return (
    <DialogFooter className={hasSideGestures ? "sm:justify-between" : ""}>
      {hasSideGestures ? (
        <div className="flex gap-2">
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
          {onWaive ? (
            <Button
              type="button"
              variant="outline"
              disabled={isSaving}
              onClick={onWaive}
            >
              Bonificar
            </Button>
          ) : null}
        </div>
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
  isWaivable,
  onOpenChange,
  targetKind,
}: {
  inscription: InscriptionRow;
  /** Whether the row could be waived once its money is off (ADR-0017). */
  isWaivable: boolean;
  onOpenChange: (open: boolean) => void;
  targetKind: AllocationTargetKind;
}) {
  const fetcher = useMoneyWriteFetcher(onOpenChange);
  const formAction = useOptionalFormAction();
  const form = useForm<RemovalFormValues>({
    defaultValues: { amount: "" },
    mode: moneyFormValidationMode,
    resolver: zodResolver(buildRemovalFormSchema(inscription.allocatedAmount)),
  });
  const amount = useWatch({ control: form.control, name: "amount" });
  const isSaving = fetcher.state !== "idle";
  const isOutOfRange = isAmountOutOfRange(amount, inscription.allocatedAmount);
  const [isWaiverBlockedOpen, setIsWaiverBlockedOpen] = useState(false);

  return (
    <MoneyDialog
      description="El dinero que se quita vuelve al saldo disponible de la academia."
      isDirty={form.formState.isDirty}
      isSaving={isSaving}
      onOpenChange={onOpenChange}
      title={formatDancerName(inscription)}
    >
      {(requestClose) => (
        <form
          method="post"
          noValidate
          onSubmit={createValidatedRouteSubmitHandler(
            form,
            fetcher.submit,
            formAction,
          )}
          className="flex flex-col gap-4"
        >
          <input
            type="hidden"
            name="intent"
            value={removeInscriptionMoneyIntent}
          />
          {isWaivable ? (
            <WaiverBlockedDialog
              allocatedAmount={inscription.allocatedAmount}
              onOpenChange={setIsWaiverBlockedOpen}
              open={isWaiverBlockedOpen}
            />
          ) : null}
          <MoneyTargetFields
            inscription={inscription}
            targetKind={targetKind}
          />

          <FieldGroup>
            <MoneyAmountField
              control={form.control}
              id="inscription-removed-amount"
              isSaving={isSaving}
              name="amount"
              placeholderAmount={inscription.allocatedAmount}
            />
          </FieldGroup>

          <DialogFooter className={isWaivable ? "sm:justify-between" : ""}>
            {/* This shape only opens on a row with money, so `Bonificar` always
                answers with the acknowledgment: taking the money off is what
                this shape is for. */}
            {isWaivable ? (
              <Button
                type="button"
                variant="outline"
                disabled={isSaving}
                onClick={() => setIsWaiverBlockedOpen(true)}
              >
                Bonificar
              </Button>
            ) : null}
            <div className="flex gap-2">
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
            </div>
          </DialogFooter>
        </form>
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
  const formAction = useOptionalFormAction();
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
        <form
          method="post"
          onSubmit={(event) => {
            event.preventDefault();
            void fetcher.submit(event.currentTarget, {
              action: formAction,
              method: "post",
            });
          }}
          className="flex flex-col gap-4"
        >
          <input
            type="hidden"
            name="intent"
            value={releaseInscriptionExcessIntent}
          />
          <MoneyTargetFields
            inscription={inscription}
            targetKind={targetKind}
          />

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
        </form>
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

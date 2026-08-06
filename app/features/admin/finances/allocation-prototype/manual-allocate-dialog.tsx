/**
 * THROWAWAY PROTOTYPE — ticket #550's escape hatch, reshaped by #585.
 *
 * **One entry point, five dialogs.** The dancer's name always opens "the money
 * dialog", but what it offers is decided by what the row *is*, so the admin is
 * never shown a control that cannot apply:
 *
 * | Row                              | What opens                                  |
 * | -------------------------------- | ------------------------------------------- |
 * | `Sobreasignada`                  | Release the excess. Nothing else.           |
 * | `Pagada`                         | Remove everything. Nothing else.            |
 * | `Seña pendiente`, no money       | Price picker + amount, hinting the seña     |
 * | `Seña pendiente`, with money     | Price **locked** + amount, hinting the seña |
 * | `Señada`                         | Price **locked** + amount, hinting the rest |
 *
 * The removal cases carry **no price control at all** — not even locked. On a
 * row whose money is leaving, the price is not the question, and the way to
 * change it is precisely to take the money off first.
 *
 * **There is no payment picker**, in either direction: the admin names an
 * inscription and an amount, `spreadFromPool` consumes payments oldest-first and
 * `unwindToPool` unwinds them newest-first (#549, #553).
 */
import { useState } from "react";

import { ReadOnlyField } from "@/components/shared/read-only-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { formatAmount } from "../formatters";
import {
  readMoneyDialogShape,
  readPriceLock,
  readSuggestedAmount,
  type AllocationRejection,
} from "./allocation-rules";
import type { InscriptionReading, PrototypeState } from "./fixtures";
import { PriceSelect } from "./price-select";

export function ManualAllocateDialog({
  inscription,
  state,
  choreographyGroupType,
  onClose,
  onSelectPrice,
  onAllocate,
  onDeallocate,
}: {
  inscription: InscriptionReading | null;
  state: PrototypeState;
  choreographyGroupType: string;
  onClose: () => void;
  onSelectPrice: (inscriptionId: string, priceId: string) => void;
  onAllocate: (
    inscriptionId: string,
    amount: number,
  ) => AllocationRejection | null;
  onDeallocate: (inscriptionId: string, amount: number) => void;
}) {
  if (inscription === null) {
    return null;
  }

  const shape = readMoneyDialogShape(inscription);

  if (shape === "releaseExcess") {
    return (
      <RemoveDialog
        inscription={inscription}
        amount={inscription.excessAmount}
        title="Liberar el excedente"
        description={
          inscription.withdrawnAt === null
            ? `${inscription.dancerName} tiene ${formatAmount(inscription.excessAmount)} de más. Vuelven al saldo disponible de la academia; el resto queda como está.`
            : `${inscription.dancerName} está dada de baja y todavía tiene ${formatAmount(inscription.allocatedAmount)} asignados. Vuelven al saldo disponible de la academia.`
        }
        confirmLabel={`Liberar ${formatAmount(inscription.excessAmount)}`}
        onClose={onClose}
        onDeallocate={onDeallocate}
      />
    );
  }

  if (shape === "releaseAll") {
    return (
      <RemoveDialog
        inscription={inscription}
        amount={inscription.allocatedAmount}
        title="Quitar la plata de la inscripción"
        description={`${inscription.dancerName} está pagada. Se le quitan los ${formatAmount(inscription.allocatedAmount)} asignados y vuelven al saldo disponible de la academia.`}
        confirmLabel={`Quitar ${formatAmount(inscription.allocatedAmount)}`}
        onClose={onClose}
        onDeallocate={onDeallocate}
      />
    );
  }

  return (
    <AllocateDialog
      inscription={inscription}
      state={state}
      choreographyGroupType={choreographyGroupType}
      onClose={onClose}
      onSelectPrice={onSelectPrice}
      onAllocate={onAllocate}
    />
  );
}

/**
 * Cases 3 to 5. The price control is the only thing that varies: free while no
 * money has landed, locked afterwards (#553 — the lock is keyed on money, and it
 * opens the instant the money leaves).
 *
 * The amount's **placeholder is the amount that finishes the next thing**: the
 * seña while the threshold is unmet, the rest once it is met. A placeholder
 * rather than a default, because typing over a pre-filled figure is worse than
 * typing into an empty box, and because the figure moves — the discount is live,
 * so the ceiling can change while the dialog is open.
 */
function AllocateDialog({
  inscription,
  state,
  choreographyGroupType,
  onClose,
  onSelectPrice,
  onAllocate,
}: {
  inscription: InscriptionReading;
  state: PrototypeState;
  choreographyGroupType: string;
  onClose: () => void;
  onSelectPrice: (inscriptionId: string, priceId: string) => void;
  onAllocate: (
    inscriptionId: string,
    amount: number,
  ) => AllocationRejection | null;
}) {
  const [amount, setAmount] = useState("");
  const [rejection, setRejection] = useState<AllocationRejection | null>(null);
  const lock = readPriceLock(inscription);
  const suggested = readSuggestedAmount(inscription);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Asignación individual · {inscription.dancerName}
          </DialogTitle>
          <DialogDescription>
            Podés elegir el precio para la inscripción y agregar pagos.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          {lock.isLocked ? (
            <div className="flex flex-col gap-1.5">
              <ReadOnlyField
                label="Precio"
                value={`${inscription.priceName} · ${formatAmount(inscription.priceAmount)}`}
              />
              <p className="text-xs text-muted-foreground">
                {lock.lockedReason}
              </p>
            </div>
          ) : (
            <Field>
              <FieldLabel htmlFor="precio">Precio</FieldLabel>
              <PriceSelect
                id="precio"
                inscription={inscription}
                state={state}
                choreographyGroupType={choreographyGroupType}
                onSelectPrice={onSelectPrice}
              />
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="monto">Monto</FieldLabel>
            <Input
              id="monto"
              inputMode="numeric"
              className="tabular-nums"
              placeholder={formatAmount(suggested)}
              value={amount}
              onChange={(event) =>
                setAmount(event.target.value.replace(/\D/g, ""))
              }
            />
          </Field>
          {rejection !== null ? (
            <Alert variant="destructive">
              <AlertDescription>{rejection.message}</AlertDescription>
            </Alert>
          ) : null}
        </FieldGroup>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={amount === ""}
            onClick={() => {
              const next = onAllocate(inscription.id, Number(amount));
              setRejection(next);

              // The refusal keeps the dialog open with the amount still typed:
              // #549 rejects on the write path, and the admin has to see what
              // the figure actually allows before retrying.
              if (next === null) {
                setAmount("");
                onClose();
              }
            }}
          >
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Cases 1 and 2 — #553's dialog B shape, generalised: **the amount is decided by
 * the rule, so there is nothing to type and nothing to pick**. One sentence
 * saying what leaves and where it goes, and one button.
 *
 * #553 decision 4: the consequence is shown **only when the removal crosses a
 * threshold downward**. Releasing an excess usually crosses nothing and says
 * nothing; emptying a `Pagada` row always does.
 */
function RemoveDialog({
  inscription,
  amount,
  title,
  description,
  confirmLabel,
  onClose,
  onDeallocate,
}: {
  inscription: InscriptionReading;
  amount: number;
  title: string;
  description: string;
  confirmLabel: string;
  onClose: () => void;
  onDeallocate: (inscriptionId: string, amount: number) => void;
}) {
  const remaining = inscription.allocatedAmount - amount;
  const crossesDown =
    remaining < inscription.depositAmount &&
    inscription.allocatedAmount >= inscription.depositAmount &&
    inscription.depositAmount > 0;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {title} · {inscription.dancerName}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {crossesDown ? (
          <Alert>
            <AlertDescription>
              Vuelve a quedar en «Seña pendiente», con{" "}
              {formatAmount(inscription.depositAmount - remaining)} de seña
              adeudada.
            </AlertDescription>
          </Alert>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              onDeallocate(inscription.id, amount);
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// PROTOTYPE — throwaway, lives only on branch `prototype/890-seminar-money-admin`.
//
// Part of the admin seminar-money prototype for wayfinder ticket #890 (map #884):
// the seminar money dialog.
import { AlertTriangle, Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
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
import { formatAmount } from "@/lib/finances/formatters";
import {
  amountForKind,
  depositFor,
  formatKindLabel,
  formatTierLabel,
  type SeminarInscriptionFigures,
  type SeminarTier,
} from "@/features/admin/seminars/prototype/seminar-money-fixtures.prototype";

type Record = (entry: string) => void;

/**
 * The seminar twin of `InscriptionMoneyDialog`, allocate shape and remove shape
 * only (the release-excess shape is identical and left out). The picker offers
 * tiers, never kinds: the kind is derived from the `Participando` predicate when
 * the dialog opens and sits beside the picker as the `Precio aplicado` readout;
 * once the row is covered both are readouts (#887). The refusal order is the one #888 fixed — no
 * price, over-allocation, quota, pool — and the quota refusal lands as the
 * dialog's alert, with the words that ticket chose.
 */
export function SeminarMoneyDialog({
  availableBalanceAmount,
  inscription,
  isFull,
  onOpenChange,
  rate,
  record,
  tiers,
}: {
  availableBalanceAmount: number;
  inscription: SeminarInscriptionFigures;
  isFull: boolean;
  onOpenChange: (open: boolean) => void;
  rate: number;
  record: Record;
  tiers: SeminarTier[];
}) {
  const opensOnRemoval =
    inscription.withdrawn ||
    (inscription.owedBalanceAmount === 0 && inscription.allocatedAmount > 0);
  const [isRemoving, setIsRemoving] = useState(opensOnRemoval);
  const [amount, setAmount] = useState("");
  const [tierId, setTierId] = useState(inscription.tier?.id ?? "");
  const [refusal, setRefusal] = useState<string | null>(null);
  const isLocked = inscription.covered;
  const pickedTier = isLocked
    ? inscription.tier
    : (tiers.find((tier) => tier.id === tierId) ?? null);
  const pickedTotal = pickedTier
    ? amountForKind(pickedTier, inscription.kind)
    : null;
  const pickedDeposit =
    pickedTotal === null ? null : depositFor(pickedTotal, rate);
  const owedDeposit =
    pickedDeposit === null
      ? null
      : Math.max(pickedDeposit - inscription.allocatedAmount, 0);
  const owedBalance =
    pickedTotal === null
      ? null
      : Math.max(pickedTotal - inscription.allocatedAmount, 0);
  const maxAmount = isRemoving ? inscription.allocatedAmount : owedBalance;
  const isOutOfRange =
    amount !== "" &&
    maxAmount !== null &&
    (Number(amount) < 1 || Number(amount) > maxAmount);

  function formatTierOption(tier: SeminarTier) {
    const total = amountForKind(tier, inscription.kind);
    return `${formatTierLabel(tier)} — ${formatAmount(total)} · Seña ${formatAmount(depositFor(total, rate))}`;
  }

  function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number(amount);

    if (isRemoving) {
      toast.success("Prototipo: se habría quitado el dinero.");
      record(
        `Quitar dinero → ${JSON.stringify({ inscription: inscription.id, amount: value })}`,
      );
      onOpenChange(false);
      return;
    }

    const after = inscription.allocatedAmount + value;
    const wouldCross =
      pickedDeposit !== null &&
      inscription.allocatedAmount < pickedDeposit &&
      after >= pickedDeposit;

    if (isFull && wouldCross) {
      setRefusal(
        "No quedan lugares en el seminario, así que esta inscripción no puede cubrir su seña.",
      );
      return;
    }

    if (value > availableBalanceAmount) {
      setRefusal(
        `La academia no tiene saldo disponible suficiente: tiene ${formatAmount(availableBalanceAmount)}.`,
      );
      return;
    }

    toast.success("Prototipo: se habría asignado el dinero.");
    record(
      `Asignar → ${JSON.stringify({
        inscription: inscription.id,
        amount: value,
        selectedPriceId: pickedTier?.id,
        selectedAmountKind: inscription.kind,
        takesPlace: wouldCross,
      })}`,
    );
    onOpenChange(false);
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{inscription.fullName}</DialogTitle>
          <DialogDescription>
            {isRemoving
              ? "El dinero vuelve al saldo disponible de la academia."
              : "El dinero se asigna desde el saldo disponible de la academia."}
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" noValidate onSubmit={submit}>
          <FieldGroup>
            {isRemoving ? (
              <ReadOnlyField
                label="Asignado"
                value={formatAmount(inscription.allocatedAmount)}
              />
            ) : (
              <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                {isLocked && inscription.tier ? (
                  <ReadOnlyField
                    label="Precio"
                    value={formatTierOption(inscription.tier)}
                  />
                ) : (
                  <Field>
                    <FieldLabel htmlFor="prototype-seminar-price">
                      Precio
                    </FieldLabel>
                    <Select
                      value={tierId}
                      onValueChange={setTierId}
                      disabled={tiers.length === 0}
                    >
                      <SelectTrigger
                        id="prototype-seminar-price"
                        className="w-full"
                      >
                        <SelectValue placeholder="Elegí un precio" />
                      </SelectTrigger>
                      <SelectContent>
                        {tiers.map((tier) => (
                          <SelectItem key={tier.id} value={tier.id}>
                            {formatTierOption(tier)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
                <ReadOnlyField
                  label="Precio aplicado"
                  value={formatKindLabel(inscription.kind)}
                />
              </div>
            )}

            <SharedFieldLayout
              error={
                isOutOfRange && maxAmount !== null
                  ? `Ingresá un monto entre ${formatAmount(1)} y ${formatAmount(maxAmount)}.`
                  : undefined
              }
              id="prototype-seminar-amount"
              label="Monto"
            >
              {({ describedBy, isInvalid }) => (
                <Input
                  id="prototype-seminar-amount"
                  inputMode="numeric"
                  autoComplete="off"
                  aria-describedby={describedBy}
                  aria-invalid={isInvalid}
                  autoFocus
                  className="tabular-nums"
                  placeholder={
                    isRemoving
                      ? formatAmount(inscription.allocatedAmount)
                      : owedDeposit !== null && owedDeposit > 0
                        ? formatAmount(owedDeposit)
                        : owedBalance !== null
                          ? formatAmount(owedBalance)
                          : undefined
                  }
                  value={amount}
                  onChange={(event) => {
                    setRefusal(null);
                    setAmount(event.target.value.replace(/\D/g, ""));
                  }}
                />
              )}
            </SharedFieldLayout>
          </FieldGroup>

          {!isRemoving && inscription.allocatedAmount > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <ReadOnlyField
                label="Seña adeudada"
                value={owedDeposit === null ? "—" : formatAmount(owedDeposit)}
              />
              <ReadOnlyField
                label="Saldo adeudado"
                value={owedBalance === null ? "—" : formatAmount(owedBalance)}
              />
            </div>
          ) : null}

          {tiers.length === 0 && !isRemoving ? (
            <Alert variant="warning">
              <AlertTriangle aria-hidden="true" />
              <AlertDescription>
                Este seminario no tiene precios: cargalos en el seminario antes
                de asignar dinero.
              </AlertDescription>
            </Alert>
          ) : null}

          {refusal ? (
            <Alert variant="destructive">
              <AlertTriangle aria-hidden="true" />
              <AlertDescription>{refusal}</AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter
            className={
              !isRemoving && inscription.allocatedAmount > 0
                ? "sm:justify-between"
                : ""
            }
          >
            {!isRemoving && inscription.allocatedAmount > 0 ? (
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  setAmount("");
                  setRefusal(null);
                  setIsRemoving(true);
                }}
              >
                Quitar dinero
              </Button>
            ) : null}
            <div className="flex gap-2">
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cancelar
                </Button>
              </DialogClose>
              <Button
                type="submit"
                variant={isRemoving ? "destructive" : "default"}
                disabled={
                  amount === "" ||
                  isOutOfRange ||
                  (!isRemoving && pickedTier === null)
                }
              >
                <Check aria-hidden="true" data-icon="inline-start" />
                {isRemoving ? "Quitar dinero" : "Guardar"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

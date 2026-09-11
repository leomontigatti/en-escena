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
  depositFor,
  formatSeminarKindLabel,
  formatSeminarPriceDeadline,
  listPickableSeminarPrices,
  type SeminarInscriptionFigures,
  type SeminarKind,
  type SeminarPriceRow,
} from "@/features/admin/seminars/prototype/seminar-money-fixtures.prototype";

type Record = (entry: string) => void;

/**
 * The seminar twin of `InscriptionMoneyDialog`, allocate shape and remove shape
 * only (the release-excess shape is identical and left out). The picker offers
 * the event rows of the seminar's kind and then the `Común` ones, for the
 * person's `Participando` state when the dialog opens, with no date filter
 * (#904). That state sits beside the picker as a readout; once the row is
 * covered the stored row freezes both, and the readout reads the row, not the
 * predicate. The only write is `selectedPriceId`. The refusal order is the one
 * #888 fixed — no price, over-allocation, quota, pool — and the quota refusal
 * lands as the dialog's alert, with the words that ticket chose.
 */
export function SeminarMoneyDialog({
  availableBalanceAmount,
  inscription,
  isFull,
  onOpenChange,
  prices,
  rate,
  record,
  seminarKind,
}: {
  availableBalanceAmount: number;
  inscription: SeminarInscriptionFigures;
  isFull: boolean;
  onOpenChange: (open: boolean) => void;
  prices: SeminarPriceRow[];
  rate: number;
  record: Record;
  seminarKind: SeminarKind;
}) {
  const opensOnRemoval =
    inscription.withdrawn ||
    (inscription.owedBalanceAmount === 0 && inscription.allocatedAmount > 0);
  const [isRemoving, setIsRemoving] = useState(opensOnRemoval);
  const [amount, setAmount] = useState("");
  const [priceId, setPriceId] = useState(inscription.price?.id ?? "");
  const [refusal, setRefusal] = useState<string | null>(null);
  const isLocked = inscription.covered;
  const candidates = listPickableSeminarPrices(
    prices,
    seminarKind,
    inscription.participating,
  );
  const pickedPrice = isLocked
    ? inscription.price
    : (candidates.find((price) => price.id === priceId) ?? null);
  const pickedTotal = pickedPrice?.amount ?? null;
  const participatingReadout =
    isLocked && inscription.price
      ? inscription.price.forParticipants
      : inscription.participating;
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

  function formatPriceOption(price: SeminarPriceRow) {
    return `${formatSeminarPriceDeadline(price)} · ${formatSeminarKindLabel(price.kind)} — ${formatAmount(price.amount)} · Seña ${formatAmount(depositFor(price.amount, rate))}`;
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
        selectedPriceId: pickedPrice?.id,
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
                {isLocked && inscription.price ? (
                  <ReadOnlyField
                    label="Precio"
                    value={formatPriceOption(inscription.price)}
                  />
                ) : (
                  <Field>
                    <FieldLabel htmlFor="prototype-seminar-price">
                      Precio
                    </FieldLabel>
                    <Select value={priceId} onValueChange={setPriceId}>
                      <SelectTrigger
                        id="prototype-seminar-price"
                        className="w-full"
                      >
                        <SelectValue placeholder="Elegí un precio" />
                      </SelectTrigger>
                      <SelectContent>
                        {candidates.map((price) => (
                          <SelectItem key={price.id} value={price.id}>
                            {formatPriceOption(price)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
                <ReadOnlyField
                  label="Participando"
                  value={participatingReadout ? "Sí" : "No"}
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
                  (!isRemoving && pickedPrice === null)
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

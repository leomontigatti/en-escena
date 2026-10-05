/**
 * The parts the three shapes of the inscription money dialog share: its
 * chrome, the fetcher they write with, and the small pieces they each render.
 */

import { Check } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useFetcher } from "react-router";

import {
  DiscardChangesDialog,
  useDiscardGuard,
} from "@/components/shared/discard-guard";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import type { AllocationTargetKind } from "@/lib/finances/allocation-target.server";
import { useServerActionToast } from "@/lib/shared/toasts";

import {
  formatOwedAmount,
  type InscriptionRow,
  type OwedAgainstPrice,
} from "./figures";
import { targetKindFieldName } from "./intents";

const inscriptionMoneyRefusalToastId = "inscription-money:refusal";

/**
 * What every shape submits besides its intent: which inscription, and of which
 * kind. The kind is a field rather than something the action infers from its own
 * route because the dialog is shared, and a shared control that leaves half its
 * meaning to the caller's URL is one refactor away from posting to the wrong
 * writer.
 */
export function MoneyTargetFields({
  inscription,
  targetKind,
}: {
  inscription: InscriptionRow;
  targetKind: AllocationTargetKind;
}) {
  return (
    <>
      <input
        type="hidden"
        name="inscriptionId"
        value={inscription.inscriptionId ?? ""}
      />
      <input type="hidden" name={targetKindFieldName} value={targetKind} />
    </>
  );
}

/**
 * The fetcher the three shapes write with, and the one rule about when the
 * dialog goes away: **only a write that went through closes it.** A refusal
 * comes back as a message in `fetcher.data`, which is toasted, and the dialog
 * stays open under it with what was typed: closing it on top of the refusal
 * threw that away (#708).
 *
 * The refusal is read off `data.status`, not off the mere presence of `data`.
 * Today the action redirects once it has written and so brings nothing back,
 * which makes the two tests equivalent — but that is a deviation from the
 * dialog-write row of `docs/agents/form-feedback.md`, which expects the result
 * to come back from `fetcher.data`. Keying off presence would make the dialog
 * silently stop closing the day the action is aligned to the matrix.
 *
 * A write is counted when the promise of its `submit` settles, which is once
 * the action and the revalidation after it are done, rather than read off the
 * fetcher's state: a write that settles before the dialog renders it as
 * pending would otherwise never be seen to have happened. Every shape posts
 * through the `submit` returned here for that reason.
 */
export function useMoneyWriteFetcher(onOpenChange: (open: boolean) => void) {
  const fetcher = useFetcher<{ status: "error"; message: string }>();
  const isRefused = fetcher.data?.status === "error";
  const [settledWrites, setSettledWrites] = useState(0);
  const answeredWrites = useRef(0);
  const { submit: submitFetcher } = fetcher;

  useServerActionToast(isRefused ? fetcher.data : undefined, {
    toastId: inscriptionMoneyRefusalToastId,
  });

  useEffect(() => {
    if (settledWrites === answeredWrites.current) {
      return;
    }

    answeredWrites.current = settledWrites;

    if (!isRefused) {
      onOpenChange(false);
    }
  }, [isRefused, onOpenChange, settledWrites]);

  const submit = useCallback<typeof submitFetcher>(
    async (target, options) => {
      await submitFetcher(target, options);
      setSettledWrites((count) => count + 1);
    },
    [submitFetcher],
  );

  return { data: fetcher.data, state: fetcher.state, submit };
}

/**
 * The chrome the three shapes share, so only their contents differ. Every way
 * out but a write that went through asks first when something was typed or
 * picked, so the footer's `Cancelar` comes from here as `requestClose`.
 */
export function MoneyDialog({
  children,
  description,
  isDirty,
  isSaving,
  onOpenChange,
  title,
}: {
  children: (requestClose: () => void) => ReactNode;
  description: string;
  isDirty: boolean;
  isSaving: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
}) {
  const { discardDialogProps, requestClose } = useDiscardGuard({
    isAudioDirty: false,
    isFormDirty: isDirty,
    onClose: () => onOpenChange(false),
  });

  return (
    <>
      <Dialog
        open
        onOpenChange={(next) => {
          if (isSaving) {
            return;
          }

          if (next) {
            onOpenChange(true);
          } else {
            requestClose();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {children(requestClose)}
        </DialogContent>
      </Dialog>
      <DiscardChangesDialog {...discardDialogProps} />
    </>
  );
}

/**
 * What the inscription owes, deposit first and balance second — the order the money
 * is meant to travel in, and the reason the amount field hints the deposit while
 * that threshold is unmet.
 */
export function OwedSummary({ owed }: { owed: OwedAgainstPrice }) {
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

export function SubmitIcon({ isSaving }: { isSaving: boolean }) {
  return isSaving ? (
    <Spinner aria-hidden="true" data-icon="inline-start" />
  ) : (
    <Check aria-hidden="true" data-icon="inline-start" />
  );
}

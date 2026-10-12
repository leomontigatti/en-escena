import { Check, TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import { useFetcher } from "react-router";

import { AlertStack } from "@/components/shared/alert-stack";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Spinner } from "@/components/ui/spinner";
import type { CobroStage } from "@/lib/finances/choreography-cobro-presets.server";
import { formatAmount, formatDate } from "@/lib/finances/formatters";
import type { OperationalFinanceAmount } from "@/lib/finances/operational-summary";
import type { SeminarCobroPreview } from "@/lib/finances/seminar-cobro-presets.server";
import {
  countSeminarPlacesLeft,
  countSeminarPlacesShort,
  seminarPlacesShortMessage,
} from "@/lib/seminars/seminar-places";
import { useOptionalFormAction } from "@/lib/shared/forms";
import { useServerActionToast } from "@/lib/shared/toasts";

import {
  isPresetBalanceShort,
  PresetBalanceShortAlert,
  PresetTotals,
} from "./preset-dialog";
import {
  financePresetIntent,
  financePresetLabels,
  seminarIdFieldName,
} from "./presets";
import type { AcademyFinancesActionData } from "./server";

/**
 * The preset dialog over the selected `(seminar, academy)` rows. It has nothing
 * to ask: every active inscription of the academy in those seminars is charged
 * what it owes for the stage, at the price it holds or, when it holds none, the
 * one that applies to the person today. So it posts the stage and the seminars,
 * and the server recomputes the rest.
 *
 * **What it shows is the write's own plan** (`readSeminarCobroPreviews`): per
 * seminar, the people the charge reaches with the price they will hold and the
 * amount, and the places it takes against the places left. When it can already
 * see the charge failing — a seminar short of places, or more owed than
 * `Saldo disponible` — `Asignar` is disabled and the reason is stated. The
 * server makes the same checks as the last word, for a state that moved after
 * the dialog opened.
 *
 * Every answer of the submit toasts, as `form-feedback.md` says and the
 * choreography preset does. A refusal keeps the dialog open, so the
 * administrator can deselect or cancel; the loader revalidates, so the warnings
 * above restate a refusal the new state explains. A success closes the dialog
 * over the list the loader has just revalidated.
 */
export function SeminarPresetDialog({
  availableBalanceAmount,
  onOpenChange,
  previews,
  selectedSeminarIds,
  stage,
}: {
  availableBalanceAmount: number;
  onOpenChange: (open: boolean) => void;
  previews: Record<string, SeminarCobroPreview>;
  selectedSeminarIds: string[];
  stage: CobroStage;
}) {
  const fetcher = useFetcher<AcademyFinancesActionData>();
  const formAction = useOptionalFormAction();
  const isSaving = fetcher.state !== "idle";
  const summary = summarizeSeminarPreset({
    availableBalanceAmount,
    previews,
    selectedSeminarIds,
    stage,
  });
  const isBlocked = summary.shortfalls.length > 0 || summary.isBalanceShort;

  useServerActionToast(fetcher.data);

  const isDone = fetcher.data?.status === "success";

  useEffect(() => {
    if (isDone) {
      onOpenChange(false);
    }
  }, [isDone, onOpenChange]);

  return (
    <Dialog open onOpenChange={(next) => !isSaving && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{financePresetLabels[stage]}</DialogTitle>
          <DialogDescription>
            {selectedSeminarIds.length === 1
              ? "1 seminario elegido."
              : `${selectedSeminarIds.length} seminarios elegidos.`}{" "}
            Sale del saldo disponible de la academia y se asigna a cada
            inscripción activa lo que adeuda. Las que no tienen precio toman el
            que les corresponde hoy; las que ya tienen uno lo conservan.
          </DialogDescription>
        </DialogHeader>

        <fetcher.Form
          action={formAction}
          method="post"
          className="flex flex-col gap-4"
        >
          <input
            type="hidden"
            name="intent"
            value={financePresetIntent(stage, "seminars")}
          />
          {selectedSeminarIds.map((seminarId) => (
            <input
              key={seminarId}
              type="hidden"
              name={seminarIdFieldName}
              value={seminarId}
            />
          ))}

          <div className="flex max-h-96 flex-col gap-3 overflow-y-auto">
            {summary.seminars.map((seminar) => (
              <SeminarPresetSummary
                key={seminar.seminarId}
                seminar={seminar}
                stage={stage}
              />
            ))}
          </div>

          <PresetTotals
            availableBalanceAmount={availableBalanceAmount}
            owedAmount={summary.owedAmount}
            stage={stage}
          />

          <AlertStack>
            {summary.shortfalls.length > 0 ? (
              <Alert variant="warning">
                <TriangleAlert aria-hidden="true" />
                <AlertTitle>No alcanzan los lugares</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc pl-4">
                    {summary.shortfalls.map((shortfall) => (
                      <li key={shortfall.seminarId}>
                        {seminarPlacesShortMessage([shortfall])}
                      </li>
                    ))}
                  </ul>
                  Sacá ese seminario de la selección o liberá lugares antes de
                  asignar.
                </AlertDescription>
              </Alert>
            ) : null}
            {summary.isBalanceShort ? (
              <PresetBalanceShortAlert
                availableBalanceAmount={availableBalanceAmount}
                owedAmount={summary.owedAmount}
              />
            ) : null}
          </AlertStack>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isSaving}>
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isSaving || isBlocked}>
              {isSaving ? (
                <Spinner aria-hidden="true" data-icon="inline-start" />
              ) : (
                <Check aria-hidden="true" data-icon="inline-start" />
              )}
              Asignar
            </Button>
          </DialogFooter>
        </fetcher.Form>
      </DialogContent>
    </Dialog>
  );
}

type SeminarPresetSummaryRow = SeminarCobroPreview["stages"][CobroStage] &
  Pick<
    SeminarCobroPreview,
    "instructorName" | "scheduledDate" | "seminarId"
  > & { placesLeft: number; shortBy: number };

/**
 * One seminar of the selection: who the charge reaches, at which price and for
 * how much, and the places it takes against the places left.
 */
function SeminarPresetSummary({
  seminar,
  stage,
}: {
  seminar: SeminarPresetSummaryRow;
  stage: CobroStage;
}) {
  return (
    <section className="flex flex-col gap-2 rounded-md border px-3 py-2">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-medium">
          {seminar.instructorName} · {formatDate(seminar.scheduledDate)}
        </h3>
        <p className="text-xs text-muted-foreground">
          {`Lugares libres: ${seminar.placesLeft} · Ocupa: ${seminar.neededCount}`}
        </p>
      </div>
      {seminar.people.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {stage === "deposit"
            ? "Nadie adeuda seña en este seminario."
            : "Nadie adeuda saldo en este seminario."}
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {seminar.people.map((person) => (
            <li
              key={person.inscriptionId}
              className="flex items-baseline justify-between gap-3 text-sm"
            >
              <span className="flex flex-col">
                <span>{person.personName}</span>
                <span className="text-xs text-muted-foreground">
                  {person.priceName ?? "Sin precio"}
                </span>
              </span>
              <span className="tabular-nums">
                {person.amount === null
                  ? "Pendiente"
                  : formatAmount(person.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The selection read off the write's plan: the seminars in the list's order of
 * selection, the owed figure summed from the people it reaches, the seminars
 * short of places, and whether `Saldo disponible` falls short of the owed
 * figure. The place count is the write's own (`countSeminarPlacesShort`).
 */
function summarizeSeminarPreset(input: {
  availableBalanceAmount: number;
  previews: Record<string, SeminarCobroPreview>;
  selectedSeminarIds: string[];
  stage: CobroStage;
}) {
  const seminars: SeminarPresetSummaryRow[] = input.selectedSeminarIds.flatMap(
    (seminarId) => {
      const preview = input.previews[seminarId];

      return preview
        ? [
            {
              ...preview.stages[input.stage],
              instructorName: preview.instructorName,
              placesLeft: countSeminarPlacesLeft({
                coveredCount: preview.coveredCount,
                quota: preview.quota,
                reservedCount: preview.stages[input.stage].reservedCount,
              }),
              scheduledDate: preview.scheduledDate,
              seminarId,
              shortBy: countSeminarPlacesShort({
                coveredCount: preview.coveredCount,
                neededCount: preview.stages[input.stage].neededCount,
                quota: preview.quota,
                reservedCount: preview.stages[input.stage].reservedCount,
              }),
            },
          ]
        : [];
    },
  );
  const shortfalls = seminars.filter((seminar) => seminar.shortBy > 0);
  const people = seminars.flatMap((seminar) => seminar.people);
  const amount = people.reduce((sum, person) => sum + (person.amount ?? 0), 0);
  const missingPriceCount = people.filter(
    (person) => person.amount === null,
  ).length;
  const owedAmount: OperationalFinanceAmount =
    missingPriceCount === 0
      ? { amount, status: "complete" }
      : { amount, missingPriceCount, status: "incomplete" };

  return {
    isBalanceShort: isPresetBalanceShort({
      availableBalanceAmount: input.availableBalanceAmount,
      owedAmount,
    }),
    owedAmount,
    seminars,
    shortfalls,
  };
}

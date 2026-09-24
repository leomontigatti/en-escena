import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useBlocker } from "react-router";

import {
  AccessHeader,
  AccessPage,
  PrivateAccessHeader,
} from "@/components/auth/access-ui";
import { DiscardChangesDialog } from "@/components/shared/discard-guard";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { InternalAccount } from "@/lib/auth/internal-account";
import {
  feedbackAudioFieldSubmission,
  feedbackAudioFieldUrl,
  initialFeedbackAudioField,
  isFeedbackAudioFieldDirty,
  reduceFeedbackAudioField,
  type FeedbackAudioFieldEvent,
} from "@/lib/judging/feedback-audio-field";
import type { JudgePresentationRow } from "@/lib/judging/judge-list.server";
import { singleScoreMaximum } from "@/lib/judging/score-value";
import { sheetTotal } from "@/lib/judging/sheet-total";
import { hasUnsavedChanges } from "@/lib/shared/discard-guard";
import { useOptionalFormAction, useOptionalSubmit } from "@/lib/shared/forms";
import { formatPrimaryAndSecondaryValue } from "@/lib/shared/format-primary-and-secondary-value";

import type { JudgePanelActionData } from "./action.server";
import { DisqualificationAction, DisqualifiedNotice } from "./disqualification";
import { FeedbackRecorder } from "./feedback-recorder";
import {
  buildJudgeSheetFormSchema,
  buildJudgeSheetSubmission,
  initialJudgeSheetValues,
  type JudgeSheetFormValues,
  useJudgeSavePending,
} from "./form-shared";
import { ScoreInputField } from "./score-input-field";

type JudgeScoreSheetProps = {
  account: InternalAccount;
  /** The last answer the route's action gave, which the sheet reads twice: for
   * the fields the server refused, and to know its pass through the discard
   * guard has been spent. */
  actionData?: JudgePanelActionData;
  onClose: () => void;
  presentation: JudgePresentationRow;
};

/**
 * Where a submodality judged on criteria is scored: the whole page, one field
 * per line, and the total the sheet adds up to in the corner the judge's eye
 * goes back to between two dances. It is a page and not a dialog because a
 * sheet is longer than a thumb's reach, and it has no previous or next buttons
 * — the way on is saving, which opens whatever the judge still owes.
 */
export function JudgeScoreSheet({
  account,
  actionData,
  onClose,
  presentation,
}: JudgeScoreSheetProps) {
  const { criteria } = presentation;
  const fieldErrors = actionData?.fieldErrors;
  const form = useForm<JudgeSheetFormValues>({
    defaultValues: initialJudgeSheetValues(
      criteria,
      presentation.criteriaValues,
    ),
    resolver: zodResolver(buildJudgeSheetFormSchema(criteria)),
  });
  const [audio, setAudio] = useState(() =>
    initialFeedbackAudioField(presentation.feedbackAudioUrl),
  );
  const formAction = useOptionalFormAction();
  const submit = useOptionalSubmit();
  const { setError } = form;
  const isSaving = useRef(false);
  const isDirty = hasUnsavedChanges({
    isAudioDirty: isFeedbackAudioFieldDirty(audio),
    isFormDirty: form.formState.isDirty,
  });
  const blocker = useSheetDiscardGuard({ actionData, isDirty, isSaving });
  const isSavePending = useJudgeSavePending(presentation.presentationId);
  const disqualified = presentation.status === "disqualified";

  // A line the client accepted and the server did not — a criterion added to
  // the submodality since the page loaded, say — belongs on its own field.
  useEffect(() => {
    for (const criterion of criteria) {
      const message = fieldErrors?.[criterion.id];

      if (message) {
        setError(`values.${criterion.id}`, { message });
      }
    }
  }, [criteria, fieldErrors, setError]);

  function applyAudioEvent(event: FeedbackAudioFieldEvent) {
    setAudio((current) => reduceFeedbackAudioField(current, event));
  }

  function save(values: JudgeSheetFormValues) {
    // The save navigates, and it is the one way out of the sheet that must
    // never be asked about.
    isSaving.current = true;
    void submit(
      buildJudgeSheetSubmission({
        audio: feedbackAudioFieldSubmission(audio),
        presentationId: presentation.presentationId,
        values,
      }),
      {
        action: formAction,
        encType: "multipart/form-data",
        method: "post",
      },
    );
  }

  return (
    <AccessPage width="xl">
      <PrivateAccessHeader account={account} />
      <AccessHeader
        eyebrow="Juzgamiento"
        title={presentation.name}
        description={formatPrimaryAndSecondaryValue(
          `${presentation.orderNumber}. ${presentation.categoryName}`,
          presentation.submodalityName ?? presentation.modalityName,
        )}
      />

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Planilla</CardTitle>
          <CardAction>
            <SheetTotal control={form.control} criteria={criteria} />
          </CardAction>
        </CardHeader>
        <CardContent>
          {disqualified ? (
            <div className="mb-4">
              <DisqualifiedNotice />
            </div>
          ) : null}
          <form
            id="judge-sheet-form"
            method="post"
            className="flex w-full flex-col gap-4"
            // A disqualified presentation takes nothing but the take, so the
            // sheet is not there to be filled or validated.
            onSubmit={
              disqualified
                ? (event) => {
                    event.preventDefault();
                    save({ values: {} });
                  }
                : form.handleSubmit(save)
            }
          >
            {disqualified
              ? null
              : criteria.map((criterion) => (
                  <ScoreInputField
                    control={form.control}
                    id={`criterio-${criterion.id}`}
                    key={criterion.id}
                    label={criterion.name}
                    maximum={criterion.maximum}
                    name={`values.${criterion.id}`}
                  />
                ))}
            <FeedbackRecorder
              audioUrl={feedbackAudioFieldUrl(audio)}
              error={fieldErrors?.audio}
              onDelete={() => applyAudioEvent({ type: "deleted" })}
              onRecorded={(take) => applyAudioEvent({ take, type: "recorded" })}
            />
          </form>
        </CardContent>
        <CardFooter className="justify-between gap-2">
          <DisqualificationAction
            disqualified={disqualified}
            // The post is a navigation the page's own guard would otherwise
            // stop, and there is nothing in the form it can lose.
            onSubmitting={() => {
              isSaving.current = true;
            }}
            presentationId={presentation.presentationId}
          />
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Volver
            </Button>
            <Button
              disabled={isSavePending}
              type="submit"
              form="judge-sheet-form"
            >
              Guardar
            </Button>
          </div>
        </CardFooter>
      </Card>

      <DiscardChangesDialog
        onDiscard={() => blocker.proceed?.()}
        onKeepEditing={() => blocker.reset?.()}
        open={blocker.state === "blocked"}
      />
    </AccessPage>
  );
}

/**
 * What the sheet adds up to right now, read off the fields as they are typed.
 * A line the judge is halfway through counts as nothing, so the number never
 * jumps around under their thumb and always reads what could be saved.
 */
function SheetTotal({
  control,
  criteria,
}: {
  control: ReturnType<typeof useForm<JudgeSheetFormValues>>["control"];
  criteria: JudgePresentationRow["criteria"];
}) {
  const values = useWatch({ control, name: "values" });
  const total = sheetTotal(
    criteria.map((criterion) => ({
      kind: criterion.kind,
      maximum: criterion.maximum,
      value: values?.[criterion.id] ?? "",
    })),
  );

  return (
    <span className="text-lg tabular-nums" data-sheet-total>
      {`${total} / ${singleScoreMaximum}`}
    </span>
  );
}

/**
 * Every way out of a page, unlike a dialog, is a navigation: `Volver`, the
 * browser's back button and the tab being closed all go through here, so the
 * sheet asks once and in one place. The save is the exception it lets through,
 * because a form that closes because it was stored has nothing to lose.
 */
function useSheetDiscardGuard({
  actionData,
  isDirty,
  isSaving,
}: {
  actionData?: JudgePanelActionData;
  isDirty: boolean;
  isSaving: { current: boolean };
}) {
  useSpentPass({ actionData, isSaving });

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty &&
      !isSaving.current &&
      currentLocation.key !== nextLocation.key &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search),
  );

  useEffect(() => {
    if (!isDirty) {
      return;
    }

    const warn = (event: BeforeUnloadEvent) => {
      if (isSaving.current) {
        return;
      }

      event.preventDefault();
    };

    window.addEventListener("beforeunload", warn);

    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty, isSaving]);

  return blocker;
}

/**
 * Hands the guard back once the post the pass was granted for has answered and
 * left the judge looking at the same sheet — a day that closed, a take the
 * policy refused, a disqualification settled from the footer. The pass is for
 * one navigation, and without this it would outlive it: the sheet would keep
 * its unsaved lines and let the next `Volver`, back button or closing tab throw
 * them away without asking, which is the one thing the guard exists to stop.
 *
 * A save that did take the judge on is not one of those cases and needs no
 * hand-back: it remounts the sheet on the next presentation, or closes it.
 */
function useSpentPass({
  actionData,
  isSaving,
}: {
  actionData?: JudgePanelActionData;
  isSaving: { current: boolean };
}) {
  const answered = useRef<JudgePanelActionData | null>(null);

  useEffect(() => {
    if (!actionData || answered.current === actionData) {
      return;
    }

    answered.current = actionData;

    if (actionData.status === "error" || actionData.intent !== "save-score") {
      isSaving.current = false;
    }
  }, [actionData, isSaving]);
}

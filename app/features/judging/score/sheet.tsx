import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Undo2 } from "lucide-react";
import { useForm } from "react-hook-form";

import {
  AccessHeader,
  AccessPage,
  PrivateAccessHeader,
} from "@/components/auth/access-ui";
import {
  DiscardChangesDialog,
  useUnsavedChangesGuard,
} from "@/components/shared/discard-guard";
import { SubmitButton } from "@/components/shared/action-buttons";
import { AlertStack } from "@/components/shared/alert-stack";
import { PinnedActions } from "@/components/shared/pinned-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import type { InternalAccount } from "@/lib/auth/internal-account";
import { formatScheduleDayHeading } from "@/lib/choreographies/schedule-formatters";
import { isSheetComplete } from "@/lib/judging/sheet-criteria";
import {
  feedbackAudioFieldSubmission,
  feedbackAudioFieldUrl,
  initialFeedbackAudioField,
  isFeedbackAudioFieldDirty,
  reduceFeedbackAudioField,
  type FeedbackAudioFieldEvent,
} from "@/lib/judging/feedback-audio-field";
import type { JudgePresentationRow } from "@/lib/judging/judge-list.server";
import { hasUnsavedChanges } from "@/lib/shared/discard-guard";
import { useOptionalFormAction, useOptionalSubmit } from "@/lib/shared/forms";

import {
  formatPresentationSummary,
  formatPresentationTitle,
} from "./presentation-heading";
import type { JudgePanelActionData } from "./action.server";
import { DisqualifiedNotice } from "./disqualification";
import { FeedbackRecorder } from "./feedback-recorder";
import { IncompleteSheetNotice } from "./incomplete-sheet";
import {
  buildJudgeSheetFormSchema,
  buildJudgeSheetSubmission,
  initialJudgeSheetValues,
  type JudgeSheetFormValues,
  useJudgeSavePending,
} from "./form-shared";
import { SheetParts } from "./sheet-parts";

type JudgeScoreSheetProps = {
  account: InternalAccount;
  /** The last answer the route's action gave, which the sheet reads twice: for
   * the fields the server refused, and to know its pass through the discard
   * guard has been spent. */
  actionData?: JudgePanelActionData;
  /** The judging day, as a `YYYY-MM-DD` date. */
  judgingDate: string;
  onClose: () => void;
  presentation: JudgePresentationRow;
};

/**
 * Where a submodality judged on criteria is scored: the whole page, laid out
 * like the sheet administration corrects (`SheetParts`) — the `Devolución`
 * first, then the parts with their live sums and the total under them. It is a
 * page and not a dialog because a sheet is longer than a thumb's reach, and it
 * has no previous or next buttons — the way on is saving, which opens whatever
 * the judge still owes. `Guardar` waits for a change, as on every form.
 */
export function JudgeScoreSheet({
  account,
  actionData,
  judgingDate,
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
  const discardDialog = useSheetDiscardGuard({
    actionData,
    isDirty,
    isSaving,
  });
  const isSavePending = useJudgeSavePending(presentation.presentationId);
  const { disqualified, incomplete } = readSheetState(presentation);

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

  function discard() {
    form.reset();
    setAudio(initialFeedbackAudioField(presentation.feedbackAudioUrl));
  }

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
    <AccessPage width="2xl">
      <PrivateAccessHeader account={account} />
      <AccessHeader
        eyebrow={formatScheduleDayHeading(judgingDate)}
        title={formatPresentationTitle(presentation)}
        titleLevel={2}
        description={formatPresentationSummary(presentation)}
      />

      <SheetNotices disqualified={disqualified} incomplete={incomplete} />

      {/* `overflow-clip` rather than the card's own `overflow-hidden`, so the
          footer can stick to the bottom of a sheet longer than the screen. */}
      <Card className="mt-6 overflow-clip">
        <CardContent>
          <form
            id="judge-sheet-form"
            method="post"
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
            <FieldGroup>
              <FeedbackRecorder
                audioUrl={feedbackAudioFieldUrl(audio)}
                error={fieldErrors?.audio}
                legendVariant="legend"
                onDelete={() => applyAudioEvent({ type: "deleted" })}
                onRecorded={(take) =>
                  applyAudioEvent({ take, type: "recorded" })
                }
              />
              {disqualified ? null : (
                <SheetParts
                  control={form.control}
                  criteria={criteria}
                  fieldIdPrefix="criterio"
                />
              )}
            </FieldGroup>
          </form>
        </CardContent>
        <PinnedActions>
          <Button type="button" variant="outline" onClick={onClose}>
            <ChevronLeft aria-hidden="true" data-icon="inline-start" />
            Volver
          </Button>
          <div className="flex items-center gap-3">
            {isDirty ? (
              <Button
                disabled={isSavePending}
                onClick={discard}
                type="button"
                variant="outline"
              >
                <Undo2 aria-hidden="true" data-icon="inline-start" />
                Descartar cambios
              </Button>
            ) : null}
            <SubmitButton
              disabled={!isDirty || incomplete}
              form="judge-sheet-form"
              isPending={isSavePending}
            />
          </div>
        </PinnedActions>
      </Card>

      <DiscardChangesDialog {...discardDialog} />
    </AccessPage>
  );
}

/**
 * The page's guard, with the pass the save needs: the save navigates to the
 * next presentation, so it sets `isSaving` before it posts.
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

  return useUnsavedChangesGuard({ isDirty, isSaving });
}

/**
 * Hands the guard back once the post the pass was granted for has answered and
 * left the judge looking at the same sheet — a day that closed, a take the
 * policy refused. The pass is for
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

    if (actionData.status === "error") {
      isSaving.current = false;
    }
  }, [actionData, isSaving]);
}

/**
 * Why the sheet takes less than a score, if it does: a disqualified
 * presentation takes only the take, whatever its sheet's total, and an
 * incomplete sheet takes nothing until administration completes it.
 */
function readSheetState(presentation: JudgePresentationRow) {
  const disqualified = presentation.status === "disqualified";

  return {
    disqualified,
    incomplete: !disqualified && !isSheetComplete(presentation.criteria),
  };
}

function SheetNotices({
  disqualified,
  incomplete,
}: {
  disqualified: boolean;
  incomplete: boolean;
}) {
  return (
    <AlertStack className="mt-6">
      {disqualified ? <DisqualifiedNotice /> : null}
      {incomplete ? <IncompleteSheetNotice /> : null}
    </AlertStack>
  );
}

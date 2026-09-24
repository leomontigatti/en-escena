import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";

import {
  DiscardChangesDialog,
  useDiscardGuard,
} from "@/components/shared/discard-guard";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  feedbackAudioFieldSubmission,
  feedbackAudioFieldUrl,
  initialFeedbackAudioField,
  isFeedbackAudioFieldDirty,
  reduceFeedbackAudioField,
  type FeedbackAudioFieldEvent,
} from "@/lib/judging/feedback-audio-field";
import type { JudgePresentationRow } from "@/lib/judging/judge-list.server";
import {
  formatScoreFieldValue,
  singleScoreMaximum,
} from "@/lib/judging/score-value";
import { useOptionalFormAction, useOptionalSubmit } from "@/lib/shared/forms";
import { formatPrimaryAndSecondaryValue } from "@/lib/shared/format-primary-and-secondary-value";

import { DisqualificationAction, DisqualifiedNotice } from "./disqualification";
import { FeedbackRecorder } from "./feedback-recorder";
import {
  buildJudgeScoreSubmission,
  judgeScoreFormSchema,
  type JudgeScoreFormValues,
  useJudgeSavePending,
} from "./form-shared";
import { ScoreInputField } from "./score-input-field";

type JudgeScoreDialogProps = {
  fieldErrors?: Record<string, string>;
  onClose: () => void;
  presentation: JudgePresentationRow;
};

/**
 * Where a presentation without criteria is scored: one field, one button, and
 * nothing else to read between two dances. It never closes on an outside tap —
 * in a dark theatre that tap is an accident, and behind it is a score nobody
 * would get back — and every other way out asks first when there is a score in
 * there to lose.
 */
export function JudgeScoreDialog({
  fieldErrors,
  onClose,
  presentation,
}: JudgeScoreDialogProps) {
  const form = useForm<JudgeScoreFormValues>({
    // The score the judge already gave, so reopening a scored presentation is a
    // correction rather than a blind retype — and so that closing it again
    // untouched is clean and asks nothing.
    defaultValues: { value: formatScoreFieldValue(presentation.value) },
    resolver: zodResolver(judgeScoreFormSchema),
  });
  const [audio, setAudio] = useState(() =>
    initialFeedbackAudioField(presentation.feedbackAudioUrl),
  );
  const { discardDialogProps, requestClose } = useDiscardGuard({
    // A take recorded or deleted over untouched fields is a change the form
    // state knows nothing about, and is exactly what the judge would lose.
    isAudioDirty: isFeedbackAudioFieldDirty(audio),
    isFormDirty: form.formState.isDirty,
    onClose,
  });
  const formAction = useOptionalFormAction();
  const submit = useOptionalSubmit();
  const { setError } = form;
  const disqualified = presentation.status === "disqualified";
  // A judge taps in the dark with the stage in front of them, so the button has
  // to say it took the tap: without it the same score posts twice.
  const isSaving = useJudgeSavePending(presentation.presentationId);

  // A value the client accepted and the server did not — a race against the
  // criteria of a submodality, a rule the form has not been taught — belongs on
  // the field, beside what the judge typed.
  useEffect(() => {
    if (fieldErrors?.value) {
      setError("value", { message: fieldErrors.value });
    }
  }, [fieldErrors, setError]);

  function applyAudioEvent(event: FeedbackAudioFieldEvent) {
    setAudio((current) => reduceFeedbackAudioField(current, event));
  }

  function save(values: JudgeScoreFormValues) {
    void submit(
      buildJudgeScoreSubmission({
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
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) {
            requestClose();
          }
        }}
      >
        <DialogContent
          onInteractOutside={(event) => event.preventDefault()}
          className="sm:max-w-md"
        >
          <DialogHeader>
            <DialogTitle>{presentation.name}</DialogTitle>
            <DialogDescription>
              {formatPrimaryAndSecondaryValue(
                `${presentation.orderNumber}. ${presentation.categoryName}`,
                presentation.submodalityName ?? presentation.modalityName,
              )}
            </DialogDescription>
          </DialogHeader>
          <form
            id="judge-score-form"
            method="post"
            className="flex w-full flex-col gap-4"
            // A disqualified presentation takes nothing but the take, so the
            // score field is not there to be validated.
            onSubmit={
              disqualified
                ? (event) => {
                    event.preventDefault();
                    save({ value: "" });
                  }
                : form.handleSubmit(save)
            }
          >
            {disqualified ? (
              <DisqualifiedNotice />
            ) : (
              <ScoreInputField
                autoFocus
                control={form.control}
                id="judge-score-value"
                label="Puntaje"
                maximum={singleScoreMaximum}
                name="value"
              />
            )}
            <FeedbackRecorder
              audioUrl={feedbackAudioFieldUrl(audio)}
              error={fieldErrors?.audio}
              onDelete={() => applyAudioEvent({ type: "deleted" })}
              onRecorded={(take) => applyAudioEvent({ take, type: "recorded" })}
            />
          </form>
          <DialogFooter className="sm:justify-between">
            <DisqualificationAction
              disqualified={disqualified}
              presentationId={presentation.presentationId}
            />
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={requestClose}>
                Cancelar
              </Button>
              <Button disabled={isSaving} type="submit" form="judge-score-form">
                Guardar
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DiscardChangesDialog {...discardDialogProps} />
    </>
  );
}

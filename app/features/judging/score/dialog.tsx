import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { Undo2 } from "lucide-react";
import { useForm } from "react-hook-form";

import { SubmitButton } from "@/components/shared/action-buttons";
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

import {
  formatPresentationSummary,
  formatPresentationTitle,
} from "./presentation-heading";
import { DisqualifiedNotice } from "./disqualification";
import { FeedbackRecorder } from "./feedback-recorder";
import {
  buildJudgeScoreSubmission,
  judgeScoreFormSchema,
  type JudgeScoreFormValues,
  useJudgeSavePending,
} from "./form-shared";
import { ScoreInputField } from "./score-input-field";

type JudgeScoreDialogProps = {
  onClose: () => void;
  presentation: JudgePresentationRow;
};

/**
 * Where a presentation without criteria is scored: the `Devolución` and one
 * field, laid out like the sheet (`sheet.tsx`) so the two read the same, and
 * saved by a `Guardar` that waits for a change. It never closes on an outside tap —
 * in a dark theatre that tap is an accident, and behind it is a score nobody
 * would get back — and every other way out asks first when there is a score in
 * there to lose.
 */
export function JudgeScoreDialog({
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
  // A take recorded or deleted over an untouched score is a change the form
  // state knows nothing about, and is exactly what the judge would lose.
  const isAudioDirty = isFeedbackAudioFieldDirty(audio);
  const isDirty = form.formState.isDirty || isAudioDirty;
  const { discardDialogProps, requestClose } = useDiscardGuard({
    isAudioDirty,
    isFormDirty: form.formState.isDirty,
    onClose,
  });
  const formAction = useOptionalFormAction();
  const submit = useOptionalSubmit();
  const disqualified = presentation.status === "disqualified";
  // A judge taps in the dark with the stage in front of them, so the button has
  // to say it took the tap: without it the same score posts twice.
  const isSaving = useJudgeSavePending(presentation.presentationId);

  function applyAudioEvent(event: FeedbackAudioFieldEvent) {
    setAudio((current) => reduceFeedbackAudioField(current, event));
  }

  function discard() {
    form.reset();
    setAudio(initialFeedbackAudioField(presentation.feedbackAudioUrl));
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
          // Esc and the close button are held like `Cancelar`: closing over a
          // save in flight would let the judge reopen and post the score twice.
          if (!open && !isSaving) {
            requestClose();
          }
        }}
      >
        <DialogContent onInteractOutside={(event) => event.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{formatPresentationTitle(presentation)}</DialogTitle>
            <DialogDescription>
              {formatPresentationSummary(presentation)}
            </DialogDescription>
          </DialogHeader>
          {disqualified ? <DisqualifiedNotice /> : null}
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
            <FeedbackRecorder
              audioUrl={feedbackAudioFieldUrl(audio)}
              onDelete={() => applyAudioEvent({ type: "deleted" })}
              onRecorded={(take) => applyAudioEvent({ take, type: "recorded" })}
            />
            {disqualified ? null : (
              <ScoreInputField
                autoFocus
                control={form.control}
                id="judge-score-value"
                label="Puntaje"
                maximum={singleScoreMaximum}
                name="value"
              />
            )}
          </form>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isSaving}
              onClick={requestClose}
            >
              Cancelar
            </Button>
            {isDirty ? (
              <Button
                type="button"
                variant="outline"
                disabled={isSaving}
                onClick={discard}
              >
                <Undo2 aria-hidden="true" data-icon="inline-start" />
                Descartar cambios
              </Button>
            ) : null}
            <SubmitButton
              disabled={!isDirty}
              form="judge-score-form"
              isPending={isSaving}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DiscardChangesDialog {...discardDialogProps} />
    </>
  );
}

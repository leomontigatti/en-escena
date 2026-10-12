import { useCallback, useEffect, useRef, useState } from "react";
import type { FieldValues, UseFormReturn } from "react-hook-form";
import { useActionData } from "react-router";

import { useUnsavedChangesGuard } from "@/components/shared/discard-guard";

import type { PresentationScoresActionData } from "./server";

/**
 * The drafts on one presentation's panel. A correction typed and not saved is
 * a draft the page asks about before it is left. The router holds one blocker
 * at a time, while every judge's row or tab holds a form of its own, so the
 * page keeps one guard over every judge's draft — a hidden tab's included —
 * and each form reports its own to it.
 */

export type DraftChangeHandler = (scoreId: string, isDraft: boolean) => void;

/**
 * The page's one guard. A save posts to this same page and never looks like
 * leaving, so it needs no pass.
 */
export function useScoreDraftsGuard() {
  const [draftScoreIds, setDraftScoreIds] = useState<string[]>([]);
  const discardDialog = useUnsavedChangesGuard({
    isDirty: draftScoreIds.length > 0,
    isSaving: false,
  });
  const onDraftChange = useCallback<DraftChangeHandler>((scoreId, isDraft) => {
    setDraftScoreIds((current) =>
      isDraft
        ? [...new Set([...current, scoreId])]
        : current.filter((id) => id !== scoreId),
    );
  }, []);

  return { discardDialog, onDraftChange };
}

/** Tells the page's guard whether this judge's form holds a draft. */
export function useReportDraft(
  scoreId: string,
  isDraft: boolean,
  onDraftChange: DraftChangeHandler,
) {
  useEffect(() => {
    onDraftChange(scoreId, isDraft);
  }, [isDraft, onDraftChange, scoreId]);

  useEffect(
    () => () => onDraftChange(scoreId, false),
    [onDraftChange, scoreId],
  );
}

/**
 * A form's own save that was accepted leaves no draft, even when what was
 * typed (`90.0`) is written differently from what the loader hands back
 * (`90`): the saved value is then unchanged, so `useSavedFormValues` has
 * nothing to reset on, and the page would keep asking before it is left. The
 * form marks its own save as it posts, so the answer to another form's save,
 * or to a disqualification, leaves its draft alone.
 */
export function useSettleAfterSave<TFieldValues extends FieldValues>(
  form: UseFormReturn<TFieldValues, unknown, unknown>,
  saved: TFieldValues,
) {
  const actionData = useActionData<PresentationScoresActionData>();
  const isAwaitingSave = useRef(false);
  const savedKey = JSON.stringify(saved);

  useEffect(() => {
    if (!isAwaitingSave.current || actionData === undefined) {
      return;
    }

    isAwaitingSave.current = false;

    if (actionData.status === "success") {
      form.reset(JSON.parse(savedKey) as TFieldValues);
    }
  }, [actionData, form, savedKey]);

  return () => {
    isAwaitingSave.current = true;
  };
}

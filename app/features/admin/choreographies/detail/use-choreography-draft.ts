import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import {
  useActionData,
  useFetcher,
  useNavigation,
  useSubmit,
} from "react-router";

import {
  choreographyDraftSchema,
  hasChoreographyDraftConsequences,
  isChoreographyDraftDirty,
  isChoreographyDraftResolved,
  toSavedChoreographyDraft,
} from "./draft-form";
import {
  getChoreographyDraftClassificationKey,
  getChoreographyDraftPreviewKey,
  resolveChoreographyDraftIntent,
  saveChoreographyDraftIntent,
  toChoreographyDraftFormData,
  type ChoreographyDraft,
  type ChoreographyDraftPreview,
} from "./draft.shared";
import type { ChoreographyDetailLoaderData } from "./server";

/**
 * The detail's one draft: every editable field in one form, a preview asked of
 * the server whenever the modality, the dancers or the capacity change, the
 * dependent fields settled from its answer, and one save.
 */
export function useChoreographyDraft(loaderData: ChoreographyDetailLoaderData) {
  const { choreography } = loaderData;
  const saved = useMemo(
    () => toSavedChoreographyDraft(choreography),
    [choreography],
  );
  const form = useForm<ChoreographyDraft>({
    defaultValues: saved,
    mode: "onSubmit",
    resolver: zodResolver(choreographyDraftSchema),
  });
  const { getValues, reset, setValue } = form;
  const draft = useWatch({ control: form.control }) as ChoreographyDraft;
  const isStructureLocked =
    !loaderData.canEdit || loaderData.draft.structuralLock !== null;

  // A save that went through reloads the choreography, and the draft starts
  // over from it. A refused one does not reload, so the draft stays.
  useEffect(() => {
    reset(saved);
  }, [reset, saved]);

  useDependentSubmodality({ draft, saved, setValue });

  const preview = useDraftPreview({
    draft,
    getValues,
    isStructureLocked,
    saved,
    savedPreview: loaderData.draft,
    setValue,
  });
  const navigation = useNavigation();
  const submit = useSubmit();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const isSaving =
    navigation.state !== "idle" &&
    navigation.formData?.get("intent") === saveChoreographyDraftIntent;
  const isDirty = isChoreographyDraftDirty(draft, saved);
  const canSave =
    loaderData.canEdit &&
    isDirty &&
    !isSaving &&
    preview.current !== null &&
    isChoreographyDraftResolved({ draft, preview: preview.current, saved });

  function save(values: ChoreographyDraft) {
    setIsConfirmOpen(false);
    void submit(
      toChoreographyDraftFormData({
        draft: values,
        intent: saveChoreographyDraftIntent,
        previewedCategoryId: preview.current?.category?.id ?? null,
      }),
      { method: "post" },
    );
  }

  return {
    canSave,
    confirm: {
      onConfirm: () => void form.handleSubmit(save)(),
      onOpenChange: setIsConfirmOpen,
      open: isConfirmOpen,
    },
    discard: () => {
      reset(saved);
      preview.restart();
    },
    draft,
    form,
    isDirty,
    isSaving,
    isStructureLocked,
    preview,
    /**
     * `Guardar` confirms first only when the save reaches past the fields the
     * administrator edited; otherwise it goes straight through.
     */
    requestSave: form.handleSubmit((values) => {
      if (
        preview.current &&
        hasChoreographyDraftConsequences(preview.current.consequences)
      ) {
        setIsConfirmOpen(true);
        return;
      }

      save(values);
    }),
    saved,
  };
}

/**
 * The submodality belongs to its modality, so it is re-chosen whenever the
 * modality changes, and comes back as saved when the modality does.
 */
function useDependentSubmodality(input: {
  draft: ChoreographyDraft;
  saved: ChoreographyDraft;
  setValue: ReturnType<typeof useForm<ChoreographyDraft>>["setValue"];
}) {
  const { draft, saved, setValue } = input;
  const previousModalityId = useRef(draft.modalityId);

  useEffect(() => {
    if (previousModalityId.current === draft.modalityId) {
      return;
    }

    previousModalityId.current = draft.modalityId;
    setValue(
      "submodalityId",
      draft.modalityId === saved.modalityId ? saved.submodalityId : "",
    );
  }, [draft.modalityId, saved, setValue]);
}

/**
 * Asks the server what the draft makes of the classification, once per key,
 * and settles the fields that follow from the answer: the capacity it lands on
 * and the level, kept only while the category stays the one it was chosen for.
 *
 * `current` is the answer for the draft as it stands, or `null` while it is on
 * its way; `shown` is what the derived fields display meanwhile.
 */
function useDraftPreview(input: {
  draft: ChoreographyDraft;
  getValues: () => ChoreographyDraft;
  isStructureLocked: boolean;
  saved: ChoreographyDraft;
  savedPreview: ChoreographyDraftPreview;
  setValue: ReturnType<typeof useForm<ChoreographyDraft>>["setValue"];
}) {
  const { draft, getValues, isStructureLocked, savedPreview } = input;
  const fetcher = useFetcher<{
    intent: typeof resolveChoreographyDraftIntent;
    preview: ChoreographyDraftPreview;
  }>();
  const { submit: submitPreview } = fetcher;
  const refusal = useActionData<{ status?: string }>();
  const [refusedPreview, setRefusedPreview] =
    useState<ChoreographyDraftPreview | null>(null);
  const fetched =
    fetcher.data?.intent === resolveChoreographyDraftIntent
      ? fetcher.data.preview
      : null;
  // A save the server refused was made on the preview at hand, which it may
  // have found stale: that answer is set aside so the draft is asked again.
  const answered = fetched === refusedPreview ? null : fetched;
  const key = getChoreographyDraftPreviewKey(draft);
  const current = isStructureLocked
    ? savedPreview
    : findPreviewFor(key, [savedPreview, answered]);
  const requestedKey = useRef<string | null>(null);
  const levelCategoryId = useSettledDependentFields({ ...input, answered });

  useEffect(() => {
    if (current !== null || requestedKey.current === key) {
      return;
    }

    requestedKey.current = key;
    void submitPreview(
      toChoreographyDraftFormData({
        draft: getValues(),
        intent: resolveChoreographyDraftIntent,
      }),
      { method: "post" },
    );
  }, [current, getValues, key, submitPreview]);

  // A save that reloaded the choreography starts over from what is saved.
  useEffect(() => {
    requestedKey.current = null;
  }, [savedPreview]);

  const handledRefusal = useRef(refusal);

  useEffect(() => {
    // Only a new refusal sets the preview aside, not the answer that follows.
    if (handledRefusal.current === refusal) {
      return;
    }

    handledRefusal.current = refusal;

    if (refusal?.status === "error") {
      setRefusedPreview(fetched);
      requestedKey.current = null;
    }
  }, [fetched, refusal]);

  return {
    current,
    isPending: current === null,
    /** Discarding starts over from what is saved, as a reload does. */
    restart() {
      levelCategoryId.current = savedPreview.category?.id ?? null;
      requestedKey.current = null;
    },
    shown: current ?? answered ?? savedPreview,
  };
}

/** The preview that answers exactly this draft, if one is at hand. */
function findPreviewFor(
  key: string,
  previews: ReadonlyArray<ChoreographyDraftPreview | null>,
) {
  return previews.find((preview) => preview?.key === key) ?? null;
}

/**
 * Settles the fields that follow from an answer, once it answers the draft's
 * modality and dancers as they stand: the capacity it lands on, and the level,
 * kept only while the category stays the one it was chosen for.
 */
function useSettledDependentFields(input: {
  answered: ChoreographyDraftPreview | null;
  getValues: () => ChoreographyDraft;
  saved: ChoreographyDraft;
  savedPreview: ChoreographyDraftPreview;
  setValue: ReturnType<typeof useForm<ChoreographyDraft>>["setValue"];
}) {
  const { answered, getValues, saved, savedPreview, setValue } = input;
  const levelCategoryId = useRef(savedPreview.category?.id ?? null);

  useEffect(() => {
    const classificationKey =
      getChoreographyDraftClassificationKey(getValues());

    if (answered?.classificationKey !== classificationKey) {
      return;
    }

    const categoryId = answered.category?.id ?? null;

    if (categoryId !== levelCategoryId.current) {
      levelCategoryId.current = categoryId;
      setValue(
        "experienceLevelId",
        categoryId === savedPreview.category?.id ? saved.experienceLevelId : "",
      );
    }

    setValue("scheduleCapacityId", answered.scheduleCapacity.selectedId ?? "");
  }, [answered, getValues, saved, savedPreview, setValue]);

  useEffect(() => {
    levelCategoryId.current = savedPreview.category?.id ?? null;
  }, [savedPreview]);

  return levelCategoryId;
}

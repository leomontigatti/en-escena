import { zodResolver } from "@hookform/resolvers/zod";
import { Info } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useFetcher } from "react-router";

import { SubmitButton } from "@/components/shared/action-buttons";
import {
  DiscardChangesDialog,
  useUnsavedChangesGuard,
} from "@/components/shared/discard-guard";
import { ReadOnlySelectField } from "@/components/shared/read-only-field";
import { SelectField } from "@/components/shared/select-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FieldGroup } from "@/components/ui/field";
import type { JudgeFinalistPickRow } from "@/lib/grand-final/finalist-pick.server";
import { createValidatedRouteFormDataSubmitHandler } from "@/lib/shared/forms";
import { useServerActionToast } from "@/lib/shared/toasts";

import type { FinalistPickActionData } from "./action.server";
import {
  type FinalistPickFormValues,
  finalistPickSchema,
  saveFinalistPickIntent,
} from "./shared";

/**
 * The judge's `finalistPick`s, at the bottom of their list: one per modality
 * that dances on the day shown. On the open day each is a select of the
 * academies eligible in that modality with its own `Guardar`, since each pick
 * is a record of its own; on any other day it is read-only, as the scores are,
 * and an `info` alert says why. A day no modality dances shows nothing.
 *
 * A pick chosen and not saved is a draft the page asks about before it is
 * left. The router holds one blocker at a time, so the guard sits here, once,
 * over every row's draft.
 */
export function FinalistPicks({
  isOpen,
  rows,
}: {
  isOpen: boolean;
  rows: JudgeFinalistPickRow[];
}) {
  return rows.length > 0 ? (
    <FinalistPicksSection isOpen={isOpen} rows={rows} />
  ) : null;
}

function FinalistPicksSection({
  isOpen,
  rows,
}: {
  isOpen: boolean;
  rows: JudgeFinalistPickRow[];
}) {
  const [draftModalityIds, setDraftModalityIds] = useState<string[]>([]);
  const discardDialog = useUnsavedChangesGuard({
    isDirty: draftModalityIds.length > 0,
    isSaving: false,
  });
  const onDraftChange = useCallback((modalityId: string, isDraft: boolean) => {
    setDraftModalityIds((current) =>
      isDraft
        ? [...new Set([...current, modalityId])]
        : current.filter((id) => id !== modalityId),
    );
  }, []);

  return (
    <section aria-labelledby="gran-final-heading" className="mt-10">
      <h3 id="gran-final-heading" className="text-base font-semibold">
        Gran final
      </h3>
      {isOpen ? (
        <p className="mt-1 text-sm leading-6 text-pretty text-muted-foreground">
          Elegí una academia finalista por modalidad, entre las que cumplen los
          requisitos.
        </p>
      ) : (
        <Alert variant="info" className="mt-3">
          <Info aria-hidden="true" />
          <AlertTitle>Elección de finalista cerrada</AlertTitle>
          <AlertDescription>
            Tu elección de finalista en cada modalidad solo se puede cambiar
            durante su jornada, hasta las 3 de la mañana siguiente.
          </AlertDescription>
        </Alert>
      )}
      <FieldGroup className="mt-4">
        {rows.map((row) =>
          isOpen && row.options.length > 0 ? (
            <FinalistPickForm
              key={row.modalityId}
              onDraftChange={onDraftChange}
              row={row}
            />
          ) : (
            <ReadOnlySelectField
              key={row.modalityId}
              label={row.modalityName}
              emptyLabel={
                row.options.length === 0 && row.academyId === null
                  ? "Ninguna academia cumple los requisitos"
                  : "Sin elección"
              }
              options={pickedOption(row)}
              value={row.academyId}
            />
          ),
        )}
      </FieldGroup>
      <DiscardChangesDialog {...discardDialog} />
    </section>
  );
}

function FinalistPickForm({
  onDraftChange,
  row,
}: {
  onDraftChange: (modalityId: string, isDraft: boolean) => void;
  row: JudgeFinalistPickRow;
}) {
  const fetcher = useFetcher<FinalistPickActionData>();
  const saved = row.academyId ?? "";
  const form = useForm<FinalistPickFormValues>({
    resolver: zodResolver(finalistPickSchema),
    defaultValues: { academyId: saved, modalityId: row.modalityId },
  });
  const { reset } = form;
  const isDraft = form.watch("academyId") !== saved;

  useServerActionToast(fetcher.data, {
    toastId: `finalista-${row.modalityId}`,
  });

  // The revalidated list is what was saved: a successful save starts a clean
  // draft from it, and a refusal leaves the select on what the judge chose.
  useEffect(() => {
    reset({ academyId: saved, modalityId: row.modalityId });
  }, [reset, row.modalityId, saved]);

  useEffect(() => {
    onDraftChange(row.modalityId, isDraft);
  }, [isDraft, onDraftChange, row.modalityId]);

  useEffect(
    () => () => onDraftChange(row.modalityId, false),
    [onDraftChange, row.modalityId],
  );

  return (
    <fetcher.Form
      method="post"
      className="flex items-end gap-3"
      onSubmit={createValidatedRouteFormDataSubmitHandler(form, fetcher.submit)}
    >
      <input type="hidden" name="intent" value={saveFinalistPickIntent} />
      <input type="hidden" name="modalityId" value={row.modalityId} />
      <SelectField
        className="flex-1"
        control={form.control}
        label={row.modalityName}
        name="academyId"
        options={[
          ...row.options.map((option) => ({
            label: option.name,
            value: option.academyId,
          })),
          ...pickedOption(row).filter(
            (picked) =>
              !row.options.some((option) => option.academyId === picked.value),
          ),
        ]}
        placeholder="Elegí una academia"
      />
      <SubmitButton disabled={!isDraft} isPending={fetcher.state !== "idle"} />
    </fetcher.Form>
  );
}

/**
 * The judge's saved pick as a select option. It is kept apart from the
 * eligible ones so a pick whose academy stopped being eligible still reads as
 * what was picked; saving it again is the server's to refuse.
 */
function pickedOption(row: JudgeFinalistPickRow) {
  return row.academyId && row.academyName
    ? [{ label: row.academyName, value: row.academyId }]
    : [];
}

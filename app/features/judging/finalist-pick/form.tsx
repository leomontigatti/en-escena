import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useFetcher } from "react-router";

import { SubmitButton } from "@/components/shared/action-buttons";
import { ReadOnlySelectField } from "@/components/shared/read-only-field";
import { SelectField } from "@/components/shared/select-field";
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
 * is a record of its own; on any other day it is read-only, as the scores are.
 * A day no modality dances shows nothing.
 */
export function FinalistPicks({
  isOpen,
  rows,
}: {
  isOpen: boolean;
  rows: JudgeFinalistPickRow[];
}) {
  if (rows.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="gran-final-heading" className="mt-10">
      <h3 id="gran-final-heading" className="text-base font-semibold">
        Gran final
      </h3>
      <p className="mt-1 text-sm leading-6 text-pretty text-muted-foreground">
        {isOpen
          ? "Elegí una academia finalista por modalidad, entre las que cumplen los requisitos."
          : "Tu elección de finalista en cada modalidad de ese día. Solo se puede cambiar durante su jornada."}
      </p>
      <div className="mt-4 flex flex-col gap-4">
        {rows.map((row) =>
          isOpen && row.options.length > 0 ? (
            <FinalistPickForm key={row.modalityId} row={row} />
          ) : (
            <ReadOnlySelectField
              key={row.modalityId}
              label={row.modalityName}
              emptyLabel={
                row.options.length === 0 && row.academyId === null
                  ? "Ninguna academia cumple los requisitos"
                  : "Sin elección"
              }
              options={
                row.academyId && row.academyName
                  ? [{ label: row.academyName, value: row.academyId }]
                  : []
              }
              value={row.academyId}
            />
          ),
        )}
      </div>
    </section>
  );
}

function FinalistPickForm({ row }: { row: JudgeFinalistPickRow }) {
  const fetcher = useFetcher<FinalistPickActionData>();
  const saved = row.academyId ?? "";
  const form = useForm<FinalistPickFormValues>({
    resolver: zodResolver(finalistPickSchema),
    defaultValues: { academyId: saved, modalityId: row.modalityId },
  });
  const { reset } = form;

  useServerActionToast(fetcher.data, {
    toastId: `finalista-${row.modalityId}`,
  });

  // The revalidated list is what was saved: a successful save starts a clean
  // draft from it, and a refusal leaves the select on what the judge chose.
  useEffect(() => {
    reset({ academyId: saved, modalityId: row.modalityId });
  }, [reset, row.modalityId, saved]);

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
        options={row.options.map((option) => ({
          label: option.name,
          value: option.academyId,
        }))}
        placeholder="Elegí una academia"
      />
      <SubmitButton
        disabled={form.watch("academyId") === saved}
        isPending={fetcher.state !== "idle"}
      />
    </fetcher.Form>
  );
}

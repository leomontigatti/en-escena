import { useId } from "react";
import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

import { SharedFieldLayout } from "@/components/shared/field-layout";
import { Input } from "@/components/ui/input";

type ScoreInputFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = {
  autoFocus?: boolean;
  control: Control<TFieldValues>;
  id?: string;
  label: string;
  /** What the fixed suffix after the typed value reads: `/ 100` on a single score. */
  maximum: number;
  name: TName;
};

/**
 * The one field a judge taps in the dark. It takes digits and a single point —
 * the tablet's numeric keypad types a point and nothing else, and the score is
 * the deliberate exception to es-AR formatting — and carries its maximum right
 * after the value, so "90.5" is always read against what it is out of.
 */
export function ScoreInputField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  autoFocus,
  control,
  id: providedId,
  label,
  maximum,
  name,
}: ScoreInputFieldProps<TFieldValues, TName>) {
  const generatedId = useId();
  const id = providedId ?? generatedId;

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <SharedFieldLayout
          error={fieldState.error?.message}
          id={id}
          label={label}
        >
          {({ describedBy, isInvalid }) => (
            <div className="relative">
              <Input
                {...field}
                autoFocus={autoFocus}
                aria-describedby={describedBy || undefined}
                aria-invalid={isInvalid ? true : undefined}
                className="text-lg"
                id={id}
                inputMode="decimal"
                onChange={(event) => {
                  event.currentTarget.value = toScoreInputValue(
                    event.currentTarget.value,
                  );
                  field.onChange(event);
                }}
                pattern="[0-9.]*"
                type="text"
              />
              <ScoreInputSuffix maximum={maximum} value={field.value} />
            </div>
          )}
        </SharedFieldLayout>
      )}
    />
  );
}

/**
 * Digits and at most one point, in the order they were typed. A second point is
 * dropped rather than moved: the judge is looking at the stage, not the field,
 * and a value that rearranges itself under the thumb is worse than one that
 * ignores a stray tap.
 */
function toScoreInputValue(value: string) {
  const [whole, ...rest] = value.replace(/[^\d.]/g, "").split(".");

  return rest.length === 0 ? whole : `${whole}.${rest.join("")}`;
}

/**
 * The maximum sits right after the typed value and moves with it, laid over the
 * control on top of an invisible copy of that value — the same trick the integer
 * field uses, so no measurement is needed.
 */
function ScoreInputSuffix({
  maximum,
  value,
}: {
  maximum: number;
  value?: string;
}) {
  if (!value) {
    return null;
  }

  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 left-2.5 flex max-w-[calc(100%-1.25rem)] items-center overflow-hidden whitespace-pre text-lg"
    >
      <span className="invisible">{value}</span>
      <span className="text-muted-foreground">{` / ${maximum}`}</span>
    </span>
  );
}

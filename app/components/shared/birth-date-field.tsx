import { useId, type ClipboardEvent, type KeyboardEvent } from "react";
import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

import { SharedFieldLayout } from "@/components/shared/field-layout";
import { Input } from "@/components/ui/input";
import {
  formatDateOnlyAsDayMonthYear,
  isDateOnly,
  parseDayMonthYear,
} from "@/lib/shared/date-only";

/**
 * A birth date typed as `dd/mm/aaaa`, for dates decades back that a calendar
 * makes the user page through. The keypad is numeric and the slashes come by
 * themselves (`15032012` reads `15/03/2012`); a pasted date may use its own
 * separators (`1/3/2012` reads `01/03/2012`).
 *
 * The form holds a date-only value as soon as the text reads as a date, and
 * the text as typed until then, so the schema's birth-date rule can say what
 * to fix in it. Nothing is checked while typing: like every field, it answers
 * on submit.
 */
export function BirthDateField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  className,
  control,
  label,
  name,
}: {
  className?: string;
  control: Control<TFieldValues>;
  label: string;
  name: TName;
}) {
  const id = useId();

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const setText = (text: string) => {
          const parsed = parseDayMonthYear(text);
          field.onChange(parsed.ok ? parsed.dateOnly : text);
        };

        return (
          <SharedFieldLayout
            className={className}
            error={fieldState.error?.message}
            id={id}
            label={label}
          >
            {({ describedBy, isInvalid }) => (
              <>
                {/* What is posted, apart from what is shown. */}
                <input type="hidden" name={field.name} value={field.value} />
                <Input
                  ref={field.ref}
                  id={id}
                  value={toDisplayText(field.value)}
                  inputMode="numeric"
                  autoComplete="bday"
                  placeholder="dd/mm/aaaa"
                  aria-describedby={describedBy || undefined}
                  aria-invalid={isInvalid ? true : undefined}
                  onBlur={field.onBlur}
                  onChange={(event) => setText(maskDigits(event.target.value))}
                  onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                    const text = getTextWithoutSlashBeforeCaret(event);

                    if (text !== null) {
                      event.preventDefault();
                      setText(maskDigits(text));
                    }
                  }}
                  onPaste={(event: ClipboardEvent<HTMLInputElement>) => {
                    const parsed = parseDayMonthYear(
                      event.clipboardData.getData("text"),
                    );

                    if (parsed.ok) {
                      event.preventDefault();
                      field.onChange(parsed.dateOnly);
                    }
                  }}
                />
              </>
            )}
          </SharedFieldLayout>
        );
      }}
    />
  );
}

function toDisplayText(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return isDateOnly(value) ? formatDateOnlyAsDayMonthYear(value) : value;
}

/** Digits only, with `/` after the day and the month, eight digits at most. */
function maskDigits(text: string) {
  const digits = text.replace(/\D/g, "").slice(0, 8);

  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)]
    .filter(Boolean)
    .join("/");
}

/**
 * A backspace right after a slash takes the digit before it too: deleting the
 * slash alone would leave the digits as they were, and the mask would put it
 * straight back. `null` lets every other key through.
 */
function getTextWithoutSlashBeforeCaret(
  event: KeyboardEvent<HTMLInputElement>,
) {
  const { selectionEnd, selectionStart, value } = event.currentTarget;

  if (
    event.key !== "Backspace" ||
    selectionStart === null ||
    selectionStart !== selectionEnd ||
    value[selectionStart - 1] !== "/"
  ) {
    return null;
  }

  return value.slice(0, selectionStart - 2) + value.slice(selectionStart);
}

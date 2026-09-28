import { useId } from "react";
import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

import {
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

type OptionCard = {
  value: string;
  label: string;
  /** Greyed out and not selectable. */
  disabled?: boolean;
};

type OptionCardsFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = {
  control: Control<TFieldValues>;
  label: string;
  name: TName;
  onValueChange?: (value: string) => void;
  options: OptionCard[];
};

/**
 * A single choice with every option in view, one tap each: on a phone that is
 * one tap less than a select, and nothing opens over the page. Stacked on a
 * phone, two columns from `sm`.
 */
function OptionCardsField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  control,
  label,
  name,
  onValueChange,
  options,
}: OptionCardsFieldProps<TFieldValues, TName>) {
  const id = useId();
  const labelId = `${id}-label`;
  const errorId = `${id}-error`;

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <div className="flex flex-col gap-2">
          <span id={labelId} className="text-sm font-medium">
            {label}
          </span>
          <RadioGroup
            aria-describedby={fieldState.error ? errorId : undefined}
            aria-invalid={fieldState.error ? true : undefined}
            aria-labelledby={labelId}
            className="sm:grid-cols-2"
            value={typeof field.value === "string" ? field.value : ""}
            onValueChange={(value) => {
              field.onChange(value);
              onValueChange?.(value);
            }}
          >
            {options.map((option) => (
              <OptionCardItem
                key={option.value}
                id={`${id}-${option.value}`}
                option={option}
              />
            ))}
          </RadioGroup>
          <FieldError id={errorId}>{fieldState.error?.message}</FieldError>
        </div>
      )}
    />
  );
}

function OptionCardItem({ id, option }: { id: string; option: OptionCard }) {
  return (
    <FieldLabel htmlFor={id}>
      <Field
        orientation="horizontal"
        data-disabled={option.disabled ? true : undefined}
      >
        <FieldContent>
          <FieldTitle>{option.label}</FieldTitle>
        </FieldContent>
        <RadioGroupItem
          id={id}
          value={option.value}
          disabled={option.disabled}
        />
      </Field>
    </FieldLabel>
  );
}

export { OptionCardsField };

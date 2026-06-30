import * as React from "react";

import { Input } from "@/components/ui/input";

type IntegerInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "inputMode" | "onChange" | "pattern" | "type"
> & {
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
};

function getIntegerInputValue(value: string) {
  return value.replace(/\D/g, "");
}

function IntegerInput({ onChange, ...props }: IntegerInputProps) {
  return (
    <Input
      inputMode="numeric"
      pattern="[0-9]*"
      type="text"
      onChange={(event) => {
        event.currentTarget.value = getIntegerInputValue(
          event.currentTarget.value,
        );
        onChange?.(event);
      }}
      {...props}
    />
  );
}

export { IntegerInput, getIntegerInputValue };

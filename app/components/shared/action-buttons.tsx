import { Check, Trash } from "lucide-react";
import type { ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type BaseButtonProps = Omit<ComponentProps<typeof Button>, "children"> & {
  isPending: boolean;
};

type OptionalPendingButtonProps = Omit<
  ComponentProps<typeof Button>,
  "children"
> & {
  isPending?: boolean;
};

export function SubmitButton({
  disabled,
  isPending,
  ...buttonProps
}: BaseButtonProps) {
  return (
    <Button {...buttonProps} type="submit" disabled={disabled || isPending}>
      {isPending ? (
        <Spinner aria-hidden="true" data-icon />
      ) : (
        <Check aria-hidden="true" data-icon="inline-start" />
      )}
      Guardar
    </Button>
  );
}

export function DestroyButton({
  disabled,
  isPending = false,
  ...buttonProps
}: OptionalPendingButtonProps) {
  return (
    <Button
      {...buttonProps}
      type="submit"
      variant="destructive"
      disabled={disabled || isPending}
    >
      {isPending ? (
        <Spinner aria-hidden="true" data-icon />
      ) : (
        <Trash aria-hidden="true" data-icon="inline-start" />
      )}
      Eliminar
    </Button>
  );
}

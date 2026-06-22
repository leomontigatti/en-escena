import { Check, LoaderCircle, Trash } from "lucide-react";
import type { ComponentProps } from "react";

import { Button } from "@/components/ui/button";

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
        <LoaderCircle aria-hidden="true" className="animate-spin" data-icon />
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
        <LoaderCircle aria-hidden="true" className="animate-spin" data-icon />
      ) : (
        <Trash aria-hidden="true" data-icon="inline-start" />
      )}
      Eliminar
    </Button>
  );
}

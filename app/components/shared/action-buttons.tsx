import { Check, ChevronLeft, Trash2 } from "lucide-react";
import type { ComponentProps } from "react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/shared/utils";

type BaseButtonProps = Omit<ComponentProps<typeof Button>, "children"> & {
  isPending: boolean;
};

type BackButtonProps = Omit<
  ComponentProps<typeof Button>,
  "asChild" | "children" | "variant"
> & {
  to: ComponentProps<typeof Link>["to"];
  viewTransition?: boolean;
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
        <Spinner aria-hidden="true" data-icon="inline-start" />
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
        <Spinner aria-hidden="true" data-icon="inline-start" />
      ) : (
        <Trash2 aria-hidden="true" data-icon="inline-start" />
      )}
      Eliminar
    </Button>
  );
}

/**
 * On a phone it is its chevron alone, a square like an icon button, so a form
 * footer keeps `Volver`, `Descartar cambios` and `Guardar` on one row. The
 * word stays for screen readers.
 */
export function BackButton({
  className,
  to,
  viewTransition,
  ...buttonProps
}: BackButtonProps) {
  return (
    <Button
      {...buttonProps}
      asChild
      variant="outline"
      className={cn(
        "max-sm:w-8 max-sm:px-0 max-sm:has-data-[icon=inline-start]:pl-0",
        className,
      )}
    >
      <Link to={to} viewTransition={viewTransition}>
        <ChevronLeft aria-hidden="true" data-icon="inline-start" />
        <span className="max-sm:sr-only">Volver</span>
      </Link>
    </Button>
  );
}

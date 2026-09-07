import { Check, ChevronLeft, Trash } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { Link } from "react-router";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type BaseButtonProps = Omit<ComponentProps<typeof Button>, "children"> & {
  isPending: boolean;
};

type BackButtonProps = Omit<
  ComponentProps<typeof Button>,
  "asChild" | "children" | "variant"
> & {
  children?: ReactNode;
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

export function BackButton({
  children = "Volver",
  to,
  viewTransition,
  ...buttonProps
}: BackButtonProps) {
  return (
    <Button {...buttonProps} asChild variant="outline">
      <Link to={to} viewTransition={viewTransition}>
        <ChevronLeft aria-hidden="true" data-icon="inline-start" />
        {children}
      </Link>
    </Button>
  );
}

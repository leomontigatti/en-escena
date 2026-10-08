import { Check, ChevronLeft, Trash2 } from "lucide-react";
import type { ComponentProps, MouseEvent } from "react";
import { Link, useNavigate } from "react-router";

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
 * `Volver` does what the browser's back does when the page before this one is
 * the app's, so a list comes back with the filters, search and page it was
 * left on. With nothing of the app behind it, a page opened from a link or a
 * new tab, it goes to `to`. It is a link to `to` all along: that is what the
 * server renders, what works before hydration, and what a middle or modified
 * click opens.
 *
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
  const navigate = useNavigate();

  function goBack(event: MouseEvent<HTMLAnchorElement>) {
    if (isPlainClick(event) && hasAppEntryBehind()) {
      event.preventDefault();
      void navigate(-1);
    }
  }

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
      <Link to={to} viewTransition={viewTransition} onClick={goBack}>
        <ChevronLeft aria-hidden="true" data-icon="inline-start" />
        <span className="max-sm:sr-only">Volver</span>
      </Link>
    </Button>
  );
}

/**
 * React Router's browser history numbers its entries in `history.state.idx`,
 * from 0 for the one the tab opened the app on, so anything above 0 has one of
 * the app's pages behind it.
 */
function hasAppEntryBehind() {
  const state: unknown = window.history.state;

  return (
    typeof state === "object" &&
    state !== null &&
    "idx" in state &&
    typeof state.idx === "number" &&
    state.idx > 0
  );
}

function isPlainClick(event: MouseEvent<HTMLAnchorElement>) {
  return (
    event.button === 0 &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
  );
}

import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/shared/utils";

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/30 duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Refuses the press that only dismissed a layer above the dialog.
 *
 * While a `Select` (or any layer that disables outside pointer events) is open
 * over the dialog, Radix marks every element below it — the dialog content
 * included — with an inline `pointer-events: none`, so the press that dismisses
 * that layer lands on the overlay, exactly where a genuine outside press lands.
 * Radix's own guard against acting on such a press is `isPointerEventsEnabled`,
 * but the dialog defers its outside-pointer-down to the `click` that follows,
 * and by then the layer above is gone and the guard reads as enabled: the
 * dialog closes on a press the user meant for the select (#708).
 *
 * So the state has to be captured when the press happens, not when the dialog
 * decides. The content's own inline `pointer-events` is Radix's signal for "a
 * layer above me is capturing pointer events"; reading it during the capture
 * phase of `pointerdown` — before any layer reacts — restores the guard at the
 * only moment it is still true.
 */
function useLayerAbovePress(contentRef: React.RefObject<HTMLElement | null>) {
  const wasLayerAboveOpenRef = React.useRef(false);

  React.useEffect(() => {
    function captureLayerState() {
      wasLayerAboveOpenRef.current =
        contentRef.current?.style.pointerEvents === "none";
    }

    document.addEventListener("pointerdown", captureLayerState, true);

    return () => {
      document.removeEventListener("pointerdown", captureLayerState, true);
    };
  }, [contentRef]);

  return wasLayerAboveOpenRef;
}

function DialogContent({
  className,
  children,
  forceMount,
  onPointerDownOutside,
  overlayClassName,
  ref,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  forceMount?: true;
  overlayClassName?: string;
  showCloseButton?: boolean;
}) {
  const forceMountProps = forceMount ? { forceMount: true as const } : {};
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const wasLayerAboveOpenRef = useLayerAbovePress(contentRef);

  const assignContentRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      contentRef.current = node;

      if (typeof ref === "function") {
        ref(node);
        return;
      }

      if (ref) {
        ref.current = node;
      }
    },
    [ref],
  );

  return (
    <DialogPortal {...forceMountProps}>
      <DialogOverlay {...forceMountProps} className={overlayClassName} />
      <DialogPrimitive.Content
        {...forceMountProps}
        ref={assignContentRef}
        data-slot="dialog-content"
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border bg-background p-6 text-foreground shadow-lg duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className,
        )}
        onPointerDownOutside={(event) => {
          onPointerDownOutside?.(event);

          if (wasLayerAboveOpenRef.current) {
            event.preventDefault();
          }
        }}
        {...props}
      >
        <div
          data-slot="dialog-combobox-portal-host"
          className="pointer-events-none fixed inset-0 z-60"
        />
        {children}
        {showCloseButton ? (
          <DialogPrimitive.Close data-slot="dialog-close" asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute top-3 right-3"
            >
              <XIcon />
              <span className="sr-only">Cerrar</span>
            </Button>
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-1.5", className)}
      {...props}
    />
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg font-semibold", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
};

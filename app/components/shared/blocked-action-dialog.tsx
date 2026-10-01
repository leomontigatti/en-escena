import { Info } from "lucide-react";
import type { ReactNode } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/shared/utils";

type BlockedActionDialogProps = {
  /** Shown below the reasons: extra context such as the records involved. */
  children?: ReactNode;
  className?: string;
  /** What it takes to make the action possible. */
  description: ReactNode;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  /** Every reason the action is blocked, usually a list. */
  reasons: ReactNode;
  reasonsTitle: string;
  /** What cannot be done: `No se puede bonificar la coreografía`. */
  title: string;
};

/**
 * The acknowledgment an action opens instead of itself when the record's state
 * blocks it and that block is the record's normal state (style guide, Detail
 * pages): the action stays enabled, and the click says why it cannot run. It
 * asks nothing, so it has no verb: `Cerrar` is its only button. The server
 * still refuses the action, for the race.
 */
export function BlockedActionDialog({
  children,
  className,
  description,
  onOpenChange,
  open,
  reasons,
  reasonsTitle,
  title,
}: BlockedActionDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        // Bounded to the viewport, with the reasons as the row that gives way
        // and scrolls: a choreography can list a whole roster of them, and the
        // footer has to stay reachable on a phone.
        className={cn(
          "max-h-[calc(100dvh-2rem)] sm:max-w-lg",
          children
            ? "grid-rows-[auto_minmax(0,1fr)_auto_auto]"
            : "grid-rows-[auto_minmax(0,1fr)_auto]",
          className,
        )}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="min-h-0 overflow-y-auto overscroll-contain">
          <Alert variant="info">
            <Info aria-hidden="true" />
            <AlertTitle>{reasonsTitle}</AlertTitle>
            <AlertDescription>{reasons}</AlertDescription>
          </Alert>
        </div>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel>Cerrar</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

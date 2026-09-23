// PROTOTYPE (#223) — throwaway, never merge. The judge scoring prototype's
// shell and guards: the topbar and the discard and disqualify confirmations.

import { Ban, LogOut, RotateCcw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { EnEscenaAvatar } from "@/components/shared/en-escena-avatar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/shared/utils";

import {
  prototypeJudgeName,
  prototypeShowDayLabel,
  type Assignment,
} from "./fixtures";
import {
  formatAssignmentTitle,
  notifySaveFailed,
  type JudgingPrototypeStore,
} from "./shared";

// --- Confirmations ----------------------------------------------------------

export function DiscardChangesDialog({
  open,
  onKeepEditing,
  onDiscard,
}: {
  open: boolean;
  onKeepEditing: () => void;
  onDiscard: () => void;
}) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onKeepEditing();
        }
      }}
    >
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>¿Descartar los cambios?</AlertDialogTitle>
          <AlertDialogDescription>
            El puntaje y la devolución que cargaste en esta presentación no se
            van a guardar.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Seguir editando</AlertDialogCancel>
          <Button type="button" variant="destructive" onClick={onDiscard}>
            Descartar
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** The destructive trigger plus its confirmation, wherever a variant puts it. */
export function DisqualifyAction({
  assignment,
  audioUrl,
  className,
  onDisqualified,
  store,
}: {
  assignment: Assignment;
  audioUrl: string | null;
  className?: string;
  onDisqualified?: () => void;
  store: JudgingPrototypeStore;
}) {
  const [open, setOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);

  async function confirm() {
    setIsPending(true);
    try {
      await store.disqualify(assignment, audioUrl);
      setOpen(false);
      toast.success(
        `${formatAssignmentTitle(assignment)} quedó descalificada.`,
      );
      onDisqualified?.();
    } catch {
      notifySaveFailed();
    } finally {
      setIsPending(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="destructive"
        className={className}
        onClick={() => setOpen(true)}
      >
        <Ban aria-hidden="true" data-icon="inline-start" />
        Descalificar
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Descalificar la presentación?</AlertDialogTitle>
            <AlertDialogDescription>
              {formatAssignmentTitle(assignment)} se cierra para todo el jurado
              y queda fuera de los resultados. Podés dejar una devolución igual.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={isPending}
              onClick={() => void confirm()}
            >
              {isPending ? (
                <Spinner aria-hidden="true" data-icon />
              ) : (
                <Ban aria-hidden="true" data-icon="inline-start" />
              )}
              Descalificar
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * Where `Descalificar` sits once the presentation is disqualified: takes it
 * back, so the judge can score it again. No confirmation, since disqualifying
 * is one tap away if it was a mistake.
 */
export function ReinstateAction({
  assignment,
  store,
}: {
  assignment: Assignment;
  store: JudgingPrototypeStore;
}) {
  const [isPending, setIsPending] = useState(false);

  async function reinstate() {
    setIsPending(true);
    try {
      await store.reinstate(assignment);
      toast.success(
        `${formatAssignmentTitle(assignment)} volvió a los resultados.`,
      );
    } catch {
      notifySaveFailed();
    } finally {
      setIsPending(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      disabled={isPending}
      onClick={() => void reinstate()}
    >
      {isPending ? (
        <Spinner aria-hidden="true" data-icon />
      ) : (
        <RotateCcw aria-hidden="true" data-icon="inline-start" />
      )}
      Volver a calificar
    </Button>
  );
}

export function DisqualifiedNotice() {
  return (
    <Alert variant="destructive">
      <Ban aria-hidden="true" />
      <AlertDescription>
        Esta presentación está descalificada. Podés dejar una devolución.
      </AlertDescription>
    </Alert>
  );
}

// --- Shell ------------------------------------------------------------------

/** The judging shell's minimal topbar, per the style guide's navigation table. */
export function JudgeTopbar({
  email,
  className,
}: {
  email: string;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex min-h-16 items-center gap-3 border-b bg-background px-4 py-3",
        className,
      )}
    >
      <EnEscenaAvatar />
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium">
          Juzgamiento · {prototypeShowDayLabel}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {prototypeJudgeName} · {email}
        </span>
      </div>
      <form action="/salir" method="post" className="ml-auto">
        <Button type="submit" variant="ghost">
          <LogOut aria-hidden="true" data-icon="inline-start" />
          Salir
        </Button>
      </form>
    </header>
  );
}

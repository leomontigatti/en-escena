// PROTOTYPE (#223) — throwaway, never merge. The judge scoring prototype's
// shell and guards: the topbar with the theme toggle, the discard and
// disqualify confirmations, and the in-place selection guard.

import { AlertCircleIcon, Ban, LogOut, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
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
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/shared/utils";

import {
  prototypeJudgeName,
  prototypeShowDayLabel,
  type Assignment,
} from "./fixtures";
import {
  formatAssignmentTitle,
  getAssignmentStatus,
  notifySaveFailed,
  type JudgingPrototypeStore,
} from "./shared";

// --- Guarded selection ------------------------------------------------------

/**
 * For the variants that swap presentations in place instead of navigating:
 * the current one, and a switch that asks before dropping dirty changes. The
 * form reports its dirtiness up through `setIsDirty`.
 */
export function useGuardedSelection(initialId: string) {
  const [currentId, setCurrentId] = useState(initialId);
  const [requestedId, setRequestedId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (!isDirty) {
      return;
    }
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  function select(id: string) {
    if (id === currentId) {
      return;
    }
    if (isDirty) {
      setRequestedId(id);
      return;
    }
    setCurrentId(id);
  }

  /** After a save: the changes are stored, so nothing to guard. */
  function moveTo(id: string) {
    setIsDirty(false);
    setCurrentId(id);
  }

  return {
    currentId,
    select,
    moveTo,
    setIsDirty,
    discardDialog: (
      <DiscardChangesDialog
        open={requestedId !== null}
        onKeepEditing={() => setRequestedId(null)}
        onDiscard={() => {
          if (requestedId) {
            moveTo(requestedId);
          }
          setRequestedId(null);
        }}
      />
    ),
  };
}

export function useReportDirty(
  isDirty: boolean,
  setIsDirty: (isDirty: boolean) => void,
) {
  useEffect(() => {
    setIsDirty(isDirty);
  }, [isDirty, setIsDirty]);
}

export function findFirstPendingId(store: JudgingPrototypeStore) {
  return (
    store.assignments.find(
      (assignment) =>
        getAssignmentStatus(store.evaluations[assignment.id]) === "pendiente",
    ) ?? store.assignments[0]
  ).id;
}

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
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descalificar presentación</AlertDialogTitle>
            <AlertDialogDescription>
              {formatAssignmentTitle(assignment)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Alert variant="warning">
            <AlertCircleIcon aria-hidden="true" />
            <AlertDescription>
              Se cierra para todo el jurado y queda fuera de los resultados.
              Podés dejar una devolución igual.
            </AlertDescription>
          </Alert>
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

/**
 * The theatre question: the theme's own dark tokens, toggled on the document
 * so dialogs portalled to `body` follow too.
 */
export function useDarkTheme() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    return () => document.documentElement.classList.remove("dark");
  }, [isDark]);

  return { isDark, setIsDark };
}

/** The judging shell's minimal topbar, per the style guide's navigation table. */
export function JudgeTopbar({
  email,
  isDark,
  onDarkChange,
  className,
}: {
  email: string;
  isDark: boolean;
  onDarkChange: (isDark: boolean) => void;
  className?: string;
}) {
  return (
    <TooltipProvider>
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
        <div className="ml-auto flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={isDark ? "Usar tema claro" : "Usar tema oscuro"}
                onClick={() => onDarkChange(!isDark)}
              >
                {isDark ? (
                  <Sun aria-hidden="true" />
                ) : (
                  <Moon aria-hidden="true" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {isDark ? "Usar tema claro" : "Usar tema oscuro"}
            </TooltipContent>
          </Tooltip>
          <Separator orientation="vertical" className="h-6" />
          <form action="/salir" method="post">
            <Button type="submit" variant="ghost">
              <LogOut aria-hidden="true" data-icon="inline-start" />
              Salir
            </Button>
          </form>
        </div>
      </header>
    </TooltipProvider>
  );
}

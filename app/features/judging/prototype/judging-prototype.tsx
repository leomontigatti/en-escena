// PROTOTYPE (#223) — throwaway, never merge.
// "Tabla y diálogo", the design as the grilling decided it. The assigned list
// is a table; a single-score row opens a dialog, a sheet row goes to a full
// view at `?presentacion=`.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  useBeforeUnload,
  useBlocker,
  useNavigate,
  useSearchParams,
} from "react-router";

import { BackButton, SubmitButton } from "@/components/shared/action-buttons";
import {
  ClientDataTable,
  DataTableTruncatedText,
  type DataTableColumn,
} from "@/components/shared/data-table";
import { DataTableLink } from "@/components/shared/data-table-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";
import { formatPrimaryAndSecondaryValue } from "@/lib/shared/format-primary-and-secondary-value";
import { cn } from "@/lib/shared/utils";

import type { Assignment } from "./fixtures";
import {
  DiscardChangesDialog,
  DisqualifiedNotice,
  DisqualifyAction,
  JudgeTopbar,
  ReinstateAction,
} from "./chrome";
import { FeedbackRecorder } from "./recorder";
import {
  AssignmentStatusBadge,
  countScored,
  computeSheetTotal,
  CriteriaFieldSets,
  findNextPendingAssignment,
  findResumeAssignment,
  formatAssignmentDetails,
  formatAssignmentTitle,
  formatScore,
  getAssignmentStatus,
  notifyAllScored,
  SingleScoreField,
  useScoreSubmit,
  useScoreForm,
  type JudgingPrototypeStore,
} from "./shared";

const sheetParamName = "presentacion";
const listHref = "/juzgamiento";

export function JudgingPrototype({
  email,
  store,
}: {
  email: string;
  store: JudgingPrototypeStore;
}) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [dialogAssignmentId, setDialogAssignmentId] = useState<string | null>(
    null,
  );
  // Up here and not in the list, which unmounts while a sheet is open.
  const [lastOpenedId, setLastOpenedId] = useState<string | null>(null);
  const [isPendingOnly, setIsPendingOnly] = useState(false);
  const sheetAssignment = store.assignments.find(
    (assignment) =>
      assignment.id === searchParams.get(sheetParamName) && assignment.criteria,
  );
  const dialogAssignment = store.assignments.find(
    (assignment) => assignment.id === dialogAssignmentId,
  );

  function sheetHref(assignment: Assignment) {
    return `?${sheetParamName}=${assignment.id}`;
  }

  function openAssignment(assignment: Assignment) {
    setLastOpenedId(assignment.id);
    if (assignment.criteria) {
      setDialogAssignmentId(null);
      void navigate(sheetHref(assignment));
      return;
    }

    if (sheetAssignment) {
      void navigate(listHref);
    }
    setDialogAssignmentId(assignment.id);
  }

  function advanceFrom(assignmentId: string) {
    const next = findNextPendingAssignment(store, assignmentId);

    if (!next) {
      notifyAllScored();
      setDialogAssignmentId(null);
      if (sheetAssignment) {
        void navigate(listHref);
      }
      return;
    }

    openAssignment(next);
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <JudgeTopbar email={email} />
      <main
        id="contenido-principal"
        className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 pb-24"
      >
        {sheetAssignment ? (
          <SheetView
            key={sheetAssignment.id}
            assignment={sheetAssignment}
            store={store}
            onDone={advanceFrom}
          />
        ) : (
          <AssignedList
            isPendingOnly={isPendingOnly}
            lastOpenedId={lastOpenedId}
            store={store}
            onOpen={openAssignment}
            onPendingOnlyChange={setIsPendingOnly}
          />
        )}
      </main>

      {dialogAssignment ? (
        <ScoreDialog
          key={dialogAssignment.id}
          assignment={dialogAssignment}
          store={store}
          onClose={() => setDialogAssignmentId(null)}
          onDone={advanceFrom}
        />
      ) : null}
    </div>
  );
}

function AssignedList({
  isPendingOnly,
  lastOpenedId,
  onOpen,
  onPendingOnlyChange,
  store,
}: {
  isPendingOnly: boolean;
  lastOpenedId: string | null;
  onOpen: (assignment: Assignment) => void;
  onPendingOnlyChange: (isPendingOnly: boolean) => void;
  store: JudgingPrototypeStore;
}) {
  const resumeId = findResumeAssignment(store, lastOpenedId)?.id ?? null;
  const rows = isPendingOnly
    ? store.assignments.filter(
        (assignment) =>
          getAssignmentStatus(store.evaluations[assignment.id]) === "pendiente",
      )
    : store.assignments;

  useScrollToResumeRow(resumeId);

  const columns: DataTableColumn<Assignment>[] = [
    {
      id: "orden",
      header: "N.º",
      className: "font-medium tabular-nums",
      cell: (assignment) => String(assignment.orderNumber),
    },
    {
      id: "nombre",
      header: "Nombre",
      className: "font-medium",
      cell: (assignment) =>
        assignment.criteria ? (
          <DataTableLink to={`?${sheetParamName}=${assignment.id}`}>
            {assignment.name}
          </DataTableLink>
        ) : (
          <Button
            type="button"
            variant="link"
            className="h-auto p-0 text-left"
            onClick={() => onOpen(assignment)}
          >
            {assignment.name}
          </Button>
        ),
    },
    {
      id: "categoriaTipoGrupo",
      header: "Categoría / Tipo de grupo",
      className: "text-muted-foreground",
      cell: (assignment) => (
        <DataTableTruncatedText
          value={formatPrimaryAndSecondaryValue(
            assignment.categoryName,
            formatGroupTypeLabel(assignment.groupType),
          )}
        />
      ),
    },
    {
      id: "nivel",
      header: "Nivel",
      className: "text-muted-foreground",
      cell: (assignment) => assignment.experienceLevelName ?? "No aplica",
    },
    {
      id: "modalidadSubmodalidad",
      header: "Modalidad / Submodalidad",
      className: "text-muted-foreground",
      cell: (assignment) => (
        <DataTableTruncatedText
          value={formatPrimaryAndSecondaryValue(
            assignment.modalityName,
            assignment.submodalityName,
          )}
        />
      ),
    },
    {
      id: "estado",
      header: "Estado",
      cell: (assignment) => (
        <AssignmentStatusBadge
          status={getAssignmentStatus(store.evaluations[assignment.id])}
        />
      ),
    },
  ];

  return (
    <section className="flex flex-col gap-6" aria-labelledby="asignadas-title">
      <header className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="asignadas-title" className="text-xl font-semibold">
            Presentaciones asignadas
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            {countScored(store)} de {store.assignments.length} evaluadas. Tocá
            una presentación para puntuarla.
          </p>
        </div>
        <Field orientation="horizontal" className="ml-auto w-auto">
          <Switch
            id="solo-pendientes"
            checked={isPendingOnly}
            onCheckedChange={onPendingOnlyChange}
          />
          <FieldLabel htmlFor="solo-pendientes">Solo pendientes</FieldLabel>
        </Field>
      </header>

      <ClientDataTable
        rows={rows}
        columns={columns}
        getRowKey={(assignment) => assignment.id}
        getRowProps={(assignment) => ({
          id: getRowId(assignment.id),
          className: cn(
            "cursor-pointer",
            // Where the judge left off: the one row to find at a glance.
            assignment.id === resumeId &&
              "bg-primary/10 shadow-[inset_3px_0_0_var(--color-primary)] hover:bg-primary/15",
          ),
          onClick: () => onOpen(assignment),
        })}
        hideSearch
        searchPlaceholder=""
        hidePagination
        pageSize={Math.max(rows.length, 1)}
        emptyMessage={
          isPendingOnly
            ? "No te quedan presentaciones pendientes."
            : "No tenés presentaciones asignadas para hoy."
        }
      />
    </section>
  );
}

function getRowId(assignmentId: string) {
  return `presentacion-${assignmentId}`;
}

/**
 * Brings the judge's place into view whenever the list mounts: on load and on
 * the way back from a sheet. Only then, so a closing dialog leaves the scroll
 * where the judge put it.
 */
function useScrollToResumeRow(resumeId: string | null) {
  const resumeIdRef = useRef(resumeId);
  resumeIdRef.current = resumeId;

  useEffect(() => {
    if (resumeIdRef.current) {
      document
        .getElementById(getRowId(resumeIdRef.current))
        ?.scrollIntoView({ block: "center" });
    }
  }, []);
}

function ScoreDialog({
  assignment,
  onClose,
  onDone,
  store,
}: {
  assignment: Assignment;
  onClose: () => void;
  onDone: (assignmentId: string) => void;
  store: JudgingPrototypeStore;
}) {
  const score = useScoreForm(assignment, store.evaluations[assignment.id]);
  const [isDiscardOpen, setIsDiscardOpen] = useState(false);

  function requestClose() {
    if (score.isDirty) {
      setIsDiscardOpen(true);
      return;
    }
    onClose();
  }

  const { isSaving, onSubmit } = useScoreSubmit(store, assignment, score, () =>
    onDone(assignment.id),
  );

  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) {
            requestClose();
          }
        }}
      >
        <DialogContent
          // A stray tap in a dark room must not throw a score away.
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>{formatAssignmentTitle(assignment)}</DialogTitle>
            <DialogDescription>
              {formatAssignmentDetails(assignment)}
            </DialogDescription>
          </DialogHeader>

          <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
            <FieldGroup>
              {score.isDisqualified ? (
                <DisqualifiedNotice />
              ) : (
                <SingleScoreField control={score.form.control} />
              )}
              <FieldSeparator />
              <FeedbackRecorder
                audioUrl={score.audioUrl}
                onAudioUrlChange={score.setAudioUrl}
              />
            </FieldGroup>

            <DialogFooter className="sm:justify-between">
              {score.isDisqualified ? (
                <ReinstateAction assignment={assignment} store={store} />
              ) : (
                <DisqualifyAction
                  assignment={assignment}
                  audioUrl={score.audioUrl}
                  store={store}
                  onDisqualified={() => onDone(assignment.id)}
                />
              )}
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSaving}
                  onClick={requestClose}
                >
                  Cancelar
                </Button>
                <SubmitButton isPending={isSaving} />
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <DiscardChangesDialog
        open={isDiscardOpen}
        onKeepEditing={() => setIsDiscardOpen(false)}
        onDiscard={() => {
          setIsDiscardOpen(false);
          onClose();
        }}
      />
    </>
  );
}

function SheetView({
  assignment,
  onDone,
  store,
}: {
  assignment: Assignment;
  onDone: (assignmentId: string) => void;
  store: JudgingPrototypeStore;
}) {
  const criteria = assignment.criteria ?? [];
  const score = useScoreForm(assignment, store.evaluations[assignment.id]);
  // Set right before a save moves on, so the guard lets that one through.
  const allowNavigationRef = useRef(false);
  const blocker = useBlocker(
    () => score.isDirty && !allowNavigationRef.current,
  );
  const { isDirty } = score;

  useBeforeUnload(
    useCallback(
      (event: BeforeUnloadEvent) => {
        if (isDirty) {
          event.preventDefault();
        }
      },
      [isDirty],
    ),
  );

  function afterSave() {
    allowNavigationRef.current = true;
    onDone(assignment.id);
  }

  const { isSaving, onSubmit } = useScoreSubmit(
    store,
    assignment,
    score,
    afterSave,
  );

  return (
    <section className="flex flex-col gap-6" aria-labelledby="planilla-title">
      <header className="flex items-start gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-3">
            <h2 id="planilla-title" className="text-xl font-semibold">
              {formatAssignmentTitle(assignment)}
            </h2>
            <AssignmentStatusBadge
              status={getAssignmentStatus(store.evaluations[assignment.id])}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {formatAssignmentDetails(assignment)}
          </p>
        </div>
        {score.isDisqualified ? null : (
          <SheetTotal total={computeSheetTotal(criteria, score.values)} />
        )}
      </header>

      <form noValidate onSubmit={onSubmit}>
        <Card>
          <CardContent className="flex flex-col gap-6">
            {score.isDisqualified ? (
              <DisqualifiedNotice />
            ) : (
              <CriteriaFieldSets
                control={score.form.control}
                criteria={criteria}
                gridClassName="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
              />
            )}
            <FieldSeparator />
            <FeedbackRecorder
              audioUrl={score.audioUrl}
              onAudioUrlChange={score.setAudioUrl}
            />
          </CardContent>
          <CardFooter className="flex-wrap justify-between gap-3 border-0 bg-transparent pt-0">
            {score.isDisqualified ? (
              <ReinstateAction assignment={assignment} store={store} />
            ) : (
              <DisqualifyAction
                assignment={assignment}
                audioUrl={score.audioUrl}
                store={store}
                onDisqualified={afterSave}
              />
            )}
            <div className="flex gap-2">
              <BackButton to={listHref} />
              <SubmitButton isPending={isSaving} />
            </div>
          </CardFooter>
        </Card>
      </form>

      <DiscardChangesDialog
        open={blocker.state === "blocked"}
        onKeepEditing={() => blocker.reset?.()}
        onDiscard={() => blocker.proceed?.()}
      />
    </section>
  );
}

/** The sheet's running total, live as the judge types. */
function SheetTotal({ total }: { total: number }) {
  return (
    <p
      aria-live="polite"
      className="ml-auto shrink-0 text-2xl font-semibold whitespace-nowrap tabular-nums"
    >
      <span className="sr-only">Total: </span>
      {formatScore(total)}
      <span className="text-base font-normal text-muted-foreground">
        {" "}
        / 100
      </span>
    </p>
  );
}

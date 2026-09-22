// PROTOTYPE (#223) — throwaway, never merge.
// Variant A, "Tabla y diálogo": the design as the grilling decided it. The
// assigned list is a table; a single-score row opens a dialog, a sheet row
// goes to a full view at `?presentacion=` with prev/next.

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import {
  Link,
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
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldGroup, FieldSeparator } from "@/components/ui/field";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";
import { formatPrimaryAndSecondaryValue } from "@/lib/shared/format-primary-and-secondary-value";

import type { Assignment } from "./fixtures";
import {
  DiscardChangesDialog,
  DisqualifiedNotice,
  DisqualifyAction,
  JudgeTopbar,
} from "./chrome";
import { FeedbackRecorder } from "./recorder";
import {
  AssignmentStatusBadge,
  countScored,
  CriteriaFieldSets,
  findNextPendingAssignment,
  formatAssignmentDetails,
  formatAssignmentTitle,
  formatScore,
  getAssignmentStatus,
  notifyAllScored,
  SingleScoreField,
  summarizeSheet,
  useScoreSubmit,
  useScoreForm,
  type JudgingPrototypeStore,
} from "./shared";

type VariantProps = {
  email: string;
  isDark: boolean;
  onDarkChange: (isDark: boolean) => void;
  store: JudgingPrototypeStore;
};

const sheetParamName = "presentacion";

export function VariantA({ email, isDark, onDarkChange, store }: VariantProps) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [dialogAssignmentId, setDialogAssignmentId] = useState<string | null>(
    null,
  );
  const sheetAssignment = store.assignments.find(
    (assignment) =>
      assignment.id === searchParams.get(sheetParamName) && assignment.criteria,
  );
  const dialogAssignment = store.assignments.find(
    (assignment) => assignment.id === dialogAssignmentId,
  );

  function sheetHref(assignment: Assignment) {
    return `?variant=A&${sheetParamName}=${assignment.id}`;
  }

  function openAssignment(assignment: Assignment) {
    if (assignment.criteria) {
      setDialogAssignmentId(null);
      void navigate(sheetHref(assignment));
      return;
    }

    if (sheetAssignment) {
      void navigate("?variant=A");
    }
    setDialogAssignmentId(assignment.id);
  }

  function advanceFrom(assignmentId: string) {
    const next = findNextPendingAssignment(store, assignmentId);

    if (!next) {
      notifyAllScored();
      setDialogAssignmentId(null);
      if (sheetAssignment) {
        void navigate("?variant=A");
      }
      return;
    }

    openAssignment(next);
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <JudgeTopbar email={email} isDark={isDark} onDarkChange={onDarkChange} />
      <main
        id="contenido-principal"
        className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 pb-24"
      >
        {sheetAssignment ? (
          <SheetView
            key={sheetAssignment.id}
            assignment={sheetAssignment}
            sheetHref={sheetHref}
            store={store}
            onDone={advanceFrom}
          />
        ) : (
          <AssignedList store={store} onOpen={openAssignment} />
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
  onOpen,
  store,
}: {
  onOpen: (assignment: Assignment) => void;
  store: JudgingPrototypeStore;
}) {
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
          <DataTableLink to={`?variant=A&presentacion=${assignment.id}`}>
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
      cell: (assignment) => assignment.experienceLevelName,
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
      <header className="flex flex-col gap-1">
        <h2 id="asignadas-title" className="text-xl font-semibold">
          Presentaciones asignadas
        </h2>
        <p className="text-sm leading-6 text-muted-foreground">
          {countScored(store)} de {store.assignments.length} evaluadas. Tocá una
          presentación para puntuarla; podés corregir tus puntajes hasta las
          03:00.
        </p>
      </header>

      <ClientDataTable
        rows={store.assignments}
        columns={columns}
        getRowKey={(assignment) => assignment.id}
        getRowProps={(assignment) => ({
          className: "cursor-pointer",
          onClick: () => onOpen(assignment),
        })}
        hideSearch
        searchPlaceholder=""
        hidePagination
        pageSize={store.assignments.length}
        emptyMessage="No tenés presentaciones asignadas para hoy."
      />
    </section>
  );
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
                <span />
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
  sheetHref,
  store,
}: {
  assignment: Assignment;
  onDone: (assignmentId: string) => void;
  sheetHref: (assignment: Assignment) => string;
  store: JudgingPrototypeStore;
}) {
  const criteria = assignment.criteria ?? [];
  const score = useScoreForm(assignment, store.evaluations[assignment.id]);
  const summary = summarizeSheet(criteria, score.values);
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

  // Prev/next step through every assignment, scored or not, in program order.
  const index = store.assignments.findIndex(({ id }) => id === assignment.id);
  const previous = store.assignments[index - 1];
  const next = store.assignments[index + 1];

  function siblingHref(sibling: Assignment) {
    return sibling.criteria ? sheetHref(sibling) : "?variant=A";
  }

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
      <div className="flex flex-wrap items-center gap-2">
        <BackButton to="?variant=A" />
        <div className="ml-auto flex gap-2">
          {previous ? (
            <Button asChild variant="outline">
              <Link to={siblingHref(previous)}>
                <ChevronLeft aria-hidden="true" data-icon="inline-start" />
                N.º {previous.orderNumber}
              </Link>
            </Button>
          ) : null}
          {next ? (
            <Button asChild variant="outline">
              <Link to={siblingHref(next)}>
                N.º {next.orderNumber}
                <ChevronRight aria-hidden="true" data-icon="inline-end" />
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <header className="flex flex-col gap-1">
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
      </header>

      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-6">
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
        </Card>

        {score.isDisqualified ? null : (
          <div>
            <DisqualifyAction
              assignment={assignment}
              audioUrl={score.audioUrl}
              store={store}
              onDisqualified={afterSave}
            />
          </div>
        )}

        <div className="sticky bottom-0 -mx-4 flex items-center gap-4 border-t bg-background px-4 py-3">
          {score.isDisqualified ? (
            <span className="text-sm text-muted-foreground">Descalificada</span>
          ) : (
            <div className="flex flex-col">
              <span className="text-2xl font-semibold tabular-nums">
                {formatScore(summary.total)}
                <span className="text-base font-normal text-muted-foreground">
                  {" "}
                  / 100
                </span>
              </span>
              <span className="text-xs text-muted-foreground">
                {formatScore(summary.additions)} −{" "}
                {formatScore(summary.deductions)}
                {summary.missing > 0
                  ? ` · faltan ${summary.missing} criterios`
                  : ""}
              </span>
            </div>
          )}
          <SubmitButton className="ml-auto" isPending={isSaving} />
        </div>
      </form>

      <DiscardChangesDialog
        open={blocker.state === "blocked"}
        onKeepEditing={() => blocker.reset?.()}
        onDiscard={() => blocker.proceed?.()}
      />
    </section>
  );
}

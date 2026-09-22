// PROTOTYPE (#223) — throwaway, never merge.
// Variant B, "Siguiente al frente": no list first. The presentation on stage
// fills the screen with its score inline, sheet or not; the program sits in a
// side sheet, and saving moves the stage to the next pending one.

import { ChevronLeft, ChevronRight, ListOrdered } from "lucide-react";

import { SubmitButton } from "@/components/shared/action-buttons";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FieldGroup, FieldSeparator } from "@/components/ui/field";
import { Progress } from "@/components/ui/progress";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useState } from "react";

import type { Assignment } from "./fixtures";
import {
  DisqualifiedNotice,
  DisqualifyAction,
  findFirstPendingId,
  JudgeTopbar,
  useGuardedSelection,
  useReportDirty,
} from "./chrome";
import { FeedbackRecorder } from "./recorder";
import {
  AssignmentStatusBadge,
  countScored,
  CriteriaFieldSets,
  findNextPendingAssignment,
  formatAssignmentDetails,
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

export function VariantB({ email, isDark, onDarkChange, store }: VariantProps) {
  const selection = useGuardedSelection(findFirstPendingId(store));
  const [isProgramOpen, setIsProgramOpen] = useState(false);
  const index = store.assignments.findIndex(
    ({ id }) => id === selection.currentId,
  );
  const current = store.assignments[index];
  const scoredCount = countScored(store);
  const upcoming = store.assignments
    .slice(index + 1)
    .filter(
      (assignment) =>
        getAssignmentStatus(store.evaluations[assignment.id]) === "pendiente",
    )
    .slice(0, 3);

  function advanceFrom(assignmentId: string) {
    const next = findNextPendingAssignment(store, assignmentId);

    if (!next) {
      notifyAllScored();
      selection.setIsDirty(false);
      return;
    }

    selection.moveTo(next.id);
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <JudgeTopbar email={email} isDark={isDark} onDarkChange={onDarkChange} />
      <main
        id="contenido-principal"
        className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6 pb-24"
      >
        <div className="flex items-center gap-4">
          <div className="flex flex-1 flex-col gap-2">
            <span className="text-sm text-muted-foreground">
              {scoredCount} de {store.assignments.length} evaluadas
            </span>
            <Progress value={(scoredCount / store.assignments.length) * 100} />
          </div>
          <Sheet open={isProgramOpen} onOpenChange={setIsProgramOpen}>
            <SheetTrigger asChild>
              <Button type="button" variant="outline" size="lg">
                <ListOrdered aria-hidden="true" data-icon="inline-start" />
                Ver programa
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Programa de hoy</SheetTitle>
                <SheetDescription>
                  Tus presentaciones asignadas, en orden.
                </SheetDescription>
              </SheetHeader>
              <ol className="flex flex-col gap-1 overflow-y-auto px-4 pb-4">
                {store.assignments.map((assignment) => (
                  <li key={assignment.id}>
                    <Button
                      type="button"
                      variant={
                        assignment.id === selection.currentId
                          ? "secondary"
                          : "ghost"
                      }
                      aria-current={
                        assignment.id === selection.currentId
                          ? "true"
                          : undefined
                      }
                      className="h-auto w-full justify-start gap-3 py-3 text-left"
                      onClick={() => {
                        setIsProgramOpen(false);
                        selection.select(assignment.id);
                      }}
                    >
                      <span className="w-8 tabular-nums">
                        {assignment.orderNumber}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {assignment.name}
                      </span>
                      <AssignmentStatusBadge
                        status={getAssignmentStatus(
                          store.evaluations[assignment.id],
                        )}
                      />
                    </Button>
                  </li>
                ))}
              </ol>
            </SheetContent>
          </Sheet>
        </div>

        {current ? (
          <StageCard
            key={current.id}
            assignment={current}
            previous={store.assignments[index - 1]}
            next={store.assignments[index + 1]}
            selection={selection}
            store={store}
            onDone={advanceFrom}
          />
        ) : null}

        {upcoming.length > 0 ? (
          <section
            className="flex flex-col gap-2"
            aria-labelledby="sigue-title"
          >
            <h2 id="sigue-title" className="text-sm font-medium">
              A continuación
            </h2>
            <ol className="flex flex-col divide-y rounded-lg border">
              {upcoming.map((assignment) => (
                <li
                  key={assignment.id}
                  className="flex items-center gap-3 px-4 py-3 text-sm"
                >
                  <span className="w-8 font-medium tabular-nums">
                    {assignment.orderNumber}
                  </span>
                  <span className="font-medium">{assignment.name}</span>
                  <span className="truncate text-muted-foreground">
                    {formatAssignmentDetails(assignment)}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
      </main>
      {selection.discardDialog}
    </div>
  );
}

function StageCard({
  assignment,
  next,
  onDone,
  previous,
  selection,
  store,
}: {
  assignment: Assignment;
  next: Assignment | undefined;
  onDone: (assignmentId: string) => void;
  previous: Assignment | undefined;
  selection: ReturnType<typeof useGuardedSelection>;
  store: JudgingPrototypeStore;
}) {
  const score = useScoreForm(assignment, store.evaluations[assignment.id]);
  useReportDirty(score.isDirty, selection.setIsDirty);

  const { isSaving, onSubmit } = useScoreSubmit(store, assignment, score, () =>
    onDone(assignment.id),
  );

  const summary = assignment.criteria
    ? summarizeSheet(assignment.criteria, score.values)
    : null;

  return (
    <form noValidate onSubmit={onSubmit}>
      <Card>
        <CardHeader>
          <CardDescription>En escena</CardDescription>
          <CardTitle className="flex items-baseline gap-3 text-2xl">
            <span className="tabular-nums">N.º {assignment.orderNumber}</span>
            <span>{assignment.name}</span>
          </CardTitle>
          <CardDescription>
            {formatAssignmentDetails(assignment)}
          </CardDescription>
          <CardAction>
            <AssignmentStatusBadge
              status={getAssignmentStatus(store.evaluations[assignment.id])}
            />
          </CardAction>
        </CardHeader>

        <CardContent>
          <FieldGroup>
            {score.isDisqualified ? (
              <DisqualifiedNotice />
            ) : assignment.criteria ? (
              <CriteriaFieldSets
                control={score.form.control}
                criteria={assignment.criteria}
                gridClassName="grid gap-4 sm:grid-cols-2"
              />
            ) : (
              <SingleScoreField
                control={score.form.control}
                inputClassName="h-14 text-2xl md:text-2xl"
              />
            )}
            <FieldSeparator />
            <FeedbackRecorder
              audioUrl={score.audioUrl}
              onAudioUrlChange={score.setAudioUrl}
            />
          </FieldGroup>
        </CardContent>

        <CardFooter className="flex flex-col items-stretch gap-4">
          {summary ? (
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">
                Total
                {summary.missing > 0
                  ? ` · faltan ${summary.missing} criterios`
                  : ""}
              </span>
              <span className="text-3xl font-semibold tabular-nums">
                {formatScore(summary.total)}
              </span>
            </div>
          ) : null}
          <SubmitButton size="lg" className="w-full" isPending={isSaving} />
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!previous}
              onClick={() => previous && selection.select(previous.id)}
            >
              <ChevronLeft aria-hidden="true" data-icon="inline-start" />
              Anterior
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!next}
              onClick={() => next && selection.select(next.id)}
            >
              Siguiente
              <ChevronRight aria-hidden="true" data-icon="inline-end" />
            </Button>
            {score.isDisqualified ? null : (
              <DisqualifyAction
                className="ml-auto"
                assignment={assignment}
                audioUrl={score.audioUrl}
                store={store}
                onDisqualified={() => onDone(assignment.id)}
              />
            )}
          </div>
        </CardFooter>
      </Card>
    </form>
  );
}

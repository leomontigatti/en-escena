// PROTOTYPE (#223) — throwaway, never merge.
// Variant C, "Lista y panel": master-detail on one screen. The list never
// leaves; the selected presentation scores in a panel beside it, and a sheet
// is a dense table with its total in the footer.

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
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/shared/utils";

import type { Assignment, Criterion } from "./fixtures";
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
  findNextPendingAssignment,
  formatAssignmentDetails,
  formatAssignmentTitle,
  formatScore,
  getAssignmentStatus,
  notifyAllScored,
  ScoreInputField,
  SingleScoreField,
  summarizeSheet,
  useScoreSubmit,
  useScoreForm,
  type JudgingPrototypeStore,
  type ScoreFormState,
} from "./shared";

type VariantProps = {
  email: string;
  isDark: boolean;
  onDarkChange: (isDark: boolean) => void;
  store: JudgingPrototypeStore;
};

export function VariantC({ email, isDark, onDarkChange, store }: VariantProps) {
  const selection = useGuardedSelection(findFirstPendingId(store));
  const current = store.assignments.find(
    ({ id }) => id === selection.currentId,
  );

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
    <div className="flex h-screen flex-col bg-background">
      <JudgeTopbar email={email} isDark={isDark} onDarkChange={onDarkChange} />
      <main
        id="contenido-principal"
        className="grid min-h-0 flex-1 gap-4 p-4 pb-20 md:grid-cols-[18rem_1fr]"
      >
        <Card className="min-h-0">
          <CardHeader>
            <CardTitle>Presentaciones</CardTitle>
            <CardDescription>
              {countScored(store)} de {store.assignments.length} evaluadas
            </CardDescription>
          </CardHeader>
          <CardContent className="min-h-0 overflow-y-auto">
            <ol className="flex flex-col gap-1">
              {store.assignments.map((assignment) => {
                const isCurrent = assignment.id === selection.currentId;

                return (
                  <li key={assignment.id}>
                    <Button
                      type="button"
                      variant={isCurrent ? "secondary" : "ghost"}
                      aria-current={isCurrent ? "true" : undefined}
                      className="h-auto w-full items-start justify-start gap-3 py-2.5 text-left"
                      onClick={() => selection.select(assignment.id)}
                    >
                      <span className="w-7 font-semibold tabular-nums">
                        {assignment.orderNumber}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="truncate">{assignment.name}</span>
                        <span className="truncate text-xs font-normal text-muted-foreground">
                          {assignment.submodalityName ??
                            assignment.modalityName}
                        </span>
                      </span>
                      <AssignmentStatusBadge
                        status={getAssignmentStatus(
                          store.evaluations[assignment.id],
                        )}
                      />
                    </Button>
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>

        {current ? (
          <ScorePanel
            key={current.id}
            assignment={current}
            selection={selection}
            store={store}
            onDone={advanceFrom}
          />
        ) : null}
      </main>
      {selection.discardDialog}
    </div>
  );
}

function ScorePanel({
  assignment,
  onDone,
  selection,
  store,
}: {
  assignment: Assignment;
  onDone: (assignmentId: string) => void;
  selection: ReturnType<typeof useGuardedSelection>;
  store: JudgingPrototypeStore;
}) {
  const score = useScoreForm(assignment, store.evaluations[assignment.id]);
  useReportDirty(score.isDirty, selection.setIsDirty);

  const { isSaving, onSubmit } = useScoreSubmit(store, assignment, score, () =>
    onDone(assignment.id),
  );

  return (
    <form noValidate onSubmit={onSubmit} className="min-h-0">
      <Card className="max-h-full">
        <CardHeader>
          <CardTitle>{formatAssignmentTitle(assignment)}</CardTitle>
          <CardDescription>
            {formatAssignmentDetails(assignment)}
          </CardDescription>
          <CardAction>
            <AssignmentStatusBadge
              status={getAssignmentStatus(store.evaluations[assignment.id])}
            />
          </CardAction>
        </CardHeader>

        <CardContent className="min-h-0 overflow-y-auto">
          <FieldGroup>
            {score.isDisqualified ? (
              <DisqualifiedNotice />
            ) : assignment.criteria ? (
              <CriteriaTable criteria={assignment.criteria} score={score} />
            ) : (
              <SingleScoreField control={score.form.control} />
            )}
            <FieldSeparator />
            <FeedbackRecorder
              audioUrl={score.audioUrl}
              onAudioUrlChange={score.setAudioUrl}
            />
          </FieldGroup>
        </CardContent>

        <CardFooter className="gap-2 border-t">
          {score.isDisqualified ? null : (
            <DisqualifyAction
              assignment={assignment}
              audioUrl={score.audioUrl}
              store={store}
              onDisqualified={() => onDone(assignment.id)}
            />
          )}
          <SubmitButton className="ml-auto" isPending={isSaving} />
        </CardFooter>
      </Card>
    </form>
  );
}

/** The sheet read like the paper one: a row per criterion, total at the foot. */
function CriteriaTable({
  criteria,
  score,
}: {
  criteria: Criterion[];
  score: ScoreFormState;
}) {
  const summary = summarizeSheet(criteria, score.values);
  const rows = [
    ...criteria.filter((criterion) => !criterion.deducts),
    ...criteria.filter((criterion) => criterion.deducts),
  ];

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Criterio</TableHead>
          <TableHead className="text-right">Máximo</TableHead>
          <TableHead className="w-40">Puntaje</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((criterion, index) => (
          <TableRow key={criterion.id}>
            <TableCell className={cn(criterion.deducts && "text-destructive")}>
              {criterion.deducts ? `− ${criterion.name}` : criterion.name}
            </TableCell>
            <TableCell className="text-right tabular-nums text-muted-foreground">
              {formatScore(criterion.max)}
            </TableCell>
            <TableCell className="align-top whitespace-normal">
              <ScoreInputField
                autoFocus={index === 0}
                control={score.form.control}
                label={criterion.name}
                labelClassName="sr-only"
                name={criterion.id}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={2}>
            Total
            {summary.missing > 0 ? (
              <span className="font-normal text-muted-foreground">
                {" "}
                · faltan {summary.missing} criterios
              </span>
            ) : null}
          </TableCell>
          <TableCell className="text-lg tabular-nums">
            {formatScore(summary.total)} / 100
          </TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}

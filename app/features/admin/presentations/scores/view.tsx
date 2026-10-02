import { zodResolver } from "@hookform/resolvers/zod";
import { Info, Undo2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useForm, useFormState } from "react-hook-form";
import { Link, useNavigation, useSubmit } from "react-router";

import {
  AdminResourceFormCard,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { BackButton, SubmitButton } from "@/components/shared/action-buttons";
import { AlertStack } from "@/components/shared/alert-stack";
import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { MetricCard } from "@/components/shared/metric-card";
import { PinnedActions } from "@/components/shared/pinned-actions";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { FieldGroup, FieldLegend, FieldSet } from "@/components/ui/field";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FeedbackPlayback } from "@/features/judging/score/feedback-playback";
import {
  buildJudgeSheetFormSchema,
  buildSheetEditSubmission,
  judgeScoreFormSchema,
  type JudgeScoreFormValues,
  type JudgeSheetFormValues,
} from "@/features/judging/score/form-shared";
import { ScoreInputField } from "@/features/judging/score/score-input-field";
import {
  formatPresentationSummary,
  formatPresentationTitle,
} from "@/features/judging/score/presentation-heading";
import { SheetParts } from "@/features/judging/score/sheet-parts";
import { choreographyDetailPath } from "@/lib/choreographies/admin-paths";
import type { JudgeSheetCriterion } from "@/lib/judging/judge-list.server";
import { medalLabels } from "@/lib/judging/medal";
import type { PresentationJudgeScore } from "@/lib/judging/presentation-scores.server";
import {
  formatScoreFieldValue,
  singleScoreMaximum,
} from "@/lib/judging/score-value";
import { isRouteFormPending, useSavedFormValues } from "@/lib/shared/forms";

import type {
  PresentationScoresActionData,
  PresentationScoresLoaderData,
} from "./server";

/**
 * One presentation's panel, which only administration and the auditor read.
 * The auditor sees exactly this and writes nothing, so the page has no role of
 * its own to render — what it offers to act on is `canEdit`'s to decide.
 *
 * Every number a judge gave is written with a decimal point, as the judge typed
 * it: the scoring surface is the deliberate exception to es-AR formatting, and
 * a score that reads one way on the tablet and another here would be two
 * different scores to the eye.
 *
 * What administration may change, it changes in place: a score is a field where
 * its value was, saved on its own. A judge who saved nothing has no field at
 * all — administration corrects the panel's work and never invents it — and
 * there is nowhere to record a `Devolución`, which is the judge's voice.
 */

const noValueText = "Sin puntaje";
const noScoresText = "Sin puntajes";
const notApplicableText = "No aplica";
const noFeedbackText = "Sin devolución";

export function PresentationScoresView({
  actionData,
  loaderData,
}: {
  actionData?: PresentationScoresActionData;
  loaderData: PresentationScoresLoaderData;
}) {
  const { canEdit, presentation } = loaderData;
  const fieldErrors = actionData?.fieldErrors ?? {};

  return (
    <AdminResourceLayout
      description={formatPresentationSummary(presentation)}
      requireSelectedEvent={false}
      title={formatPresentationTitle(presentation)}
      headerAction={
        <PresentationActions canEdit={canEdit} presentation={presentation} />
      }
    >
      <AlertStack>
        {presentation.disqualified ? (
          <Alert variant="info">
            <Info aria-hidden="true" />
            <AlertTitle>Presentación descalificada</AlertTitle>
            <AlertDescription>
              Queda fuera de los resultados, sin promedio ni medalla.
            </AlertDescription>
          </Alert>
        ) : null}
      </AlertStack>
      <div className="grid gap-4 md:grid-cols-2">
        <MetricCard title="Promedio" value={averageText(presentation)} />
        <MetricCard title="Medalla" value={medalText(presentation)} />
      </div>
      {presentation.criteria.length === 0 ? (
        <SingleScoresTable
          canEdit={canEdit}
          fieldErrors={fieldErrors}
          judges={presentation.judges}
        />
      ) : (
        <JudgeSheets
          canEdit={canEdit}
          criteria={presentation.criteria}
          fieldErrors={fieldErrors}
          judges={presentation.judges}
        />
      )}
    </AdminResourceLayout>
  );
}

type Presentation = PresentationScoresLoaderData["presentation"];

/**
 * The record's actions: the way to the choreography, and — for administration
 * only — the disqualification. It is rare and pulls the presentation out of the
 * results, so it asks first; reinstating puts back exactly what was there and
 * does not.
 */
function PresentationActions({
  canEdit,
  presentation,
}: {
  canEdit: boolean;
  presentation: Presentation;
}) {
  const submit = useSubmit();
  const navigation = useNavigation();
  // Either way the presentation is mid-change, so neither is offered again
  // until the page has the answer.
  const isSettling =
    isRouteFormPending(navigation, { intent: "disqualify" }) ||
    isRouteFormPending(navigation, { intent: "reinstate" });
  const [isDisqualifyDialogOpen, setIsDisqualifyDialogOpen] = useState(false);
  const submitIntent = (intent: "disqualify" | "reinstate") => {
    void submit({ intent }, { method: "post" });
  };

  return (
    <>
      <ResourceActionsMenu contentClassName="w-48">
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link
              to={choreographyDetailPath({
                academyId: presentation.academyId,
                choreographyId: presentation.choreographyId,
              })}
            >
              Ver la coreografía
            </Link>
          </DropdownMenuItem>
          {canEdit && presentation.disqualified ? (
            <DropdownMenuItem
              disabled={isSettling}
              onSelect={() => submitIntent("reinstate")}
            >
              Volver a calificar
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuGroup>
        {canEdit && !presentation.disqualified ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                disabled={isSettling}
                variant="destructive"
                onSelect={() => setIsDisqualifyDialogOpen(true)}
              >
                Descalificar
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </>
        ) : null}
      </ResourceActionsMenu>
      <ConfirmationDialog
        confirmLabel="Descalificar"
        description="Queda fuera de los resultados, sin promedio ni medalla. Los puntajes guardados se conservan y vuelven si la calificás de nuevo."
        destructive
        onConfirm={() => submitIntent("disqualify")}
        onOpenChange={setIsDisqualifyDialogOpen}
        open={isDisqualifyDialogOpen}
        title="¿Descalificar la presentación?"
      />
    </>
  );
}

/**
 * A disqualified presentation has no result to give, so its average and medal
 * do not apply; one no judge has scored yet simply has none so far.
 */
function averageText(presentation: Presentation) {
  if (presentation.disqualified) {
    return notApplicableText;
  }

  return presentation.average === null
    ? noScoresText
    : String(presentation.average);
}

function medalText(presentation: Presentation) {
  if (presentation.disqualified) {
    return notApplicableText;
  }

  return presentation.medal === null
    ? noScoresText
    : medalLabels[presentation.medal];
}

function SingleScoresTable({
  canEdit,
  fieldErrors,
  judges,
}: {
  canEdit: boolean;
  fieldErrors: Record<string, string>;
  judges: readonly PresentationJudgeScore[];
}) {
  return (
    <ScoresTable>
      <TableHeader>
        <TableRow>
          <TableHead>Jurado</TableHead>
          <TableHead>Puntaje</TableHead>
          <TableHead>Devolución</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {judges.map((judge) => (
          <TableRow key={judge.judgeAssignmentId}>
            <TableCell>{judge.judgeName}</TableCell>
            <TableCell>
              {canEdit && judge.scoreId ? (
                <SingleScoreForm
                  error={fieldErrors[judge.scoreId]}
                  scoreId={judge.scoreId}
                  value={judge.value}
                />
              ) : (
                <ScoreValue value={judge.value} />
              )}
            </TableCell>
            <TableCell>
              <FeedbackCell audioUrl={judge.feedbackAudioUrl} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </ScoresTable>
  );
}

/**
 * Framed like the app's data tables, so a list of scores reads as the lists
 * everywhere else do; it has nothing to search, sort or page, so it takes the
 * frame without the table machinery.
 */
function ScoresTable({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border bg-background">
      <Table className="[&_td]:px-3 [&_th]:px-3">{children}</Table>
    </div>
  );
}

/**
 * A sheet is a table on its own, so the panel is read one judge at a time
 * rather than as a grid nobody can scan on a phone at the side of a stage.
 */
function JudgeSheets({
  canEdit,
  criteria,
  fieldErrors,
  judges,
}: {
  canEdit: boolean;
  criteria: readonly JudgeSheetCriterion[];
  fieldErrors: Record<string, string>;
  judges: readonly PresentationJudgeScore[];
}) {
  const [first] = judges;

  if (!first) {
    return null;
  }

  return (
    <Tabs defaultValue={first.judgeAssignmentId}>
      <TabsList variant="line">
        {judges.map((judge) => (
          <TabsTrigger
            key={judge.judgeAssignmentId}
            value={judge.judgeAssignmentId}
          >
            {judge.judgeName}
          </TabsTrigger>
        ))}
      </TabsList>
      {judges.map((judge) => (
        <TabsContent
          className="flex flex-col gap-4 pt-2 data-[state=inactive]:hidden"
          forceMount
          key={judge.judgeAssignmentId}
          value={judge.judgeAssignmentId}
        >
          {canEdit && judge.scoreId ? (
            <SheetForm
              criteria={criteria}
              fieldErrors={fieldErrors}
              judge={judge}
              scoreId={judge.scoreId}
            />
          ) : (
            <>
              <ScoresTable>
                <TableHeader>
                  <TableRow>
                    <TableHead>Criterio</TableHead>
                    <TableHead>Puntaje</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {criteria.map((criterion) => (
                    <TableRow key={criterion.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {criterion.name}
                          {criterion.kind === "deducts" ? (
                            <Badge variant="outline">Resta</Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <ScoreValue
                            value={judge.criteriaValues[criterion.id] ?? null}
                          />
                          <span className="text-sm text-muted-foreground">
                            / {criterion.maximum}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell className="font-medium">Total</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <ScoreValue value={judge.value} />
                        <span className="text-sm text-muted-foreground">
                          {`/ ${singleScoreMaximum}`}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </ScoresTable>
              <FeedbackCell audioUrl={judge.feedbackAudioUrl} />
            </>
          )}
        </TabsContent>
      ))}
    </Tabs>
  );
}

/**
 * One judge's single score, saved on its own. The panel is a table of separate
 * decisions, so a correction to one judge's number must never carry another's
 * along with it — and an administrator who edits two rows and saves one has
 * changed exactly what they saved.
 *
 * It is the judge's own field, validated by the judge's own rule before it is
 * posted: a correction that the save would refuse is refused here, next to the
 * number, rather than after a round trip.
 */
function SingleScoreForm({
  error,
  scoreId,
  value,
}: {
  error?: string;
  scoreId: string;
  value: string | null;
}) {
  const saved = { value: formatScoreFieldValue(value) };
  const form = useForm<JudgeScoreFormValues>({
    defaultValues: saved,
    resolver: zodResolver(judgeScoreFormSchema),
  });
  const { isDirty } = useFormState({ control: form.control });
  const submit = useSubmit();
  const isSubmitting = isRouteFormPending(useNavigation(), {
    fields: { scoreId },
    intent: "edit-score",
  });

  // A saved correction is the row's new starting point, so `Guardar` waits for
  // the next change instead of offering to post the same number again.
  useSavedFormValues(form, saved);

  return (
    <form
      className="flex items-start gap-2"
      method="post"
      onSubmit={form.handleSubmit((values) => {
        void submit(
          { intent: "edit-score", scoreId, value: values.value },
          { method: "post" },
        );
      })}
    >
      <ScoreInputField
        className="max-w-36"
        control={form.control}
        // What the save refused belongs on the field, beside the number that was
        // typed; the form's own message takes over as soon as it is retyped.
        error={error}
        id={`puntaje-${scoreId}`}
        label="Puntaje"
        // The column this field sits in is already headed `Puntaje`, so the
        // label is bound to the input and read out rather than repeated.
        labelClassName="sr-only"
        maximum={singleScoreMaximum}
        name="value"
      />
      <SubmitButton disabled={!isDirty} isPending={isSubmitting} size="sm" />
    </form>
  );
}

/**
 * The whole sheet is one save, because its criterion values and the total they
 * add up to are one decision: a line saved without the rest would leave a total
 * that no longer matches what is under it.
 *
 * Each line is the judge's own field under its own visible label, so the sheet
 * an administrator corrects reads as the sheet the judge filled. The judge's
 * `Devolución` heads it, and the lines are split the way the criteria are
 * configured (`sheetParts`), each part with its own sum and the judge's total
 * apart under them. The sums are the judge sheet's own (`sheetTotal`): what the
 * sheet would save right now, with a half-typed value counting as nothing.
 */
function SheetForm({
  criteria,
  fieldErrors,
  judge,
  scoreId,
}: {
  criteria: readonly JudgeSheetCriterion[];
  fieldErrors: Record<string, string>;
  judge: PresentationJudgeScore;
  scoreId: string;
}) {
  // Exactly what the judge stored, and empty where they stored nothing:
  // administration corrects the panel's work and never invents it.
  const saved = {
    values: Object.fromEntries(
      criteria.map((criterion) => [
        criterion.id,
        formatScoreFieldValue(judge.criteriaValues[criterion.id]),
      ]),
    ),
  };
  const form = useForm<JudgeSheetFormValues>({
    defaultValues: saved,
    mode: "onSubmit",
    resolver: zodResolver(buildJudgeSheetFormSchema(criteria)),
  });
  const { isDirty } = useFormState({ control: form.control });

  // A save starts a clean draft from what was saved; a refused one keeps what
  // was typed, which still differs from it.
  useSavedFormValues(form, saved);

  const submit = useSubmit();
  const isSubmitting = isRouteFormPending(useNavigation(), {
    fields: { scoreId },
    intent: "edit-score",
  });
  return (
    <form
      method="post"
      onSubmit={form.handleSubmit((values) => {
        void submit(buildSheetEditSubmission({ scoreId, values }), {
          method: "post",
        });
      })}
    >
      <AdminResourceFormCard
        footer={
          // `FormActions` without its leave guard: a guard sits on the router
          // and the router holds one, while every judge's tab holds a form.
          <PinnedActions>
            <BackButton to="/administracion/presentacion" />
            <div className="flex items-center gap-3">
              {isDirty ? (
                <Button
                  disabled={isSubmitting}
                  onClick={() => form.reset()}
                  type="button"
                  variant="outline"
                >
                  <Undo2 aria-hidden="true" data-icon="inline-start" />
                  Descartar cambios
                </Button>
              ) : null}
              <SubmitButton disabled={!isDirty} isPending={isSubmitting} />
            </div>
          </PinnedActions>
        }
      >
        <FieldGroup>
          <FieldSet className="gap-2">
            <FieldLegend>Devolución</FieldLegend>
            <FeedbackCell audioUrl={judge.feedbackAudioUrl} />
          </FieldSet>
          <SheetParts
            control={form.control}
            criteria={criteria}
            fieldErrors={fieldErrors}
            fieldIdPrefix={`criterio-${scoreId}`}
          />
        </FieldGroup>
      </AdminResourceFormCard>
    </form>
  );
}

function ScoreValue({ value }: { value: string | null }) {
  return value === null ? (
    <span className="text-sm text-muted-foreground">{noValueText}</span>
  ) : (
    <span className="font-medium tabular-nums">{formatScoreText(value)}</span>
  );
}

function FeedbackCell({ audioUrl }: { audioUrl: string | null }) {
  return audioUrl === null ? (
    <Badge variant="secondary">{noFeedbackText}</Badge>
  ) : (
    <FeedbackPlayback audioUrl={audioUrl} />
  );
}

/**
 * The column keeps one decimal, which a judge reading their own score never
 * typed: `90.0` is the number 90 written twice over.
 */
function formatScoreText(value: string) {
  return String(Number.parseFloat(value));
}

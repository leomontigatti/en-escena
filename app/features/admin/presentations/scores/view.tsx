import { Form, useNavigation, useSubmit } from "react-router";

import {
  AdminResourceFormCard,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { experienceLevelLabels } from "@/lib/events/experience-levels";
import type { JudgeSheetCriterion } from "@/lib/judging/judge-list.server";
import { medalLabels } from "@/lib/judging/medal";
import type { PresentationJudgeScore } from "@/lib/judging/presentation-scores.server";
import { singleScoreMaximum } from "@/lib/judging/score-value";
import { isRouteFormPending } from "@/lib/shared/forms";
import { sheetCriterionFieldPrefix } from "@/features/judging/score/form-shared";

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
      description={describePresentation(presentation)}
      requireSelectedEvent={false}
      title={presentation.name}
      action={{
        label: "Ver la coreografía",
        to: `/administracion/coreografias/${presentation.choreographyId}`,
      }}
    >
      <ResultCard canEdit={canEdit} presentation={presentation} />
      {presentation.criteria.length === 0 ? (
        <SingleScoresCard
          canEdit={canEdit}
          fieldErrors={fieldErrors}
          judges={presentation.judges}
        />
      ) : (
        <SheetsCard
          canEdit={canEdit}
          criteria={presentation.criteria}
          fieldErrors={fieldErrors}
          judges={presentation.judges}
        />
      )}
    </AdminResourceLayout>
  );
}

function ResultCard({
  canEdit,
  presentation,
}: {
  canEdit: boolean;
  presentation: PresentationScoresLoaderData["presentation"];
}) {
  return (
    <AdminResourceFormCard title="Resultado">
      {presentation.disqualified ? (
        <div className="flex flex-col gap-2">
          <Badge variant="destructive" className="w-fit">
            Descalificada
          </Badge>
          <p className="text-sm text-muted-foreground">
            Una presentación descalificada queda fuera de los resultados.
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">Promedio</span>
            <span className="text-2xl font-semibold tabular-nums">
              {presentation.average === null
                ? "—"
                : String(presentation.average)}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">Medalla</span>
            <span className="text-base font-medium">
              {presentation.medal === null
                ? "—"
                : medalLabels[presentation.medal]}
            </span>
          </div>
        </div>
      )}
      {canEdit ? (
        <DisqualificationForm disqualified={presentation.disqualified} />
      ) : null}
    </AdminResourceFormCard>
  );
}

/**
 * Administration settles a disqualification whenever the question is settled,
 * which is routinely after the judges' day closed — so unlike the judge's own
 * button this one is never out of season, and never asks twice: the panel is
 * already on screen to undo it with.
 */
function DisqualificationForm({ disqualified }: { disqualified: boolean }) {
  const isSubmitting = isRouteFormPending(useNavigation(), {
    intent: disqualified ? "reinstate" : "disqualify",
  });

  return (
    <Form className="w-fit" method="post">
      <input
        name="intent"
        type="hidden"
        value={disqualified ? "reinstate" : "disqualify"}
      />
      <Button
        disabled={isSubmitting}
        type="submit"
        variant={disqualified ? "outline" : "destructive"}
      >
        {disqualified ? "Volver a calificar" : "Descalificar"}
      </Button>
    </Form>
  );
}

function SingleScoresCard({
  canEdit,
  fieldErrors,
  judges,
}: {
  canEdit: boolean;
  fieldErrors: Record<string, string>;
  judges: readonly PresentationJudgeScore[];
}) {
  return (
    <AdminResourceFormCard title="Puntajes del jurado">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Jurado</TableHead>
            <TableHead>Puntaje</TableHead>
            <TableHead>Anular</TableHead>
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
                    maximum={singleScoreMaximum}
                    scoreId={judge.scoreId}
                    value={judge.value}
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    <ScoreValue value={judge.value} />
                    {judge.annulled ? (
                      <Badge variant="outline">Anulado</Badge>
                    ) : null}
                  </div>
                )}
              </TableCell>
              <TableCell>
                {canEdit && judge.scoreId ? (
                  <AnnulSwitch
                    annulled={judge.annulled}
                    scoreId={judge.scoreId}
                  />
                ) : judge.annulled ? (
                  <Badge variant="outline">Anulado</Badge>
                ) : null}
              </TableCell>
              <TableCell>
                <FeedbackCell audioUrl={judge.feedbackAudioUrl} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </AdminResourceFormCard>
  );
}

/**
 * A sheet is a table on its own, so the panel is read one judge at a time
 * rather than as a grid nobody can scan on a phone at the side of a stage.
 */
function SheetsCard({
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
    <AdminResourceFormCard title="Planillas del jurado">
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
            className="flex flex-col gap-4"
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
              <Table>
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
                        {judge.annulled ? (
                          <Badge variant="outline">Anulado</Badge>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
            <FeedbackCell audioUrl={judge.feedbackAudioUrl} />
          </TabsContent>
        ))}
      </Tabs>
    </AdminResourceFormCard>
  );
}

/**
 * One judge's single score, saved on its own. The panel is a table of separate
 * decisions, so a correction to one judge's number must never carry another's
 * along with it — and an administrator who edits two rows and saves one has
 * changed exactly what they saved.
 */
function SingleScoreForm({
  error,
  maximum,
  scoreId,
  value,
}: {
  error?: string;
  maximum: number;
  scoreId: string;
  value: string | null;
}) {
  const isSubmitting = isRouteFormPending(useNavigation(), {
    fields: { scoreId },
    intent: "edit-score",
  });

  return (
    <Form className="flex flex-col gap-1" method="post">
      <input name="intent" type="hidden" value="edit-score" />
      <input name="scoreId" type="hidden" value={scoreId} />
      <div className="flex items-center gap-2">
        <Input
          aria-invalid={error ? true : undefined}
          aria-label="Puntaje"
          className="w-24 tabular-nums"
          defaultValue={value === null ? "" : formatScoreText(value)}
          inputMode="decimal"
          key={value}
          name="value"
          pattern="[0-9.]*"
          type="text"
        />
        <span className="text-sm text-muted-foreground">/ {maximum}</span>
        <Button disabled={isSubmitting} size="sm" type="submit">
          Guardar
        </Button>
      </div>
      <FieldError error={error} />
    </Form>
  );
}

/**
 * The whole sheet is one save, because its criterion values and the total they
 * add up to are one decision: a line saved without the rest would leave a total
 * that no longer matches what is under it.
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
  const isSubmitting = isRouteFormPending(useNavigation(), {
    fields: { scoreId },
    intent: "edit-score",
  });

  return (
    <Form className="flex flex-col gap-4" method="post">
      <input name="intent" type="hidden" value="edit-score" />
      <input name="scoreId" type="hidden" value={scoreId} />
      <Table>
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
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <Input
                      aria-invalid={
                        fieldErrors[criterion.id] ? true : undefined
                      }
                      aria-label={criterion.name}
                      className="w-24 tabular-nums"
                      defaultValue={formatCriterionText(
                        judge.criteriaValues[criterion.id],
                      )}
                      inputMode="decimal"
                      name={`${sheetCriterionFieldPrefix}${criterion.id}`}
                      pattern="[0-9.]*"
                      type="text"
                    />
                    <span className="text-sm text-muted-foreground">
                      / {criterion.maximum}
                    </span>
                  </div>
                  <FieldError error={fieldErrors[criterion.id]} />
                </div>
              </TableCell>
            </TableRow>
          ))}
          <TableRow>
            <TableCell className="font-medium">Total</TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <ScoreValue value={judge.value} />
                <span className="text-sm text-muted-foreground">{`/ ${singleScoreMaximum}`}</span>
              </div>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <div className="flex items-center gap-4">
        <Button disabled={isSubmitting} type="submit">
          Guardar
        </Button>
        <AnnulSwitch annulled={judge.annulled} scoreId={scoreId} />
      </div>
    </Form>
  );
}

/**
 * An annulment is a decision about what counts rather than an edit, so it saves
 * the moment it is made: there is nothing to type and nothing to confirm, and
 * the same switch brings the score back.
 */
function AnnulSwitch({
  annulled,
  scoreId,
}: {
  annulled: boolean;
  scoreId: string;
}) {
  const submit = useSubmit();
  const isSubmitting = isRouteFormPending(useNavigation(), {
    fields: { scoreId },
    intent: "annul-score",
  });
  const id = `anular-${scoreId}`;

  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={annulled}
        disabled={isSubmitting}
        id={id}
        onCheckedChange={(checked) => {
          void submit(
            {
              annulled: String(checked),
              intent: "annul-score",
              scoreId,
            },
            { method: "post" },
          );
        }}
      />
      <Label htmlFor={id}>Anular</Label>
    </div>
  );
}

function FieldError({ error }: { error?: string }) {
  return error ? (
    <p className="text-sm text-destructive" role="alert">
      {error}
    </p>
  ) : null;
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
    <span className="text-sm text-muted-foreground">{noFeedbackText}</span>
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

/** An empty field is a criterion the judge never filled, not a zero. */
function formatCriterionText(value: string | undefined) {
  return value === undefined ? "" : formatScoreText(value);
}

function describePresentation(
  presentation: PresentationScoresLoaderData["presentation"],
) {
  const level = presentation.experienceLevel
    ? experienceLevelLabels[presentation.experienceLevel]
    : "No aplica";

  return [
    `N.º ${presentation.orderNumber}`,
    presentation.academyName,
    presentation.categoryName,
    level,
    presentation.submodalityName
      ? `${presentation.modalityName} · ${presentation.submodalityName}`
      : presentation.modalityName,
  ].join(" · ");
}

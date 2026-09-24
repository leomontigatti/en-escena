import {
  AdminResourceFormCard,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { Badge } from "@/components/ui/badge";
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

import type { PresentationScoresLoaderData } from "./server";

/**
 * One presentation's panel, which only administration and the auditor read.
 * The auditor sees exactly this and writes nothing, so the page has no role of
 * its own to render — what it offers to act on is `canEdit`'s to decide.
 *
 * Every number a judge gave is written with a decimal point, as the judge typed
 * it: the scoring surface is the deliberate exception to es-AR formatting, and
 * a score that reads one way on the tablet and another here would be two
 * different scores to the eye.
 */

const noValueText = "Sin puntaje";
const noFeedbackText = "Sin devolución";

export function PresentationScoresView({
  loaderData,
}: {
  loaderData: PresentationScoresLoaderData;
}) {
  const { presentation } = loaderData;

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
      <ResultCard presentation={presentation} />
      {presentation.criteria.length === 0 ? (
        <SingleScoresCard judges={presentation.judges} />
      ) : (
        <SheetsCard
          criteria={presentation.criteria}
          judges={presentation.judges}
        />
      )}
    </AdminResourceLayout>
  );
}

function ResultCard({
  presentation,
}: {
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
    </AdminResourceFormCard>
  );
}

function SingleScoresCard({
  judges,
}: {
  judges: readonly PresentationJudgeScore[];
}) {
  return (
    <AdminResourceFormCard title="Puntajes del jurado">
      <Table>
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
                <div className="flex items-center gap-2">
                  <ScoreValue value={judge.value} />
                  {judge.annulled ? (
                    <Badge variant="outline">Anulado</Badge>
                  ) : null}
                </div>
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
  criteria,
  judges,
}: {
  criteria: readonly JudgeSheetCriterion[];
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
                        / 100
                      </span>
                      {judge.annulled ? (
                        <Badge variant="outline">Anulado</Badge>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
            <FeedbackCell audioUrl={judge.feedbackAudioUrl} />
          </TabsContent>
        ))}
      </Tabs>
    </AdminResourceFormCard>
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

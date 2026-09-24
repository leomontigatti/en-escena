import { Ban } from "lucide-react";

import { PortalListPage } from "@/components/portal/ui";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { FeedbackPlayback } from "@/features/judging/score/feedback-playback";
import { medalLabels, type Medal } from "@/lib/judging/medal";
import { formatScoreFieldValue } from "@/lib/judging/score-value";
import type { SheetCriterion } from "@/lib/judging/sheet-total";

import type {
  PortalEvaluationJudge,
  PortalPresentationEvaluationLoaderData,
} from "./server";

/**
 * What the academy reads about one of its presentations: the medal beside the
 * title, the average at the top right, and a card per judge with the score, the
 * sheet it came from and the `Devolución` to listen to.
 *
 * Nothing is decided here. Every judge on screen is one the loader kept, and a
 * disqualified presentation reaches the view with no numbers at all, so the
 * page only has to lay out what it was given.
 */

const medalBadgeVariants: Record<
  Medal,
  "info" | "outline" | "secondary" | "warning"
> = {
  bronze: "outline",
  gold: "warning",
  silver: "secondary",
  specialMention: "info",
};

const noFeedbackMessage = "Este juez no dejó devolución.";

const disqualifiedEvaluationMessage =
  "Esta presentación fue descalificada: no tiene puntaje ni premio. Las devoluciones del jurado están abajo.";

export function PortalPresentationEvaluationView({
  loaderData,
}: {
  loaderData: PortalPresentationEvaluationLoaderData;
}) {
  return (
    <PortalListPage
      titleId="evaluacion-title"
      title={
        <span className="flex flex-wrap items-center gap-2">
          {loaderData.title}
          <EvaluationBadge
            disqualified={loaderData.disqualified}
            medal={loaderData.medal}
          />
        </span>
      }
      description={loaderData.details}
      action={
        loaderData.average === null ? null : (
          <p className="text-xl font-semibold tabular-nums">
            {loaderData.average}
            <span className="text-sm font-normal text-muted-foreground">
              {" "}
              / 100
            </span>
          </p>
        )
      }
    >
      {loaderData.disqualified ? (
        <Alert variant="destructive">
          <Ban aria-hidden="true" />
          <AlertDescription>{disqualifiedEvaluationMessage}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {loaderData.judges.map((judge) => (
          <JudgeCard
            key={judge.judgeId}
            criteria={loaderData.criteria}
            judge={judge}
          />
        ))}
      </div>
    </PortalListPage>
  );
}

/** A disqualification takes the medal's place; without either there is none. */
function EvaluationBadge({
  disqualified,
  medal,
}: {
  disqualified: boolean;
  medal: Medal | null;
}) {
  if (disqualified) {
    return <Badge variant="destructive">Descalificada</Badge>;
  }

  return medal === null ? null : (
    <Badge variant={medalBadgeVariants[medal]}>{medalLabels[medal]}</Badge>
  );
}

function JudgeCard({
  criteria,
  judge,
}: {
  criteria: SheetCriterion[];
  judge: PortalEvaluationJudge;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{judge.judgeName}</CardTitle>
        {judge.value === null ? null : (
          <CardAction className="font-semibold tabular-nums">
            {formatScoreFieldValue(judge.value)}
            <span className="font-normal text-muted-foreground"> / 100</span>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {criteria.length > 0 ? (
          <>
            <SheetBreakdown criteria={criteria} values={judge.criteriaValues} />
            <Separator />
          </>
        ) : null}
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Devolución</p>
          {judge.feedbackAudioUrl ? (
            <FeedbackPlayback audioUrl={judge.feedbackAudioUrl} />
          ) : (
            <p className="text-sm text-muted-foreground">{noFeedbackMessage}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * The sheet as the judge filled it: what the dance earned, then what it lost.
 * The divider is what says a deduction is a penalty rather than a share, so no
 * line has to be labelled as subtracting — which is also why it only appears
 * when there is something on both sides of it. A sheet of nothing but adding
 * criteria would otherwise end on a rule under an empty list.
 */
function SheetBreakdown({
  criteria,
  values,
}: {
  criteria: SheetCriterion[];
  values: Record<string, string>;
}) {
  const adding = criteria.filter((criterion) => criterion.kind === "adds");
  const deductions = criteria.filter(
    (criterion) => criterion.kind === "deducts",
  );

  return (
    <div className="flex flex-col gap-3">
      {adding.length > 0 ? (
        <CriteriaValues criteria={adding} values={values} />
      ) : null}
      {adding.length > 0 && deductions.length > 0 ? <Separator /> : null}
      {deductions.length > 0 ? (
        <CriteriaValues criteria={deductions} values={values} />
      ) : null}
    </div>
  );
}

function CriteriaValues({
  criteria,
  values,
}: {
  criteria: SheetCriterion[];
  values: Record<string, string>;
}) {
  return (
    <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 text-sm">
      {criteria.map((criterion) => (
        <div key={criterion.id} className="contents">
          <dt className="text-muted-foreground">{criterion.name}</dt>
          <dd className="text-right tabular-nums">
            {formatCriterionValue(criterion, values[criterion.id])}
            <span className="text-muted-foreground">
              {" "}
              / {criterion.maximum}
            </span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** A deduction that bit carries the minus sign; a zero is nothing taken away. */
function formatCriterionValue(
  criterion: SheetCriterion,
  value: string | undefined,
) {
  const written = formatScoreFieldValue(value) || "0";

  return criterion.kind === "deducts" && written !== "0"
    ? `−${written}`
    : written;
}

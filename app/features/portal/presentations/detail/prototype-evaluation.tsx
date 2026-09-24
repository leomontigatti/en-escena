// PROTOTYPE (#223) — throwaway, never merge. What an academy reads about one
// of its presentations once results are published: every judge by name, their
// score, sheet and `Devolución`, the average and the medal. Annulled scores
// and judges who did not score are left out.

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
import { FeedbackPlayback } from "@/features/judging/prototype/playback";
import {
  formatPrototypeScore,
  prototypeAcrobaticsCriteria,
  type PrototypeCriterion,
  type PrototypePublishedResult,
  type PrototypeScore,
} from "@/features/judging/prototype/results-fixtures";

export type PrototypeEvaluationLoaderData = {
  details: string;
  isSheet: boolean;
  result: NonNullable<PrototypePublishedResult>;
  scores: PrototypeScore[];
  title: string;
};

export function PrototypeEvaluationView({
  loaderData,
}: {
  loaderData: PrototypeEvaluationLoaderData;
}) {
  const { result, scores } = loaderData;

  return (
    <PortalListPage
      titleId="evaluacion-title"
      title={
        <span className="flex flex-wrap items-center gap-2">
          {loaderData.title}
          {result.kind === "descalificada" ? (
            <Badge variant="destructive">Descalificada</Badge>
          ) : (
            <Badge variant={result.medal.variant}>{result.medal.label}</Badge>
          )}
        </span>
      }
      description={loaderData.details}
      action={
        result.kind === "descalificada" ? null : (
          <p className="text-xl font-semibold tabular-nums">
            {formatPrototypeScore(result.average)}
            <span className="text-sm font-normal text-muted-foreground">
              {" "}
              / 100
            </span>
          </p>
        )
      }
    >
      {result.kind === "descalificada" ? (
        <Alert variant="destructive">
          <Ban aria-hidden="true" />
          <AlertDescription>
            Esta presentación fue descalificada: no tiene puntaje ni premio. Las
            devoluciones del jurado están abajo.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {scores.map((score) => (
          <JudgeCard
            key={score.judgeId}
            isDisqualified={result.kind === "descalificada"}
            isSheet={loaderData.isSheet}
            score={score}
          />
        ))}
      </div>
    </PortalListPage>
  );
}

// fallow-ignore-next-line complexity -- PROTOTYPE (#223): throwaway, untested by design.
function JudgeCard({
  isDisqualified,
  isSheet,
  score,
}: {
  isDisqualified: boolean;
  isSheet: boolean;
  score: PrototypeScore;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{score.judgeName}</CardTitle>
        {isDisqualified || score.value === null ? null : (
          <CardAction className="font-semibold tabular-nums">
            {formatPrototypeScore(score.value)}
            <span className="font-normal text-muted-foreground"> / 100</span>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isSheet && !isDisqualified && score.criterionValues ? (
          <>
            <SheetBreakdown values={score.criterionValues} />
            <Separator />
          </>
        ) : null}
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Devolución</p>
          {score.audioUrl ? (
            <FeedbackPlayback audioUrl={score.audioUrl} disabled={false} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Este juez no dejó devolución.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SheetBreakdown({ values }: { values: Record<string, number> }) {
  const adds = prototypeAcrobaticsCriteria.filter(({ deducts }) => !deducts);
  const deducts = prototypeAcrobaticsCriteria.filter(({ deducts }) => deducts);

  return (
    <div className="flex flex-col gap-3">
      <CriteriaValues criteria={adds} values={values} />
      <Separator />
      <CriteriaValues criteria={deducts} values={values} />
    </div>
  );
}

function CriteriaValues({
  criteria,
  values,
}: {
  criteria: PrototypeCriterion[];
  values: Record<string, number>;
}) {
  return (
    <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 text-sm">
      {/* fallow-ignore-next-line complexity -- PROTOTYPE (#223): throwaway, untested by design. */}
      {criteria.map((criterion) => (
        <div key={criterion.id} className="contents">
          <dt className="text-muted-foreground">{criterion.name}</dt>
          <dd className="text-right tabular-nums">
            {criterion.deducts && (values[criterion.id] ?? 0) > 0 ? "−" : ""}
            {formatPrototypeScore(values[criterion.id] ?? 0)}
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

// PROTOTYPE (#223, #1152) — throwaway, never merge. One presentation's scores
// for administration: every judge's value or sheet, annul switches, audio, the
// average and the medal, and disqualification. The choreography is real; the
// scores are the made-up ones of `results-fixtures.ts`, edited in memory.

import { zodResolver } from "@hookform/resolvers/zod";
import { Ban } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { useForm, useWatch, type Control } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import {
  AdminResourceFormCard,
  AdminResourceLayout,
} from "@/components/admin/resource-layout";
import { BackButton, SubmitButton } from "@/components/shared/action-buttons";
import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FeedbackPlayback } from "@/features/judging/prototype/playback";
import {
  computePrototypeAverage,
  computePrototypeSheetTotal,
  formatPrototypeScore,
  getPrototypeMedal,
  prototypeAcrobaticsCriteria,
  type PrototypeScore,
} from "@/features/judging/prototype/results-fixtures";
import {
  ScoreInputField,
  type ScoreValues,
} from "@/features/judging/prototype/shared";

export type PrototypeScoresLoaderData = {
  canEdit: boolean;
  choreographyId: string;
  details: string;
  isDisqualified: boolean;
  isSheet: boolean;
  orderNumber: number;
  scores: PrototypeScore[];
  selectedEventId: string;
  title: string;
};

const listHref = "/administracion/presentacion";

// --- Form values ------------------------------------------------------------

/** One flat record: `j1` for a single score, `j1__tecnica` on a sheet. */
function fieldName(judgeId: string, criterionId?: string) {
  return criterionId ? `${judgeId}__${criterionId}` : judgeId;
}

// fallow-ignore-next-line complexity -- PROTOTYPE (#223): throwaway, untested by design.
function toFormValues(scores: PrototypeScore[], isSheet: boolean) {
  const values: ScoreValues = {};
  for (const score of scores) {
    if (score.value === null) {
      continue;
    }
    if (isSheet && score.criterionValues) {
      for (const criterion of prototypeAcrobaticsCriteria) {
        values[fieldName(score.judgeId, criterion.id)] = String(
          score.criterionValues[criterion.id] ?? 0,
        );
      }
    } else {
      values[fieldName(score.judgeId)] = String(score.value);
    }
  }
  return values;
}

// fallow-ignore-next-line complexity -- PROTOTYPE (#223): throwaway, untested by design.
function isValidScore(value: string | undefined, max: number) {
  const normalized = (value ?? "").trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    return false;
  }
  const parsed = Number(normalized);
  return parsed >= 0 && parsed <= max && Number.isInteger(parsed * 2);
}

// fallow-ignore-next-line complexity -- PROTOTYPE (#223): throwaway, untested by design.
function buildSchema(scores: PrototypeScore[], isSheet: boolean) {
  const shape: Record<string, z.ZodType<string>> = {};
  const scoreField = (max: number) =>
    z
      .string()
      .trim()
      .min(1, "Este campo es obligatorio.")
      .refine((value) => isValidScore(value, max), {
        message: `Ingresá un valor de 0 a ${max}, de 0.5 en 0.5.`,
      });

  for (const score of scores) {
    if (score.value === null) {
      continue;
    }
    if (isSheet) {
      for (const criterion of prototypeAcrobaticsCriteria) {
        shape[fieldName(score.judgeId, criterion.id)] = scoreField(
          criterion.maximum,
        );
      }
    } else {
      shape[fieldName(score.judgeId)] = scoreField(100);
    }
  }
  return z.record(z.string(), z.string()).and(z.object(shape));
}

/** The judge's value as the form has it now, for the live average. */
// fallow-ignore-next-line complexity -- PROTOTYPE (#223): throwaway, untested by design.
function readLiveValue(
  score: PrototypeScore,
  values: Partial<ScoreValues>,
  isSheet: boolean,
) {
  if (score.value === null) {
    return null;
  }
  if (!isSheet) {
    const value = values[fieldName(score.judgeId)];
    return isValidScore(value, 100) ? Number(value) : score.value;
  }
  const criterionValues: Record<string, number> = {};
  for (const criterion of prototypeAcrobaticsCriteria) {
    const value = values[fieldName(score.judgeId, criterion.id)];
    criterionValues[criterion.id] = isValidScore(value, criterion.maximum)
      ? Number(value)
      : 0;
  }
  return computePrototypeSheetTotal(criterionValues);
}

// --- View -------------------------------------------------------------------

// fallow-ignore-next-line complexity -- PROTOTYPE (#223): throwaway, untested by design.
export function PrototypeScoresView({
  loaderData,
}: {
  loaderData: PrototypeScoresLoaderData;
}) {
  const { canEdit, isSheet } = loaderData;
  const [scores, setScores] = useState(loaderData.scores);
  const [savedScores, setSavedScores] = useState(loaderData.scores);
  const [isDisqualified, setIsDisqualified] = useState(
    loaderData.isDisqualified,
  );
  const [isSaving, setIsSaving] = useState(false);
  const form = useForm<ScoreValues>({
    defaultValues: toFormValues(loaderData.scores, isSheet),
    resolver: zodResolver(buildSchema(loaderData.scores, isSheet)),
  });
  const values = useWatch({ control: form.control });
  const liveScores = scores.map((score) => ({
    ...score,
    value: readLiveValue(score, values, isSheet),
  }));
  const average = isDisqualified ? null : computePrototypeAverage(liveScores);
  // The annul switches live outside the form, so they count on their own.
  const isDirty =
    form.formState.isDirty ||
    scores.some(
      (score, index) => score.annulled !== savedScores[index]?.annulled,
    );

  function setAnnulled(judgeId: string, annulled: boolean) {
    setScores((current) =>
      current.map((score) =>
        score.judgeId === judgeId ? { ...score, annulled } : score,
      ),
    );
  }

  const onSubmit = form.handleSubmit(async () => {
    setIsSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 600));
    setIsSaving(false);
    form.reset(form.getValues());
    setSavedScores(scores);
    toast.success("Se guardaron los puntajes.");
  });

  const footer = (
    <>
      <BackButton to={listHref} />
      {canEdit ? (
        <SubmitButton disabled={!isDirty} isPending={isSaving} />
      ) : null}
    </>
  );

  return (
    <AdminResourceLayout
      title={
        <span className="flex flex-wrap items-center gap-2">
          {loaderData.title}
          <ResultBadge average={average} isDisqualified={isDisqualified} />
        </span>
      }
      description={loaderData.details}
      selectedEventId={loaderData.selectedEventId}
      headerAction={
        <div className="flex items-center gap-4">
          {average === null ? null : <AverageScore average={average} />}
          <ScoresActions
            canEdit={canEdit}
            choreographyId={loaderData.choreographyId}
            isDisqualified={isDisqualified}
            title={loaderData.title}
            onDisqualifiedChange={setIsDisqualified}
          />
        </div>
      }
    >
      {isDisqualified ? (
        <Alert variant="destructive">
          <Ban aria-hidden="true" />
          <AlertDescription>
            Esta presentación está descalificada: no tiene promedio ni premio.
            Sus puntajes se conservan por si se vuelve a calificar.
          </AlertDescription>
        </Alert>
      ) : null}

      <form noValidate onSubmit={(event) => void onSubmit(event)}>
        {isSheet ? (
          <SheetScores
            canEdit={canEdit}
            control={form.control}
            footer={footer}
            scores={liveScores}
            onAnnulledChange={setAnnulled}
          />
        ) : (
          <AdminResourceFormCard footer={footer}>
            <SingleScores
              canEdit={canEdit}
              control={form.control}
              scores={liveScores}
              onAnnulledChange={setAnnulled}
            />
          </AdminResourceFormCard>
        )}
      </form>
    </AdminResourceLayout>
  );
}

function ResultBadge({
  average,
  isDisqualified,
}: {
  average: number | null;
  isDisqualified: boolean;
}) {
  if (isDisqualified) {
    return <Badge variant="destructive">Descalificada</Badge>;
  }
  if (average === null) {
    return null;
  }
  const medal = getPrototypeMedal(average);
  return <Badge variant={medal.variant}>{medal.label}</Badge>;
}

function AverageScore({ average }: { average: number }) {
  return (
    <p className="text-xl font-semibold tabular-nums">
      {formatPrototypeScore(average)}
      <span className="text-sm font-normal text-muted-foreground"> / 100</span>
    </p>
  );
}

function AnnulSwitch({
  canEdit,
  score,
  onAnnulledChange,
}: {
  canEdit: boolean;
  score: PrototypeScore;
  onAnnulledChange: (judgeId: string, annulled: boolean) => void;
}) {
  const id = `anulado-${score.judgeId}`;

  return (
    <Field orientation="horizontal" className="w-auto">
      <Switch
        id={id}
        checked={score.annulled}
        disabled={!canEdit}
        onCheckedChange={(checked) => onAnnulledChange(score.judgeId, checked)}
      />
      <FieldLabel htmlFor={id}>Anulado</FieldLabel>
    </Field>
  );
}

function FeedbackCell({ score }: { score: PrototypeScore }) {
  return score.audioUrl ? (
    <FeedbackPlayback audioUrl={score.audioUrl} disabled={false} />
  ) : (
    <p className="text-sm text-muted-foreground">Sin devolución</p>
  );
}

function SingleScores({
  canEdit,
  control,
  scores,
  onAnnulledChange,
}: {
  canEdit: boolean;
  control: Control<ScoreValues>;
  scores: PrototypeScore[];
  onAnnulledChange: (judgeId: string, annulled: boolean) => void;
}) {
  return (
    <ul className="flex flex-col divide-y">
      {scores.map((score) => (
        <li
          key={score.judgeId}
          className="grid items-center gap-4 py-4 first:pt-0 last:pb-0 md:grid-cols-[14rem_8rem_minmax(0,1fr)_7rem]"
        >
          <p className="font-medium">{score.judgeName}</p>
          {score.value === null ? (
            <p className="text-sm text-muted-foreground">Sin puntaje</p>
          ) : (
            <ScoreInputField
              control={control}
              disabled={!canEdit}
              label={`Puntaje de ${score.judgeName}`}
              labelClassName="sr-only"
              max={100}
              name={fieldName(score.judgeId)}
            />
          )}
          {score.value === null ? <span /> : <FeedbackCell score={score} />}
          {score.value === null ? null : (
            <div className="md:justify-self-end">
              <AnnulSwitch
                canEdit={canEdit}
                score={score}
                onAnnulledChange={onAnnulledChange}
              />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function SheetScores({
  canEdit,
  control,
  footer,
  scores,
  onAnnulledChange,
}: {
  canEdit: boolean;
  control: Control<ScoreValues>;
  footer: ReactNode;
  scores: PrototypeScore[];
  onAnnulledChange: (judgeId: string, annulled: boolean) => void;
}) {
  const adds = prototypeAcrobaticsCriteria.filter(({ deducts }) => !deducts);
  const deducts = prototypeAcrobaticsCriteria.filter(({ deducts }) => deducts);

  return (
    <Tabs defaultValue={scores[0]?.judgeId} className="gap-4">
      <TabsList variant="line">
        {scores.map((score) => (
          <TabsTrigger key={score.judgeId} value={score.judgeId}>
            {score.judgeName}
          </TabsTrigger>
        ))}
      </TabsList>
      <AdminResourceFormCard footer={footer}>
        {scores.map((score) => (
          <TabsContent
            key={score.judgeId}
            value={score.judgeId}
            className="flex flex-col gap-6"
          >
            {score.value === null ? (
              <p className="text-sm text-muted-foreground">
                {score.judgeName} todavía no puntuó esta presentación.
              </p>
            ) : (
              <>
                {[
                  { legend: "Criterios", criteria: adds },
                  { legend: "Deducciones", criteria: deducts },
                ].map(({ legend, criteria }) => (
                  <FieldSet key={legend}>
                    <FieldLegend>{legend}</FieldLegend>
                    <FieldGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {criteria.map((criterion) => (
                        <ScoreInputField
                          key={criterion.id}
                          control={control}
                          disabled={!canEdit}
                          label={criterion.name}
                          max={criterion.maximum}
                          name={fieldName(score.judgeId, criterion.id)}
                        />
                      ))}
                    </FieldGroup>
                  </FieldSet>
                ))}
                <FieldSeparator />
                <FieldSet>
                  <FieldLegend variant="label">Devolución</FieldLegend>
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="min-w-0 flex-1">
                      <FeedbackCell score={score} />
                    </div>
                    <div className="ml-auto">
                      <AnnulSwitch
                        canEdit={canEdit}
                        score={score}
                        onAnnulledChange={onAnnulledChange}
                      />
                    </div>
                  </div>
                </FieldSet>
              </>
            )}
          </TabsContent>
        ))}
      </AdminResourceFormCard>
    </Tabs>
  );
}

function ScoresActions({
  canEdit,
  choreographyId,
  isDisqualified,
  title,
  onDisqualifiedChange,
}: {
  canEdit: boolean;
  choreographyId: string;
  isDisqualified: boolean;
  title: string;
  onDisqualifiedChange: (isDisqualified: boolean) => void;
}) {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  return (
    <>
      <ResourceActionsMenu contentClassName="w-52">
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link to={`/administracion/coreografias/${choreographyId}`}>
              Ver coreografía
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        {canEdit ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              {isDisqualified ? (
                <DropdownMenuItem
                  onSelect={() => {
                    onDisqualifiedChange(false);
                    toast.success(`${title} volvió a los resultados.`);
                  }}
                >
                  Volver a calificar
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setIsConfirmOpen(true)}
                >
                  Descalificar
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
          </>
        ) : null}
      </ResourceActionsMenu>
      <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Descalificar la presentación?</AlertDialogTitle>
            <AlertDialogDescription>
              {title} se cierra para todo el jurado y queda fuera de los
              resultados. Los puntajes se conservan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                setIsConfirmOpen(false);
                onDisqualifiedChange(true);
                toast.success(`${title} quedó descalificada.`);
              }}
            >
              <Ban aria-hidden="true" data-icon="inline-start" />
              Descalificar
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

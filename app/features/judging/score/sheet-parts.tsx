import { Fragment } from "react";
import { useWatch, type Control } from "react-hook-form";

import {
  FieldDescription,
  FieldGroup,
  FieldLegend,
  FieldSeparator,
  FieldSet,
} from "@/components/ui/field";
import { experienceLevelLabel } from "@/lib/events/experience-levels";
import { singleScoreMaximum } from "@/lib/judging/score-value";
import {
  generalEvaluationLabel,
  mandatoryTechniqueLabel,
} from "@/lib/judging/sheet-criteria";
import {
  sheetPartSum,
  sheetTotal,
  type SheetCriterion,
} from "@/lib/judging/sheet-total";

import type { JudgeSheetFormValues } from "./form-shared";
import { ScoreInputField } from "./score-input-field";

/**
 * A sheet's lines as both of its forms show them — the judge filling it in and
 * administration correcting it — so a sheet reads the same on either side of
 * the panel. The lines are split the way the criteria are configured
 * (`sheetParts`), each part with its own live sum, and the judge's total
 * apart under them. The sums are the sheet's own (`sheetTotal`): what it would
 * save right now, with a half-typed value counting as nothing.
 *
 * It renders the parts of a `FieldGroup`, each opened by a separator, so the
 * form puts what comes before them (the `Devolución`) first.
 */
export function SheetParts({
  control,
  criteria,
  fieldIdPrefix,
}: {
  control: Control<JudgeSheetFormValues>;
  criteria: readonly SheetCriterion[];
  /** Makes each field's id unique where one page holds several sheets. */
  fieldIdPrefix: string;
}) {
  const values = useWatch({ control, name: "values" });
  const entriesOf = (part: readonly SheetCriterion[]) =>
    part.map((criterion) => ({
      kind: criterion.kind,
      maximum: criterion.maximum,
      value: values?.[criterion.id] ?? "",
    }));

  return (
    <>
      {sheetParts(criteria).map((part) => (
        <Fragment key={part.label}>
          <FieldSeparator />
          <FieldSet className="gap-2">
            <SheetPartLegend
              deducts={part.deducts}
              label={part.label}
              maximum={sumOfMaxima(part.criteria)}
              total={sheetPartSum(entriesOf(part.criteria))}
            />
            <FieldDescription>{part.description}</FieldDescription>
            <FieldGroup className="grid gap-4 md:grid-cols-3">
              {part.criteria.map((criterion) => (
                <ScoreInputField
                  control={control}
                  id={`${fieldIdPrefix}-${criterion.id}`}
                  key={criterion.id}
                  label={criterion.name}
                  maximum={criterion.maximum}
                  name={`values.${criterion.id}`}
                />
              ))}
            </FieldGroup>
          </FieldSet>
        </Fragment>
      ))}
      <FieldSeparator />
      <div
        className="flex items-center justify-between text-sm font-medium"
        data-sheet-total
      >
        <span>Total del jurado</span>
        <span className="tabular-nums">
          {sheetTotal(entriesOf(criteria))}
          <span className="text-muted-foreground">{` / ${singleScoreMaximum}`}</span>
        </span>
      </div>
    </>
  );
}

/**
 * A sheet split the way its criteria are configured: what every level of the
 * submodality earns (`Evaluación general`), what the choreography's level
 * earns on top (`Técnico obligatorio`), and what it lost. A part with no lines
 * is left out.
 */
function sheetParts(criteria: readonly SheetCriterion[]) {
  const adding = criteria.filter((criterion) => criterion.kind === "adds");
  const levelAdding = adding.filter(
    (criterion) => criterion.experienceLevel !== null,
  );
  // Every level line of one sheet is of the choreography's own level.
  const level = experienceLevelLabel(levelAdding[0]?.experienceLevel ?? null);

  return [
    {
      criteria: adding.filter(
        (criterion) => criterion.experienceLevel === null,
      ),
      deducts: false,
      description: "Para todos los niveles.",
      label: generalEvaluationLabel,
    },
    {
      criteria: levelAdding,
      deducts: false,
      description: `Solo para el nivel ${level ?? ""}.`,
      label: mandatoryTechniqueLabel,
    },
    {
      criteria: criteria.filter((criterion) => criterion.kind === "deducts"),
      deducts: true,
      description: "Se restan del total.",
      label: "Descuentan",
    },
  ].filter((part) => part.criteria.length > 0);
}

/**
 * A part's title with its running sum. A deduction reads as one, signed, so
 * what the dance lost is told apart at a glance from what it earned — in the
 * text's own tone, since red would read as an error.
 */
function SheetPartLegend({
  deducts,
  label,
  maximum,
  total,
}: {
  deducts: boolean;
  label: string;
  maximum: number;
  total: number;
}) {
  return (
    <FieldLegend className="flex w-full items-center justify-between">
      {label}
      <span className="text-sm tabular-nums">
        {deducts && total > 0 ? `−${total}` : total}
        <span className="text-muted-foreground">{` / ${maximum}`}</span>
      </span>
    </FieldLegend>
  );
}

function sumOfMaxima(part: readonly SheetCriterion[]) {
  return part.reduce((sum, criterion) => sum + criterion.maximum, 0);
}

// PROTOTYPE (#223) — throwaway, never merge. The model every variant of the
// judge scoring prototype shares: the in-memory store, the statuses and the
// score form. The recorder and the shell live beside it; layout is each
// variant's own.

import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useState } from "react";
import { Controller, useForm, useWatch, type Control } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { SharedFieldLayout } from "@/components/shared/field-layout";
import { Badge } from "@/components/ui/badge";
import { FieldGroup, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { formatGroupTypeLabel } from "@/lib/portal/choreographies";

import {
  prototypeAssignments,
  prototypeInitialEvaluations,
  type Assignment,
  type Criterion,
  type Evaluation,
} from "./fixtures";

export type ScoreValues = Record<string, string>;

const singleScoreFieldName = "puntaje";

const requiredMessage = "Este campo es obligatorio.";
const simulatedLatencyMs = 700;

// --- Store ------------------------------------------------------------------

/**
 * The whole show lives in memory at the route, above the variant switch, so
 * flipping variants keeps what was scored.
 */
export function useJudgingPrototypeStore() {
  const [evaluations, setEvaluations] = useState<Record<string, Evaluation>>(
    prototypeInitialEvaluations,
  );
  const [failSaves, setFailSaves] = useState(false);

  async function save(
    assignment: Assignment,
    values: ScoreValues,
    audioUrl: string | null,
  ) {
    await wait(simulatedLatencyMs);

    if (failSaves) {
      throw new Error("Simulated failure");
    }

    setEvaluations((current) => ({
      ...current,
      [assignment.id]: {
        values,
        score: computeScore(assignment, values),
        audioUrl,
        disqualified: current[assignment.id]?.disqualified ?? false,
      },
    }));
  }

  async function disqualify(assignment: Assignment, audioUrl: string | null) {
    await wait(simulatedLatencyMs);

    if (failSaves) {
      throw new Error("Simulated failure");
    }

    setEvaluations((current) => ({
      ...current,
      [assignment.id]: {
        values: current[assignment.id]?.values ?? {},
        score: current[assignment.id]?.score ?? null,
        audioUrl,
        disqualified: true,
      },
    }));
  }

  /** Undoes a disqualification: the scores it kept count again. */
  async function reinstate(assignment: Assignment) {
    await wait(simulatedLatencyMs);

    if (failSaves) {
      throw new Error("Simulated failure");
    }

    setEvaluations((current) => {
      const evaluation = current[assignment.id];

      return evaluation
        ? {
            ...current,
            [assignment.id]: { ...evaluation, disqualified: false },
          }
        : current;
    });
  }

  function reset() {
    setEvaluations(prototypeInitialEvaluations);
  }

  return {
    assignments: prototypeAssignments,
    evaluations,
    failSaves,
    setFailSaves,
    save,
    disqualify,
    reinstate,
    reset,
  };
}

export type JudgingPrototypeStore = ReturnType<typeof useJudgingPrototypeStore>;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The next presentation still waiting for a score, in program order, counting
 * the one just saved as done: the store has not re-rendered yet when this runs.
 */
export function findNextPendingAssignment(
  store: JudgingPrototypeStore,
  justDoneId: string,
) {
  const isPending = (assignment: Assignment) =>
    assignment.id !== justDoneId &&
    getAssignmentStatus(store.evaluations[assignment.id]) === "pendiente";
  const current = store.assignments.find(
    (assignment) => assignment.id === justDoneId,
  );

  return (
    store.assignments.find(
      (assignment) =>
        isPending(assignment) &&
        assignment.orderNumber > (current?.orderNumber ?? 0),
    ) ??
    store.assignments.find(isPending) ??
    null
  );
}

/**
 * Where the judge picks up on the list: the first pending presentation from
 * the last one they opened on, so one left unsaved is still the place.
 * Without one, or with nothing pending past it, the first pending of all.
 */
export function findResumeAssignment(
  store: JudgingPrototypeStore,
  lastOpenedId: string | null,
) {
  const isPending = (assignment: Assignment) =>
    getAssignmentStatus(store.evaluations[assignment.id]) === "pendiente";
  const lastOpened = store.assignments.find(({ id }) => id === lastOpenedId);

  return (
    store.assignments.find(
      (assignment) =>
        isPending(assignment) &&
        assignment.orderNumber >= (lastOpened?.orderNumber ?? 0),
    ) ??
    store.assignments.find(isPending) ??
    null
  );
}

export function notifyAllScored() {
  toast.success("Puntuaste todas las presentaciones de hoy.");
}

export function notifySaveFailed() {
  toast.error(
    "No se pudo guardar. Revisá la conexión y volvé a intentar: lo que cargaste sigue en pantalla.",
  );
}

// --- Status -----------------------------------------------------------------

export type AssignmentStatus =
  "pendiente" | "completa" | "sinDevolucion" | "descalificada";

export function getAssignmentStatus(
  evaluation: Evaluation | undefined,
): AssignmentStatus {
  if (evaluation?.disqualified) {
    return "descalificada";
  }

  if (!evaluation || evaluation.score === null) {
    return "pendiente";
  }

  return evaluation.audioUrl ? "completa" : "sinDevolucion";
}

const statusBadges = {
  pendiente: { label: "Pendiente", variant: "outline" },
  completa: { label: "Completa", variant: "success" },
  // Neutral on purpose: skipping the audio is allowed, not a mistake.
  sinDevolucion: { label: "Sin devolución", variant: "secondary" },
  descalificada: { label: "Descalificada", variant: "destructive" },
} as const;

export function AssignmentStatusBadge({
  status,
}: {
  status: AssignmentStatus;
}) {
  const badge = statusBadges[status];

  return <Badge variant={badge.variant}>{badge.label}</Badge>;
}

export function countScored(store: JudgingPrototypeStore) {
  return store.assignments.filter(
    (assignment) =>
      getAssignmentStatus(store.evaluations[assignment.id]) !== "pendiente",
  ).length;
}

// --- Formatting -------------------------------------------------------------

/**
 * With a decimal point, not the es-AR comma: the number field only takes a
 * point, so everything around it writes scores the way the judge types them.
 * Scores are half points, so the plain string is exact.
 */
export function formatScore(value: number) {
  return String(value);
}

export function formatAssignmentTitle(assignment: Assignment) {
  return `N.º ${assignment.orderNumber} · ${assignment.name}`;
}

export function formatAssignmentDetails(assignment: Assignment) {
  return [
    assignment.categoryName,
    formatGroupTypeLabel(assignment.groupType),
    assignment.experienceLevelName,
    assignment.submodalityName ?? assignment.modalityName,
  ]
    .filter(Boolean)
    .join(" · ");
}

// --- Score form -------------------------------------------------------------

function parseScore(value: string | undefined) {
  const normalized = (value ?? "").trim().replace(",", ".");

  if (normalized === "" || !/^\d+(\.\d+)?$/.test(normalized)) {
    return null;
  }

  return Number(normalized);
}

function isValidScore(value: string, max: number) {
  const parsed = parseScore(value);

  return (
    parsed !== null &&
    parsed >= 0 &&
    parsed <= max &&
    Number.isInteger(parsed * 2)
  );
}

function scoreValueSchema(max: number, isOptional: boolean) {
  const rangeMessage = `Ingresá un valor de 0 a ${formatScore(max)}, de 0.5 en 0.5.`;

  return isOptional
    ? z
        .string()
        .trim()
        .refine((value) => value === "" || isValidScore(value, max), {
          message: rangeMessage,
        })
    : z
        .string()
        .trim()
        .min(1, requiredMessage)
        .refine((value) => isValidScore(value, max), {
          message: rangeMessage,
        });
}

function buildScoreSchema(assignment: Assignment) {
  if (!assignment.criteria) {
    return z.record(z.string(), z.string()).and(
      z.object({
        [singleScoreFieldName]: scoreValueSchema(100, false),
      }),
    );
  }

  return z
    .record(z.string(), z.string())
    .and(
      z.object(
        Object.fromEntries(
          assignment.criteria.map((criterion) => [
            criterion.id,
            scoreValueSchema(criterion.max, criterion.deducts),
          ]),
        ),
      ),
    );
}

/** Adding criteria and the single score start empty; deductions start at 0. */
function getEmptyValues(assignment: Assignment): ScoreValues {
  if (!assignment.criteria) {
    return { [singleScoreFieldName]: "" };
  }

  return Object.fromEntries(
    assignment.criteria.map((criterion) => [
      criterion.id,
      criterion.deducts ? "0" : "",
    ]),
  );
}

/**
 * The sheet's total as it stands. A value that would not pass validation
 * counts as empty, so the total only ever shows what could be saved.
 */
export function computeSheetTotal(
  criteria: Criterion[],
  values: Partial<ScoreValues>,
) {
  let total = 0;

  for (const criterion of criteria) {
    const value = values[criterion.id] ?? "";
    const parsed = isValidScore(value, criterion.max)
      ? parseScore(value)
      : null;
    total += criterion.deducts ? -(parsed ?? 0) : (parsed ?? 0);
  }

  return Math.min(100, Math.max(0, total));
}

function computeScore(assignment: Assignment, values: ScoreValues) {
  if (!assignment.criteria) {
    return parseScore(values[singleScoreFieldName]);
  }

  return computeSheetTotal(assignment.criteria, values);
}

/**
 * One presentation's form: the score or the sheet, plus the recorded audio,
 * which is dirty state too. Mount it with `key={assignment.id}` so moving to
 * another presentation starts from that one's saved values.
 */
export function useScoreForm(
  assignment: Assignment,
  evaluation: Evaluation | undefined,
) {
  const form = useForm<ScoreValues>({
    resolver: zodResolver(buildScoreSchema(assignment)),
    defaultValues: evaluation?.values ?? getEmptyValues(assignment),
  });
  const savedAudioUrl = evaluation?.audioUrl ?? null;
  const [audioUrl, setAudioUrl] = useState(savedAudioUrl);
  const values = useWatch({ control: form.control });
  const isDirty = form.formState.isDirty || audioUrl !== savedAudioUrl;
  const isDisqualified = evaluation?.disqualified ?? false;

  return {
    form,
    values,
    audioUrl,
    setAudioUrl,
    isDirty,
    isDisqualified,
    savedAudioUrl,
  };
}

export type ScoreFormState = ReturnType<typeof useScoreForm>;

/**
 * Saves through the store and reports back whether it worked, so each
 * variant decides where the judge goes next.
 */
function useSaveScore(store: JudgingPrototypeStore) {
  const [isSaving, setIsSaving] = useState(false);

  async function saveScore(
    assignment: Assignment,
    values: ScoreValues,
    audioUrl: string | null,
  ) {
    setIsSaving(true);

    try {
      await store.save(assignment, values, audioUrl);
      return true;
    } catch {
      notifySaveFailed();
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  return { isSaving, saveScore };
}

/**
 * The form's submit: a disqualified presentation skips validation, since only
 * its audio can still change; anything else validates first.
 */
export function useScoreSubmit(
  store: JudgingPrototypeStore,
  assignment: Assignment,
  score: ScoreFormState,
  onSaved: () => void,
) {
  const { isSaving, saveScore } = useSaveScore(store);

  const submit = score.isDisqualified
    ? async (event: React.SubmitEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (
          await saveScore(
            assignment,
            store.evaluations[assignment.id]?.values ?? {},
            score.audioUrl,
          )
        ) {
          onSaved();
        }
      }
    : score.form.handleSubmit(async (values) => {
        if (await saveScore(assignment, values, score.audioUrl)) {
          onSaved();
        }
      });

  return {
    isSaving,
    onSubmit: (event: React.SubmitEvent<HTMLFormElement>) => void submit(event),
  };
}

/**
 * A native number field, so the tablet opens its numeric keypad and the
 * steppers move in half-point steps. The ceiling reads right after the typed
 * value, like `Cupo total`'s suffix, but stays even while the field is empty:
 * with the descriptions gone it is the only place the maximum shows.
 */
export function ScoreInputField({
  autoFocus,
  control,
  disabled,
  label,
  labelClassName,
  max,
  name,
}: {
  autoFocus?: boolean;
  control: Control<ScoreValues>;
  disabled?: boolean;
  label: string;
  labelClassName?: string;
  max: number;
  name: string;
}) {
  const id = useId();

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <SharedFieldLayout
          disabled={disabled}
          error={fieldState.error?.message}
          id={id}
          label={label}
          labelClassName={labelClassName}
        >
          {({ describedBy, isInvalid }) => (
            <div className="relative">
              <Input
                {...field}
                id={id}
                aria-describedby={describedBy || undefined}
                aria-invalid={isInvalid ? true : undefined}
                autoComplete="off"
                autoFocus={autoFocus}
                disabled={disabled}
                inputMode="decimal"
                max={max}
                min={0}
                step={0.5}
                type="number"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center whitespace-pre text-base md:text-sm"
              >
                <span className="invisible">{field.value}</span>
                <span className="text-muted-foreground">
                  {field.value ? " " : ""}/ {formatScore(max)}
                </span>
              </span>
            </div>
          )}
        </SharedFieldLayout>
      )}
    />
  );
}

export function SingleScoreField({
  control,
  disabled,
}: {
  control: Control<ScoreValues>;
  disabled?: boolean;
}) {
  return (
    <ScoreInputField
      autoFocus
      control={control}
      disabled={disabled}
      label="Puntaje"
      max={100}
      name={singleScoreFieldName}
    />
  );
}

/**
 * The sheet as two field sets, what adds and what deducts. The grid is the
 * caller's, since that is exactly what the variants disagree on.
 */
export function CriteriaFieldSets({
  control,
  criteria,
  disabled,
  gridClassName,
}: {
  control: Control<ScoreValues>;
  criteria: Criterion[];
  disabled?: boolean;
  gridClassName: string;
}) {
  const additions = criteria.filter((criterion) => !criterion.deducts);
  const deductions = criteria.filter((criterion) => criterion.deducts);

  return (
    <div className="flex flex-col gap-6">
      <FieldSet>
        <FieldLegend>Criterios</FieldLegend>
        <FieldGroup className={gridClassName}>
          {additions.map((criterion, index) => (
            <ScoreInputField
              key={criterion.id}
              autoFocus={index === 0}
              control={control}
              disabled={disabled}
              label={criterion.name}
              max={criterion.max}
              name={criterion.id}
            />
          ))}
        </FieldGroup>
      </FieldSet>
      <FieldSet>
        <FieldLegend>Deducciones</FieldLegend>
        <FieldGroup className={gridClassName}>
          {deductions.map((criterion) => (
            <ScoreInputField
              key={criterion.id}
              control={control}
              disabled={disabled}
              label={criterion.name}
              max={criterion.max}
              name={criterion.id}
            />
          ))}
        </FieldGroup>
      </FieldSet>
    </div>
  );
}

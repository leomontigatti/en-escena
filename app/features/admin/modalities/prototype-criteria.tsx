// PROTOTYPE (#223, #1152) — throwaway, never merge. The criteria dialog a
// submodality row opens on the modality page. Criteria live in memory for the
// page's life: no table exists yet.

import { zodResolver } from "@hookform/resolvers/zod";
import { ListChecks, Lock, Plus, Trash } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import {
  useFieldArray,
  useForm,
  useWatch,
  type Control,
} from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { SubmitButton } from "@/components/shared/action-buttons";
import { IntegerInputField } from "@/components/shared/integer-input-field";
import { TextInputField } from "@/components/shared/text-input-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldError, FieldLegend, FieldSet } from "@/components/ui/field";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/shared/utils";

type Criterion = { name: string; maximum: string };
type SubmodalityCriteria = { adds: Criterion[]; deducts: Criterion[] };

const acrobaticsCriteria: SubmodalityCriteria = {
  adds: [
    { name: "Técnica", maximum: "20" },
    { name: "Dificultad acrobática", maximum: "20" },
    { name: "Ejecución", maximum: "15" },
    { name: "Coreografía", maximum: "15" },
    { name: "Musicalidad", maximum: "10" },
    { name: "Interpretación", maximum: "10" },
    { name: "Vestuario y puesta", maximum: "10" },
  ],
  deducts: [
    { name: "Caídas", maximum: "10" },
    { name: "Elementos prohibidos", maximum: "10" },
    { name: "Tiempo excedido", maximum: "5" },
  ],
};

/** Seeds by submodality name: Acrotela already scored, Aro still open. */
const seededCriteria: Record<string, SubmodalityCriteria> = {
  Acrotela: acrobaticsCriteria,
  Aro: acrobaticsCriteria,
};
const lockedSubmodalityNames = new Set(["Acrotela"]);

// --- In-memory store --------------------------------------------------------

const savedCriteria = new Map<string, SubmodalityCriteria>();
// One shared empty value: `useSyncExternalStore` compares snapshots by
// identity, so a fresh `{}` per read would re-render forever.
const noCriteria: SubmodalityCriteria = { adds: [], deducts: [] };
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readCriteria(submodalityId: string, submodalityName: string) {
  return (
    savedCriteria.get(submodalityId) ??
    seededCriteria[submodalityName] ??
    noCriteria
  );
}

function saveCriteria(submodalityId: string, criteria: SubmodalityCriteria) {
  savedCriteria.set(submodalityId, criteria);
  listeners.forEach((listener) => listener());
}

function useCriteria(submodalityId: string, submodalityName: string) {
  return useSyncExternalStore(
    subscribe,
    () => readCriteria(submodalityId, submodalityName),
    () => readCriteria(submodalityId, submodalityName),
  );
}

// --- Validation -------------------------------------------------------------

function parseMaximum(value: string | undefined) {
  const normalized = (value ?? "").trim();
  return /^\d+$/.test(normalized) ? Number(normalized) : null;
}

const criterionSchema = z.object({
  name: z.string().trim().min(1, "Este campo es obligatorio."),
  maximum: z
    .string()
    .trim()
    .min(1, "Este campo es obligatorio.")
    .refine(
      (value) => {
        const parsed = parseMaximum(value);
        return parsed !== null && parsed >= 1;
      },
      { message: "Ingresá un número entero desde 1." },
    ),
});

const criteriaSchema = z
  .object({
    adds: z.array(criterionSchema),
    deducts: z.array(criterionSchema),
  })
  .superRefine((values, context) => {
    if (values.adds.length === 0 && values.deducts.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["adds"],
        message: "Agregá al menos un criterio que sume.",
      });
      return;
    }
    if (values.adds.length > 0 && sumMaxima(values.adds) !== 100) {
      context.addIssue({
        code: "custom",
        path: ["adds"],
        message: "El total de los criterios que suman debe ser igual a 100.",
      });
    }
  });

function sumMaxima(criteria: Partial<Criterion>[]) {
  return criteria.reduce(
    (total, criterion) => total + (parseMaximum(criterion.maximum) ?? 0),
    0,
  );
}

// --- UI ---------------------------------------------------------------------

/** The row's entry point: how many criteria it has, and the dialog. */
export function SubmodalityCriteriaButton({
  submodalityId,
  submodalityName,
}: {
  submodalityId: string;
  submodalityName: string;
}) {
  const [open, setOpen] = useState(false);
  const criteria = useCriteria(submodalityId, submodalityName);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label={`Criterios de ${submodalityName}`}
        onClick={() => setOpen(true)}
      >
        <ListChecks aria-hidden="true" data-icon="inline-start" />
        Criterios
      </Button>
      {open ? (
        <CriteriaDialog
          criteria={criteria}
          isLocked={lockedSubmodalityNames.has(submodalityName)}
          submodalityId={submodalityId}
          submodalityName={submodalityName}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

// fallow-ignore-next-line complexity -- PROTOTYPE (#223): throwaway, untested by design.
function CriteriaDialog({
  criteria,
  isLocked,
  onClose,
  submodalityId,
  submodalityName,
}: {
  criteria: SubmodalityCriteria;
  isLocked: boolean;
  onClose: () => void;
  submodalityId: string;
  submodalityName: string;
}) {
  const form = useForm<SubmodalityCriteria>({
    defaultValues: criteria,
    resolver: zodResolver(criteriaSchema),
  });
  const [isSaving, setIsSaving] = useState(false);
  const adds = useWatch({ control: form.control, name: "adds" });
  const addsError =
    form.formState.errors.adds?.root?.message ??
    form.formState.errors.adds?.message;
  const deducts = useWatch({ control: form.control, name: "deducts" });
  const isEmpty = adds.length === 0 && deducts.length === 0;

  return (
    <Dialog open onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent
        overlayClassName="backdrop-blur-sm"
        className="sm:max-w-xl"
      >
        <DialogHeader>
          <DialogTitle>Criterios de {submodalityName}</DialogTitle>
          <DialogDescription>
            {isEmpty
              ? "Sin criterios, se puntúa con un único valor de 0 a 100."
              : "Cada juez puntúa cada criterio. Los que restan se descuentan del total."}
          </DialogDescription>
        </DialogHeader>

        <form
          noValidate
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            // The dialog is portaled out of the modality form, but React still
            // bubbles its submit up the tree to that form.
            event.stopPropagation();
            void form.handleSubmit(async (values) => {
              setIsSaving(true);
              await new Promise((resolve) => setTimeout(resolve, 600));
              setIsSaving(false);
              saveCriteria(submodalityId, values);
              toast.success(
                `Se guardaron los criterios de ${submodalityName}.`,
              );
              onClose();
            })(event);
          }}
        >
          {isLocked ? (
            <Alert variant="info">
              <Lock aria-hidden="true" />
              <AlertDescription>
                Ya hay puntajes cargados en {submodalityName}: los criterios no
                se pueden cambiar.
              </AlertDescription>
            </Alert>
          ) : null}

          <CriteriaFieldArray
            control={form.control}
            counter={
              <span
                className={cn(
                  "text-sm tabular-nums",
                  addsError
                    ? "text-destructive"
                    : sumMaxima(adds) === 100
                      ? "text-muted-foreground"
                      : "text-foreground",
                )}
              >
                {sumMaxima(adds)} / 100
              </span>
            }
            disabled={isLocked || isSaving}
            isLocked={isLocked}
            error={addsError}
            legend="Suman"
            name="adds"
          />
          <CriteriaFieldArray
            control={form.control}
            disabled={isLocked || isSaving}
            isLocked={isLocked}
            legend="Restan"
            name="deducts"
          />

          <DialogFooter className="sm:justify-between">
            {isLocked ? (
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  Cerrar
                </Button>
              </DialogClose>
            ) : (
              <>
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={isSaving}>
                    Cancelar
                  </Button>
                </DialogClose>
                <SubmitButton isPending={isSaving} />
              </>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CriteriaFieldArray({
  control,
  counter,
  disabled,
  isLocked,
  error,
  legend,
  name,
}: {
  control: Control<SubmodalityCriteria>;
  counter?: React.ReactNode;
  /** Locked hides the add and delete buttons; disabled (saving) greys them. */
  isLocked: boolean;
  disabled: boolean;
  error?: string;
  legend: string;
  name: "adds" | "deducts";
}) {
  const { append, fields, remove } = useFieldArray({ control, name });

  return (
    <FieldSet className="gap-3">
      <div className="flex flex-col">
        <div className="flex items-center gap-1">
          <FieldLegend
            variant="label"
            className={cn("mb-0", error && "text-destructive")}
          >
            {legend}
          </FieldLegend>
          {isLocked ? null : (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={disabled}
                    size="icon-sm"
                    aria-label={`Agregar criterio que ${legend.toLowerCase().replace(/n$/, "")}`}
                    onClick={() => append({ name: "", maximum: "" })}
                  >
                    <Plus aria-hidden="true" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Agregar criterio</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <div className="ml-auto">{counter}</div>
        </div>
        {error ? <FieldError>{error}</FieldError> : null}
      </div>

      {fields.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {fields.map((field, index) => (
            <li
              key={field.id}
              className={cn(
                "grid items-start gap-2",
                isLocked
                  ? "grid-cols-[minmax(0,1fr)_6rem]"
                  : "grid-cols-[minmax(0,1fr)_6rem_2rem]",
              )}
            >
              <TextInputField
                control={control}
                disabled={disabled}
                label="Nombre"
                labelClassName="sr-only"
                name={`${name}.${index}.name`}
                placeholder="Nombre"
              />
              <IntegerInputField
                control={control}
                disabled={disabled}
                label="Máximo"
                labelClassName="sr-only"
                name={`${name}.${index}.maximum`}
                placeholder="Máximo"
              />
              {isLocked ? null : (
                <Button
                  type="button"
                  variant="destructive"
                  size="icon-sm"
                  aria-label="Quitar criterio"
                  disabled={disabled}
                  className="mt-0.5"
                  onClick={() => remove(index)}
                >
                  <Trash aria-hidden="true" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          {name === "adds"
            ? "Sin criterios que sumen."
            : "Sin criterios que resten."}
        </p>
      )}
    </FieldSet>
  );
}

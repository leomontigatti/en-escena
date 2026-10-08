// PROTOTYPE — throwaway, do not merge
//
// Question: how does an administrator mark, in `Bases del evento`, which
// categories count towards the Gran final eligibility? Three variants of the
// existing categories pages, switchable via `?variant=` (A, B, C), on
// `/administracion/categorias`, `/administracion/categorias/nueva` and
// `/administracion/categorias/:categoryId`.
//
// Nothing is persisted: the marker lives in a module-level store that survives
// client navigation between the list and the form, and resets on reload. The
// initial value is guessed from the ages (up to 12 → Infantiles, from 13 →
// Mayores) so the seed's "Infantil" and "Juvenil y adultos" start filled.
//
// Copy proposal: the field reads "Gran final" with "Infantiles", "Mayores" and
// "No participa". "Bloque" might read better than a bare group name in the
// list ("Bloque infantil" / "Bloque mayores"), but the regulation talks about
// "infantiles" and "mayores", so the short form is kept.
import { useId, useSyncExternalStore } from "react";

import { ChoiceCard } from "@/components/shared/choice-card";
import {
  PrototypeSwitcher,
  type PrototypeVariant,
  usePrototypeVariant,
} from "@/components/shared/prototype-switcher";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldDescription } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Info, TriangleAlert } from "lucide-react";

import type { CategoryRow } from "./shared";

type GranFinalGroup = "children" | "adults" | "none";

const granFinalGroupLabels: Record<GranFinalGroup, string> = {
  children: "Infantiles",
  adults: "Mayores",
  none: "No participa",
};

const granFinalGroups: GranFinalGroup[] = ["children", "adults", "none"];

const granFinalVariants: PrototypeVariant[] = [
  { key: "A", name: "Campo en el formulario" },
  { key: "B", name: "Selector en la tabla" },
  { key: "C", name: "Sección Gran final" },
];

// ---- In-memory store ------------------------------------------------------

let overrides: Record<string, GranFinalGroup> = {};
const listeners = new Set<() => void>();
const emptyOverrides: Record<string, GranFinalGroup> = {};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setGranFinalGroup(categoryId: string, group: GranFinalGroup) {
  overrides = { ...overrides, [categoryId]: group };
  for (const listener of listeners) listener();
}

function useGranFinalOverrides() {
  return useSyncExternalStore(
    subscribe,
    () => overrides,
    () => emptyOverrides,
  );
}

function guessGroup(category: Pick<CategoryRow, "minAge" | "maxAge">) {
  if (category.maxAge <= 12) return "children";
  if (category.minAge >= 13) return "adults";
  return "none";
}

function resolveGroup(
  current: Record<string, GranFinalGroup>,
  category: Pick<CategoryRow, "id" | "minAge" | "maxAge">,
): GranFinalGroup {
  return current[category.id] ?? guessGroup(category);
}

function useGranFinalGroup(
  category: Pick<CategoryRow, "id" | "minAge" | "maxAge"> | undefined,
) {
  const current = useGranFinalOverrides();
  const id = category?.id ?? "nueva";
  const group = category
    ? resolveGroup(current, category)
    : (current[id] ?? "none");

  return [
    group,
    (next: GranFinalGroup) => setGranFinalGroup(id, next),
  ] as const;
}

function useGranFinalVariant() {
  return usePrototypeVariant(granFinalVariants);
}

function GranFinalSwitcher() {
  return <PrototypeSwitcher variants={granFinalVariants} />;
}

// ---- Variant A: a radio field inside the category form ---------------------

/** Spans both columns of the form's grid; its value is not submitted. */
function GranFinalFormFieldA({
  category,
}: {
  category?: Pick<CategoryRow, "id" | "minAge" | "maxAge">;
}) {
  const id = useId();
  const [group, setGroup] = useGranFinalGroup(category);

  return (
    <div className="flex flex-col gap-2 md:col-span-2">
      <span id={`${id}-label`} className="text-sm font-medium">
        Gran final
      </span>
      <RadioGroup
        aria-labelledby={`${id}-label`}
        className="sm:grid-cols-3"
        value={group}
        onValueChange={(value) => setGroup(value as GranFinalGroup)}
      >
        {granFinalGroups.map((option) => (
          <ChoiceCard
            key={option}
            htmlFor={`${id}-${option}`}
            label={granFinalGroupLabels[option]}
          >
            <RadioGroupItem id={`${id}-${option}`} value={option} />
          </ChoiceCard>
        ))}
      </RadioGroup>
      <FieldDescription>
        Una academia clasifica a la Gran final con al menos una coreografía
        grupal en una categoría de Infantiles y otra en una de Mayores.
      </FieldDescription>
    </div>
  );
}

/** Variant A's list column: the marker, read-only. */
function GranFinalBadge({ category }: { category: CategoryRow }) {
  const current = useGranFinalOverrides();
  const group = resolveGroup(current, category);

  if (group === "none") {
    return <span className="text-muted-foreground">No participa</span>;
  }

  return (
    <Badge variant={group === "children" ? "info" : "secondary"}>
      {granFinalGroupLabels[group]}
    </Badge>
  );
}

// ---- Variant B: a segmented toggle in each list row -------------------------

function GranFinalRowToggle({ category }: { category: CategoryRow }) {
  const [group, setGroup] = useGranFinalGroup(category);

  return (
    <ButtonGroup aria-label={`Gran final de ${category.name}`}>
      {granFinalGroups.map((option) => (
        <Button
          key={option}
          type="button"
          size="xs"
          variant={group === option ? "default" : "outline"}
          aria-pressed={group === option}
          onClick={() => setGroup(option)}
        >
          {option === "none" ? "No" : granFinalGroupLabels[option]}
        </Button>
      ))}
    </ButtonGroup>
  );
}

// ---- Variant C: a dedicated section with two checklists --------------------

function GranFinalSectionC({ categories }: { categories: CategoryRow[] }) {
  const current = useGranFinalOverrides();
  const groupOf = (category: CategoryRow) => resolveGroup(current, category);
  const childrenCount = categories.filter(
    (category) => groupOf(category) === "children",
  ).length;
  const adultsCount = categories.filter(
    (category) => groupOf(category) === "adults",
  ).length;
  const incomplete = childrenCount === 0 || adultsCount === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gran final</CardTitle>
        <CardDescription>
          Clasifica la academia que tenga al menos una coreografía grupal en una
          categoría de Infantiles y otra en una de Mayores. Una categoría cuenta
          en un solo bloque, o en ninguno.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {incomplete ? (
          <Alert variant="warning">
            <TriangleAlert />
            <AlertTitle>Ninguna academia puede clasificar todavía</AlertTitle>
            <AlertDescription>
              Marcá al menos una categoría en cada bloque.
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="grid gap-6 md:grid-cols-2">
          {(["children", "adults"] as const).map((block) => (
            <GranFinalChecklist
              key={block}
              block={block}
              categories={categories}
              groupOf={groupOf}
            />
          ))}
        </div>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Info className="size-4" />
          Las categorías sin marcar no cuentan para la Gran final.
        </p>
      </CardContent>
    </Card>
  );
}

function GranFinalChecklist({
  block,
  categories,
  groupOf,
}: {
  block: "children" | "adults";
  categories: CategoryRow[];
  groupOf: (category: CategoryRow) => GranFinalGroup;
}) {
  const id = useId();
  const other = block === "children" ? "adults" : "children";
  const ticked = categories.filter((category) => groupOf(category) === block);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">
          {granFinalGroupLabels[block]}
        </span>
        <Badge variant={ticked.length > 0 ? "secondary" : "outline"}>
          {ticked.length === 1 ? "1 categoría" : `${ticked.length} categorías`}
        </Badge>
      </div>
      <div className="grid gap-2">
        {categories.map((category) => {
          const group = groupOf(category);
          const checkboxId = `${id}-${category.id}`;
          return (
            <ChoiceCard
              key={category.id}
              htmlFor={checkboxId}
              label={
                group === other
                  ? `${category.name} · en ${granFinalGroupLabels[other]}`
                  : `${category.name} · ${category.minAge} a ${category.maxAge} años`
              }
            >
              <Checkbox
                id={checkboxId}
                checked={group === block}
                onCheckedChange={(checked) =>
                  setGranFinalGroup(category.id, checked ? block : "none")
                }
              />
            </ChoiceCard>
          );
        })}
      </div>
    </div>
  );
}

export {
  GranFinalBadge,
  GranFinalFormFieldA,
  GranFinalRowToggle,
  GranFinalSectionC,
  GranFinalSwitcher,
  useGranFinalVariant,
};

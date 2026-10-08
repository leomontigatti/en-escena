// PROTOTYPE — throwaway, do not merge
// Question: can one event-level `grandFinalAgeCutoff` (default 13) replace
// per-category marks for the Gran final? Children = grupal categories with
// maxAge ≤ cutoff; adults = minAge > cutoff; a category straddling the cutoff
// counts for neither. Three variants on the event detail, `?variant=A|B|C`.
// The cutoff lives in client state only: nothing here has a `name`, so the
// event form never posts it.
import { TriangleAlert } from "lucide-react";
import { useState } from "react";

import {
  PrototypeSwitcher,
  usePrototypeVariant,
  type PrototypeVariant,
} from "@/components/shared/prototype-switcher";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/shared/utils";

import type { EventDetailLoaderData } from "./shared";

type GrupalCategory = NonNullable<
  EventDetailLoaderData["grandFinalCategoriesPrototype"]
>[number];

type Side = "children" | "adults" | "straddle";

const variants: PrototypeVariant[] = [
  { key: "A", name: "Número + dos columnas" },
  { key: "B", name: "Regla de edades" },
  { key: "C", name: "Elegir la última infantil" },
];

const DEFAULT_CUTOFF = 13;

export function GrandFinalCutoffPrototype({
  categories,
}: {
  categories: GrupalCategory[];
}) {
  const variant = usePrototypeVariant(variants);
  // Shared across variants so flipping keeps the value.
  const [cutoff, setCutoff] = useState(DEFAULT_CUTOFF);

  return (
    <>
      <FieldSet className="pt-2">
        <FieldLegend>Gran final</FieldLegend>
        <FieldDescription>
          Una academia entra a la Gran final con al menos una coreografía grupal
          infantil y una de mayores.
        </FieldDescription>
        {variant === "A" ? (
          <VariantA
            categories={categories}
            cutoff={cutoff}
            onCutoffChange={setCutoff}
          />
        ) : null}
        {variant === "B" ? (
          <VariantB
            categories={categories}
            cutoff={cutoff}
            onCutoffChange={setCutoff}
          />
        ) : null}
        {variant === "C" ? (
          <VariantC
            categories={categories}
            cutoff={cutoff}
            onCutoffChange={setCutoff}
          />
        ) : null}
      </FieldSet>
      <PrototypeSwitcher variants={variants} />
    </>
  );
}

type VariantProps = {
  categories: GrupalCategory[];
  cutoff: number;
  onCutoffChange: (cutoff: number) => void;
};

// ---------------------------------------------------------------------------
// Shared rule + helpers

function sideOf(category: GrupalCategory, cutoff: number): Side {
  if (category.maxAge <= cutoff) return "children";
  if (category.minAge > cutoff) return "adults";
  return "straddle";
}

function ageRange(category: GrupalCategory) {
  return `${category.minAge} a ${category.maxAge} años`;
}

function modalitiesLabel(category: GrupalCategory) {
  if (category.modalities.length === 0) return "Sin modalidades";
  if (category.modalities.length <= 2) return category.modalities.join(", ");
  return `${category.modalities.length} modalidades`;
}

/** Categories that share a modality set form one ladder of age bands. */
function groupByTrack(categories: GrupalCategory[]) {
  const tracks = new Map<string, GrupalCategory[]>();
  for (const category of categories) {
    const key = [...category.modalities].sort().join("|");
    tracks.set(key, [...(tracks.get(key) ?? []), category]);
  }
  return Array.from(tracks.values())
    .map((track) =>
      [...track].sort((a, b) => a.minAge - b.minAge || a.maxAge - b.maxAge),
    )
    .sort((a, b) => b.length - a.length);
}

function Summary({
  categories,
  cutoff,
}: {
  categories: GrupalCategory[];
  cutoff: number;
}) {
  const counts = { children: 0, adults: 0, straddle: 0 };
  for (const category of categories) counts[sideOf(category, cutoff)] += 1;

  return (
    <p className="text-sm font-medium">
      {categories.length} categorías grupales: {counts.children} infantiles,{" "}
      {counts.adults} mayores,{" "}
      <span className={cn(counts.straddle > 0 && "text-warning")}>
        {counts.straddle} sin clasificar
      </span>
    </p>
  );
}

function StraddleAlert({
  categories,
  cutoff,
}: {
  categories: GrupalCategory[];
  cutoff: number;
}) {
  const straddling = categories.filter(
    (category) => sideOf(category, cutoff) === "straddle",
  );
  if (straddling.length === 0) return null;

  return (
    <Alert variant="warning">
      <TriangleAlert aria-hidden="true" />
      <AlertTitle>
        {straddling.length === 1
          ? "Una categoría cruza la edad de corte"
          : `${straddling.length} categorías cruzan la edad de corte`}
      </AlertTitle>
      <AlertDescription>
        <p>No cuentan ni como infantiles ni como mayores para la Gran final.</p>
        <ul className="list-disc pl-5">
          {straddling.map((category) => (
            <li key={category.id}>
              {category.name} ({ageRange(category)}) —{" "}
              {modalitiesLabel(category)}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

function CutoffInput({
  cutoff,
  onCutoffChange,
  className,
}: {
  cutoff: number;
  onCutoffChange: (cutoff: number) => void;
  className?: string;
}) {
  return (
    <Field className={className}>
      <FieldLabel htmlFor="prototype-grand-final-cutoff">
        Edad de corte de la Gran final
      </FieldLabel>
      <Input
        id="prototype-grand-final-cutoff"
        type="number"
        inputMode="numeric"
        className="max-w-40"
        min={1}
        max={99}
        value={cutoff}
        onKeyDown={(event) => {
          // Inside the event form: Enter must not submit it.
          if (event.key === "Enter") event.preventDefault();
        }}
        onChange={(event) => {
          const next = Number.parseInt(event.target.value, 10);
          if (Number.isFinite(next)) {
            onCutoffChange(Math.min(99, Math.max(1, next)));
          }
        }}
      />
      <FieldDescription>
        Infantiles: categorías grupales hasta {cutoff} años. Mayores: desde{" "}
        {cutoff + 1} años.
      </FieldDescription>
    </Field>
  );
}

// ---------------------------------------------------------------------------
// A — number field + two columns

function VariantA({ categories, cutoff, onCutoffChange }: VariantProps) {
  const children = categories.filter((c) => sideOf(c, cutoff) === "children");
  const adults = categories.filter((c) => sideOf(c, cutoff) === "adults");

  return (
    <div className="flex flex-col gap-4">
      <CutoffInput cutoff={cutoff} onCutoffChange={onCutoffChange} />
      <Summary categories={categories} cutoff={cutoff} />
      <div className="grid gap-4 md:grid-cols-2">
        <SideColumn
          title="Infantiles"
          caption={`hasta ${cutoff} años`}
          categories={children}
        />
        <SideColumn
          title="Mayores"
          caption={`desde ${cutoff + 1} años`}
          categories={adults}
        />
      </div>
      <StraddleAlert categories={categories} cutoff={cutoff} />
    </div>
  );
}

function SideColumn({
  title,
  caption,
  categories,
}: {
  title: string;
  caption: string;
  categories: GrupalCategory[];
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">{caption}</span>
      </div>
      {categories.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ninguna categoría.</p>
      ) : (
        <ul className="flex flex-col divide-y text-sm">
          {categories.map((category) => (
            <li
              key={category.id}
              className="flex items-center justify-between gap-3 py-1.5"
            >
              <span>{category.name}</span>
              <span className="flex items-center gap-3 text-muted-foreground">
                <span className="text-xs">{modalitiesLabel(category)}</span>
                <span className="w-24 text-right tabular-nums">
                  {ageRange(category)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// B — age ruler with a draggable cutoff

/** The ruler covers ages 1–50 linearly; anything older is clipped at the end. */
const RULER_MAX = 50;

function rulerPercent(age: number) {
  return (Math.min(age, RULER_MAX) / RULER_MAX) * 100;
}

function VariantB({ categories, cutoff, onCutoffChange }: VariantProps) {
  const tracks = groupByTrack(categories);
  const ticks = Array.from({ length: RULER_MAX / 5 + 1 }, (_, i) => i * 5);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-sm font-medium">
          Edad de corte de la Gran final:{" "}
          <span className="tabular-nums">{cutoff} años</span>
        </span>
        <Summary categories={categories} cutoff={cutoff} />
      </div>

      <div className="flex flex-col gap-2">
        {tracks.map((track) => (
          <div
            key={track.map((c) => c.id).join()}
            className="grid grid-cols-[10rem_1fr] items-center gap-3"
          >
            <span
              className="truncate text-xs text-muted-foreground"
              title={track[0]?.modalities.join(", ")}
            >
              {track[0] ? modalitiesLabel(track[0]) : null}
            </span>
            <div className="relative h-12 overflow-hidden rounded-md border">
              {/* The two sides, shaded. */}
              <div
                className="absolute inset-y-0 left-0 bg-accent"
                style={{ width: `${rulerPercent(cutoff)}%` }}
              />
              {track.map((category) => {
                const side = sideOf(category, cutoff);
                return (
                  <div
                    key={category.id}
                    title={`${category.name} (${ageRange(category)})`}
                    className={cn(
                      "absolute inset-y-1.5 flex flex-col justify-center overflow-hidden rounded-sm border px-1.5 text-xs leading-tight",
                      side === "children" &&
                        "border-primary bg-primary text-primary-foreground",
                      side === "adults" && "bg-background",
                      side === "straddle" &&
                        "border-warning bg-warning/10 text-warning",
                    )}
                    style={{
                      left: `calc(${rulerPercent(category.minAge - 1)}% + 1px)`,
                      width: `calc(${
                        rulerPercent(category.maxAge) -
                        rulerPercent(category.minAge - 1)
                      }% - 2px)`,
                    }}
                  >
                    <span className="truncate font-medium">
                      {category.name}
                    </span>
                    <span className="truncate opacity-80">
                      {category.minAge}–
                      {category.maxAge > RULER_MAX
                        ? `${category.maxAge} →`
                        : category.maxAge}
                    </span>
                  </div>
                );
              })}
              {/* The cutoff marker. */}
              <div
                className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-foreground"
                style={{ left: `${rulerPercent(cutoff)}%` }}
              />
            </div>
          </div>
        ))}

        <div className="grid grid-cols-[10rem_1fr] items-center gap-3">
          <span className="text-xs text-muted-foreground">
            Arrastrá el corte
          </span>
          <div className="flex flex-col gap-1">
            <Slider
              aria-label="Edad de corte de la Gran final"
              min={0}
              max={RULER_MAX}
              step={1}
              value={[cutoff]}
              onValueChange={([next]) => {
                if (next !== undefined) {
                  onCutoffChange(Math.min(RULER_MAX - 1, Math.max(1, next)));
                }
              }}
            />
            <div className="relative h-4 text-xs text-muted-foreground tabular-nums">
              {ticks.map((tick) => (
                <span
                  key={tick}
                  className="absolute -translate-x-1/2"
                  style={{ left: `${rulerPercent(tick)}%` }}
                >
                  {tick === RULER_MAX ? `${tick}+` : tick}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-primary" /> Infantil
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm border bg-background" /> Mayores
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-sm border border-warning bg-warning/10" />{" "}
          Cruza el corte
        </span>
      </div>

      <StraddleAlert categories={categories} cutoff={cutoff} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// C — no number: pick the last children's band

function VariantC({ categories, cutoff, onCutoffChange }: VariantProps) {
  const tracks = groupByTrack(categories);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">
          Elegí la última categoría infantil
        </span>
        <span className="text-sm text-muted-foreground">
          Todo lo que esté por encima cuenta como mayores. Corte actual: hasta{" "}
          {cutoff} años.
        </span>
      </div>
      <Summary categories={categories} cutoff={cutoff} />
      <div
        className="grid gap-4"
        style={{
          gridTemplateColumns: `repeat(${Math.max(tracks.length, 1)}, minmax(0, 1fr))`,
        }}
      >
        {tracks.map((track) => (
          <div
            key={track.map((c) => c.id).join()}
            className="flex flex-col gap-1"
          >
            <span
              className="truncate pb-1 text-xs text-muted-foreground"
              title={track[0]?.modalities.join(", ")}
            >
              {track[0] ? modalitiesLabel(track[0]) : null}
            </span>
            {track.map((category, index) => {
              const side = sideOf(category, cutoff);
              const next = track[index + 1];
              const isLastChild =
                side === "children" &&
                (!next || sideOf(next, cutoff) !== "children");

              return (
                <div key={category.id} className="flex flex-col gap-1">
                  <Button
                    type="button"
                    variant={category.maxAge === cutoff ? "default" : "outline"}
                    className="h-auto justify-between py-2"
                    aria-pressed={category.maxAge === cutoff}
                    onClick={() => onCutoffChange(category.maxAge)}
                  >
                    <span className="flex flex-col items-start">
                      <span>{category.name}</span>
                      <span className="text-xs font-normal opacity-70">
                        {ageRange(category)}
                      </span>
                    </span>
                    <SideBadge side={side} />
                  </Button>
                  {isLastChild ? (
                    <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
                      <span className="h-px flex-1 bg-foreground" />
                      Corte: {cutoff} / {cutoff + 1} años
                      <span className="h-px flex-1 bg-foreground" />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <StraddleAlert categories={categories} cutoff={cutoff} />
    </div>
  );
}

function SideBadge({ side }: { side: Side }) {
  if (side === "children") return <Badge variant="secondary">Infantil</Badge>;
  if (side === "adults") return <Badge variant="outline">Mayores</Badge>;
  return <Badge variant="warning">Sin clasificar</Badge>;
}

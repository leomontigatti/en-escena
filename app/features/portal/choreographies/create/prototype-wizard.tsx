// PROTOTYPE: the whole full-page choreography wizard with its steps merged, on
// /portal/coreografias/crear. Two variants, switchable via `?variant=A|B`, differ
// only in how single choices are asked (A: selects, B: options in view); the
// dancers and professors steps are the picker settled in the first round.
//
// Nothing is saved and the registration resolution is faked: the category comes
// from the dancer count, and the level and schedule questions can be switched off
// with `?nivel=no` and `?cronograma=no` to see the category step fold away.
// The seed rosters are short, so sample names pad both lists.
import { Check, ChevronLeft, ChevronRight, Pencil } from "lucide-react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";

import { AccessNotice } from "@/components/auth/access-ui";
import { PrototypeSwitcher } from "@/components/shared/prototype-switcher";
import { SearchInput } from "@/components/shared/search-input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  ActiveDancer,
  ActiveProfessor,
} from "@/features/portal/choreographies/create/shared";
import type { ChoreographyRegistrationBaseOptions } from "@/lib/events/bases.server";
import { cn } from "@/lib/shared/utils";

const sampleDancers = [
  "Abril Fernández",
  "Agustina Romero",
  "Bianca Sosa",
  "Camila Torres",
  "Candela Ruiz",
  "Catalina Díaz",
  "Delfina Álvarez",
  "Emilia Gómez",
  "Florencia Acosta",
  "Guadalupe Benítez",
  "Isabella Medina",
  "Josefina Herrera",
  "Julieta Aguirre",
  "Lara Pereyra",
  "Lucía Giménez",
  "Martina Molina",
  "Mía Castro",
  "Milagros Ortiz",
  "Morena Silva",
  "Olivia Núñez",
  "Paula Luna",
  "Renata Juárez",
  "Sofía Cabrera",
  "Valentina Ríos",
  "Victoria Morales",
  "Zoe Domínguez",
  "Tomás Vega",
  "Bautista Paz",
];

const sampleProfessors = [
  "Carolina Méndez",
  "Gabriela Suárez",
  "Mariano Quiroga",
  "Natalia Ferreyra",
  "Verónica Ledesma",
];

const fakeExperienceLevels = [
  {
    value: "inicial",
    label: "Inicial",
    description: "Hasta 2 años de estudio",
  },
  {
    value: "intermedio",
    label: "Intermedio",
    description: "Entre 2 y 5 años de estudio",
  },
  { value: "avanzado", label: "Avanzado", description: "Más de 5 años" },
];

const fakeSchedules = [
  {
    value: "sab-manana",
    label: "Sábado 14 · mañana",
    description: "Quedan 8 lugares",
  },
  {
    value: "sab-tarde",
    label: "Sábado 14 · tarde",
    description: "Sin lugar",
    disabled: true,
  },
  {
    value: "dom-tarde",
    label: "Domingo 15 · tarde",
    description: "Quedan 3 lugares",
  },
];

const variants = [
  { key: "A", name: "Selects" },
  { key: "B", name: "Opciones a la vista" },
];

type Person = { id: string; name: string };
type Choice = {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
};
type StepKey = "datos" | "bailarines" | "categoria" | "profesores" | "resumen";

function toPeople(
  real: Array<ActiveDancer | ActiveProfessor>,
  samples: string[],
  prefix: string,
): Person[] {
  return [
    ...real.map((person) => ({
      id: person.id,
      name: `${person.firstName} ${person.lastName}`,
    })),
    ...samples.map((name, index) => ({ id: `${prefix}-${index}`, name })),
  ].sort((a, b) => a.name.localeCompare(b.name, "es"));
}

function groupTypeLabel(count: number) {
  if (count === 1) return "Solo";
  if (count === 2) return "Dúo";
  if (count === 3) return "Trío";
  return "Grupal";
}

export function PrototypeWizard({
  baseOptions,
  dancers,
  professors,
}: {
  baseOptions: ChoreographyRegistrationBaseOptions;
  dancers: ActiveDancer[];
  professors: ActiveProfessor[];
}) {
  const [searchParams] = useSearchParams();
  const choiceStyle = searchParams.get("variant") === "B" ? "cards" : "select";
  const needsLevel = searchParams.get("nivel") !== "no";
  const needsSchedule = searchParams.get("cronograma") !== "no";

  const dancerPeople = toPeople(dancers, sampleDancers, "bailarin");
  const professorPeople = toPeople(professors, sampleProfessors, "profesor");

  const [name, setName] = useState("");
  const [modalityId, setModalityId] = useState("");
  const [submodalityId, setSubmodalityId] = useState("");
  const [dancerIds, setDancerIds] = useState<string[]>([]);
  const [levelId, setLevelId] = useState("");
  const [scheduleId, setScheduleId] = useState("");
  const [professorIds, setProfessorIds] = useState<string[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [isResolving, setIsResolving] = useState(false);
  const [saved, setSaved] = useState(false);

  const submodalities = baseOptions.submodalities.filter(
    (submodality) => submodality.modalityId === modalityId,
  );
  const steps: StepKey[] = [
    "datos",
    "bailarines",
    ...(needsLevel || needsSchedule ? (["categoria"] as const) : []),
    "profesores",
    "resumen",
  ];
  const step = steps[Math.min(stepIndex, steps.length - 1)];

  const canAdvance: Record<StepKey, boolean> = {
    datos:
      name.trim().length > 0 &&
      modalityId.length > 0 &&
      (submodalities.length === 0 || submodalityId.length > 0),
    bailarines: dancerIds.length > 0,
    categoria:
      (!needsLevel || levelId.length > 0) &&
      (!needsSchedule || scheduleId.length > 0),
    profesores: professorIds.length > 0,
    resumen: true,
  };

  function goTo(target: StepKey) {
    setStepIndex(steps.indexOf(target));
    window.scrollTo({ top: 0 });
  }

  function handleNext() {
    if (step === "bailarines") {
      // The real step asks the server for the category here.
      setIsResolving(true);
      window.setTimeout(() => {
        setIsResolving(false);
        setStepIndex((index) => index + 1);
      }, 600);
      return;
    }
    if (step === "resumen") {
      setSaved(true);
      return;
    }
    setStepIndex((index) => index + 1);
    window.scrollTo({ top: 0 });
  }

  function handleDancersChange(ids: string[]) {
    // Another roster is another category: the answers that hung on it go.
    setDancerIds(ids);
    setLevelId("");
    setScheduleId("");
  }

  const modality = baseOptions.modalities.find(
    (item) => item.id === modalityId,
  );
  const submodality = submodalities.find((item) => item.id === submodalityId);
  const category = `Juvenil · ${groupTypeLabel(dancerIds.length)}`;
  const namesOf = (people: Person[], ids: string[]) =>
    people
      .filter((person) => ids.includes(person.id))
      .map((person) => person.name)
      .join(", ");

  const content: Record<StepKey, ReactNode> = {
    datos: (
      <>
        <StepIntro
          title="La coreografía"
          hint="Su nombre y en qué modalidad compite."
        />
        <Field>
          <FieldLabel htmlFor="prototipo-nombre">Nombre</FieldLabel>
          <Input
            id="prototipo-nombre"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="off"
          />
          <FieldDescription>
            Una vez guardado no puede modificarse.
          </FieldDescription>
        </Field>
        <SingleChoice
          id="prototipo-modalidad"
          label="Modalidad"
          style={choiceStyle}
          value={modalityId}
          onChange={(value) => {
            setModalityId(value);
            setSubmodalityId("");
          }}
          options={baseOptions.modalities.map((item) => ({
            value: item.id,
            label: item.name,
          }))}
        />
        {submodalities.length > 0 ? (
          <SingleChoice
            id="prototipo-submodalidad"
            label="Submodalidad"
            style={choiceStyle}
            value={submodalityId}
            onChange={setSubmodalityId}
            options={submodalities.map((item) => ({
              value: item.id,
              label: item.name,
            }))}
          />
        ) : null}
      </>
    ),
    bailarines: (
      <RosterPicker
        title="¿Quiénes bailan?"
        hint="Marcá a todos los bailarines de la coreografía y tocá Siguiente."
        emptySelection="Todavía no seleccionaste bailarines."
        searchLabel="Buscar bailarines"
        people={dancerPeople}
        selected={dancerIds}
        onChange={handleDancersChange}
      />
    ),
    categoria: (
      <>
        <StepIntro
          title="Categoría"
          hint="Sale de las edades de los bailarines. Si no es la que esperabas, volvé y revisá quiénes bailan."
        />
        <div className="flex flex-col gap-1 rounded-lg border bg-muted/40 px-4 py-3">
          <span className="text-xs font-semibold text-muted-foreground uppercase">
            Compite en
          </span>
          <span className="text-base font-medium">{category}</span>
        </div>
        {needsLevel ? (
          <SingleChoice
            id="prototipo-nivel"
            label="Nivel de experiencia"
            style={choiceStyle}
            value={levelId}
            onChange={setLevelId}
            options={fakeExperienceLevels}
          />
        ) : null}
        {needsSchedule ? (
          <SingleChoice
            id="prototipo-cronograma"
            label="Cronograma"
            style={choiceStyle}
            value={scheduleId}
            onChange={setScheduleId}
            options={fakeSchedules}
          />
        ) : null}
      </>
    ),
    profesores: (
      <RosterPicker
        title="¿Quiénes la prepararon?"
        hint="Marcá a los profesores de la coreografía y tocá Siguiente."
        emptySelection="Todavía no seleccionaste profesores."
        searchLabel="Buscar profesores"
        people={professorPeople}
        selected={professorIds}
        onChange={setProfessorIds}
      />
    ),
    resumen: (
      <>
        <StepIntro
          title="Revisá antes de guardar"
          hint="Tocá Cambiar para corregir un dato."
        />
        <AccessNotice variant={saved ? "success" : "info"}>
          {saved
            ? "PROTOTIPO: acá se guardaría y volverías a la lista de coreografías."
            : "Una vez guardada no vas a poder modificarla."}
        </AccessNotice>
        <dl className="flex flex-col divide-y rounded-lg border">
          <SummaryRow label="Nombre" onEdit={() => goTo("datos")}>
            {name}
          </SummaryRow>
          <SummaryRow label="Modalidad" onEdit={() => goTo("datos")}>
            {[modality?.name, submodality?.name].filter(Boolean).join(" · ")}
          </SummaryRow>
          <SummaryRow
            label={`Bailarines (${dancerIds.length})`}
            onEdit={() => goTo("bailarines")}
          >
            {namesOf(dancerPeople, dancerIds)}
          </SummaryRow>
          <SummaryRow label="Categoría">{category}</SummaryRow>
          {needsLevel ? (
            <SummaryRow
              label="Nivel de experiencia"
              onEdit={() => goTo("categoria")}
            >
              {
                fakeExperienceLevels.find((item) => item.value === levelId)
                  ?.label
              }
            </SummaryRow>
          ) : null}
          <SummaryRow
            label="Cronograma"
            onEdit={needsSchedule ? () => goTo("categoria") : undefined}
          >
            {needsSchedule
              ? fakeSchedules.find((item) => item.value === scheduleId)?.label
              : "Sábado 14 · mañana (el único disponible)"}
          </SummaryRow>
          <SummaryRow
            label={`Profesores (${professorIds.length})`}
            onEdit={() => goTo("profesores")}
          >
            {namesOf(professorPeople, professorIds)}
          </SummaryRow>
        </dl>
      </>
    ),
  };

  return (
    // PROTOTYPE: fills the viewport under the header (and through main's bottom
    // padding) so the footer sits on the bottom edge even when the step is short.
    <div className="mx-auto -mb-6 flex min-h-[calc(100svh-4rem-1px-1.5rem)] w-full max-w-2xl flex-col gap-5 md:min-h-[calc(100svh-4rem-1px-1.5rem-1rem)]">
      <PrototypeSwitcher variants={variants} />
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-2">
          <h1 className="text-lg font-semibold">Nueva coreografía</h1>
          <span className="text-sm text-muted-foreground">
            Paso {stepIndex + 1} de {steps.length}
          </span>
        </div>
        <Progress value={((stepIndex + 1) / steps.length) * 100} />
      </div>
      <div className="flex flex-1 flex-col gap-5">{content[step]}</div>
      <div className="sticky bottom-0 z-10 -mx-4 mt-auto flex items-center justify-between gap-3 bg-background px-4 py-3 sm:mx-0 sm:px-0">
        {stepIndex === 0 ? (
          <Button asChild variant="outline">
            <Link to="/portal/coreografias">Cancelar</Link>
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setStepIndex((index) => index - 1);
              setSaved(false);
            }}
          >
            <ChevronLeft aria-hidden="true" data-icon />
            Anterior
          </Button>
        )}
        <Button
          type="button"
          disabled={!canAdvance[step] || isResolving}
          onClick={handleNext}
        >
          {step === "resumen" ? (
            <>
              <Check aria-hidden="true" data-icon />
              Guardar
            </>
          ) : (
            <>
              Siguiente
              {isResolving ? (
                <Spinner aria-hidden="true" data-icon />
              ) : (
                <ChevronRight aria-hidden="true" data-icon />
              )}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function StepIntro({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-base font-medium">{title}</h2>
      <p className="text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}

function SingleChoice({
  id,
  label,
  onChange,
  options,
  style,
  value,
}: {
  id: string;
  label: string;
  onChange: (value: string) => void;
  options: Choice[];
  style: "cards" | "select";
  value: string;
}) {
  if (style === "select") {
    return (
      <Field>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger id={id} className="w-full">
            <SelectValue placeholder="Seleccionar" />
          </SelectTrigger>
          <SelectContent position="popper">
            {options.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
                disabled={option.disabled}
              >
                {option.description
                  ? `${option.label} · ${option.description}`
                  : option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    );
  }

  // The real build would add shadcn's radio-group; the primitive stands in here.
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">{label}</span>
      <RadioGroupPrimitive.Root
        aria-label={label}
        className="grid gap-2 sm:grid-cols-2"
        value={value}
        onValueChange={onChange}
      >
        {options.map((option) => (
          <FieldLabel
            key={option.value}
            htmlFor={`${id}-${option.value}`}
            className={cn(option.disabled && "opacity-50")}
          >
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>{option.label}</FieldTitle>
                {option.description ? (
                  <FieldDescription>{option.description}</FieldDescription>
                ) : null}
              </FieldContent>
              <RadioGroupPrimitive.Item
                id={`${id}-${option.value}`}
                value={option.value}
                disabled={option.disabled}
                className="flex size-4 shrink-0 items-center justify-center rounded-full border border-input data-[state=checked]:border-primary"
              >
                <RadioGroupPrimitive.Indicator className="size-2 rounded-full bg-primary" />
              </RadioGroupPrimitive.Item>
            </Field>
          </FieldLabel>
        ))}
      </RadioGroupPrimitive.Root>
    </div>
  );
}

function normalize(value: string) {
  return value
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function RosterPicker({
  emptySelection,
  hint,
  onChange,
  people,
  searchLabel,
  selected,
  title,
}: {
  emptySelection: string;
  hint: string;
  onChange: (ids: string[]) => void;
  people: Person[];
  searchLabel: string;
  selected: string[];
  title: string;
}) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("todos");
  const rows = people.filter(
    (person) =>
      normalize(person.name).includes(normalize(query)) &&
      (tab === "todos" || selected.includes(person.id)),
  );

  function toggle(id: string) {
    onChange(
      selected.includes(id)
        ? selected.filter((value) => value !== id)
        : [...selected, id],
    );
  }

  return (
    <>
      <StepIntro title={title} hint={hint} />
      <div className="flex flex-1 flex-col gap-2">
        <SearchInput
          aria-label={searchLabel}
          placeholder="Buscar por nombre"
          value={query}
          onValueChange={setQuery}
        />
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full">
            <TabsTrigger value="todos">Todos</TabsTrigger>
            <TabsTrigger value="seleccionados">
              Seleccionados ({selected.length})
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="min-h-64 flex-1 basis-0 overflow-y-auto rounded-lg border p-1">
          {rows.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              {tab === "seleccionados" && query.length === 0
                ? emptySelection
                : "Sin resultados."}
            </p>
          ) : null}
          {rows.map((person) => (
            <div
              key={person.id}
              className={cn(
                "flex min-h-10 w-full items-center rounded-md px-3 hover:bg-muted/60",
                selected.includes(person.id) && "bg-primary/5",
              )}
            >
              <Label className="flex flex-1 cursor-pointer items-center gap-3 self-stretch">
                <Checkbox
                  checked={selected.includes(person.id)}
                  onCheckedChange={() => toggle(person.id)}
                />
                <span className="flex-1">{person.name}</span>
              </Label>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function SummaryRow({
  children,
  label,
  onEdit,
}: {
  children: ReactNode;
  label: string;
  onEdit?: () => void;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="flex flex-1 flex-col gap-0.5">
        <dt className="text-xs font-semibold text-muted-foreground uppercase">
          {label}
        </dt>
        <dd className="text-sm">{children}</dd>
      </div>
      {onEdit ? (
        <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
          <Pencil aria-hidden="true" data-icon />
          Cambiar
        </Button>
      ) : null}
    </div>
  );
}

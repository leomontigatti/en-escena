// PROTOTYPE: three throwaway variants of the dancers step of a full-page
// choreography wizard, switchable via `?variant=A|B|C` on
// /portal/coreografias/crear. The seed has two dancers, so sample names pad the
// list to show how each variant holds up with a long roster. Nothing is saved.
import { ChevronLeft, ChevronRight, Plus, Search, X } from "lucide-react";
import { useState, type ReactNode } from "react";

import { PrototypeSwitcher } from "@/components/shared/prototype-switcher";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ActiveDancer } from "@/features/portal/choreographies/create/shared";
import { cn } from "@/lib/shared/utils";

const sampleNames = [
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

type Person = { id: string; name: string };

const variants = [
  { key: "A", name: "Lista con casillas" },
  { key: "B", name: "Elegidos arriba" },
  { key: "C", name: "Lista a pantalla completa" },
];

export function PrototypeRosterStep({
  dancers,
  variant,
}: {
  dancers: ActiveDancer[];
  variant: string;
}) {
  const people: Person[] = [
    ...dancers.map((dancer) => ({
      id: dancer.id,
      name: `${dancer.firstName} ${dancer.lastName}`,
    })),
    ...sampleNames.map((name, index) => ({ id: `sample-${index}`, name })),
  ].sort((a, b) => a.name.localeCompare(b.name));
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  }

  const filtered = people.filter((person) =>
    person.name
      .toLocaleLowerCase("es")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .includes(
        query
          .toLocaleLowerCase("es")
          .normalize("NFD")
          .replace(/\p{Diacritic}/gu, ""),
      ),
  );
  const state = { filtered, people, query, selected, setQuery, toggle };

  return (
    // PROTOTYPE: fills the viewport under the header (and through main's bottom
    // padding) so the footer sits on the bottom edge even when the step is short.
    <div className="mx-auto -mb-6 flex min-h-[calc(100svh-4rem-1px-1.5rem)] w-full max-w-2xl flex-col md:min-h-[calc(100svh-4rem-1px-1.5rem-1rem)] [&>div]:flex-1">
      <PrototypeSwitcher variants={variants} />
      {variant === "B" ? (
        <VariantB {...state} />
      ) : variant === "C" ? (
        <VariantC {...state} />
      ) : (
        <VariantA {...state} />
      )}
    </div>
  );
}

type VariantProps = {
  filtered: Person[];
  people: Person[];
  query: string;
  selected: string[];
  setQuery: (value: string) => void;
  toggle: (id: string) => void;
};

function StepHeader() {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h1 className="text-lg font-semibold">Nueva coreografía</h1>
        <span className="text-sm text-muted-foreground">Paso 3 de 5</span>
      </div>
      <Progress value={60} />
    </div>
  );
}

function SearchBox({
  query,
  setQuery,
}: Pick<VariantProps, "query" | "setQuery">) {
  return (
    <InputGroup>
      <InputGroupAddon>
        <Search />
      </InputGroupAddon>
      <InputGroupInput
        aria-label="Buscar bailarines"
        placeholder="Buscar por nombre"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {query.length > 0 ? (
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-xs" onClick={() => setQuery("")}>
            <X aria-hidden="true" data-icon />
            <span className="sr-only">Limpiar búsqueda</span>
          </InputGroupButton>
        </InputGroupAddon>
      ) : null}
    </InputGroup>
  );
}

function StepFooter({
  children,
  count,
}: {
  children?: ReactNode;
  count: number;
}) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 mt-auto bg-background px-4 py-3 sm:mx-0 sm:px-0">
      {children}
      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="outline">
          <ChevronLeft aria-hidden="true" data-icon />
          Anterior
        </Button>
        <Button type="button" disabled={count === 0}>
          Siguiente
          <ChevronRight aria-hidden="true" data-icon />
        </Button>
      </div>
    </div>
  );
}

function countLabel(count: number) {
  if (count === 0) {
    return "Ningún bailarín seleccionado";
  }
  return count === 1
    ? "1 bailarín seleccionado"
    : `${count} bailarines seleccionados`;
}

function PersonRow({
  checked,
  person,
  toggle,
  large = false,
}: {
  checked: boolean;
  person: Person;
  toggle: (id: string) => void;
  large?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex w-full items-center rounded-md px-3 hover:bg-muted/60",
        large ? "min-h-12 text-base" : "min-h-10",
        checked && "bg-primary/5",
      )}
    >
      <Label className="flex flex-1 cursor-pointer items-center gap-3 self-stretch">
        <Checkbox checked={checked} onCheckedChange={() => toggle(person.id)} />
        <span className="flex-1">{person.name}</span>
      </Label>
    </div>
  );
}

/** A: search + bounded checkbox list inside the step; count above the list. */
function VariantA({
  filtered,
  query,
  selected,
  setQuery,
  toggle,
}: VariantProps) {
  const [tab, setTab] = useState("todos");
  const rows =
    tab === "seleccionados"
      ? filtered.filter((person) => selected.includes(person.id))
      : filtered;

  return (
    <div className="flex flex-col gap-5">
      <StepHeader />
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-medium">¿Quiénes bailan?</h2>
        <p className="text-sm text-muted-foreground">
          Marcá a todos los bailarines de la coreografía y tocá Siguiente.
        </p>
      </div>
      <div className="flex flex-1 flex-col gap-2">
        <SearchBox query={query} setQuery={setQuery} />
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
              {tab === "seleccionados"
                ? "Todavía no seleccionaste bailarines."
                : "Sin resultados."}
            </p>
          ) : null}
          {rows.map((person) => (
            <PersonRow
              key={person.id}
              checked={selected.includes(person.id)}
              person={person}
              toggle={toggle}
            />
          ))}
        </div>
      </div>
      <StepFooter count={selected.length} />
    </div>
  );
}

/** B: the chosen ones live in their own block on top; the list only adds. */
function VariantB({
  filtered,
  people,
  query,
  selected,
  setQuery,
  toggle,
}: VariantProps) {
  const chosen = selected
    .map((id) => people.find((person) => person.id === id))
    .filter((person): person is Person => Boolean(person));
  const available = filtered.filter((person) => !selected.includes(person.id));

  return (
    <div className="flex flex-col gap-5">
      <StepHeader />
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-medium">¿Quiénes bailan?</h2>
        <p className="text-sm text-muted-foreground">
          Agregá a los bailarines de la coreografía desde la lista de abajo.
        </p>
      </div>
      <section className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">En la coreografía</span>
          <Badge variant="secondary">{chosen.length}</Badge>
        </div>
        {chosen.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">
            Todavía no agregaste bailarines.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {chosen.map((person) => (
              <li key={person.id}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={`Quitar a ${person.name}`}
                  onClick={() => toggle(person.id)}
                >
                  {person.name}
                  <X aria-hidden="true" data-icon />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="flex flex-col gap-2">
        <span className="text-sm font-medium">Bailarines de la academia</span>
        <SearchBox query={query} setQuery={setQuery} />
        <ul className="flex flex-col divide-y rounded-lg border">
          {available.map((person) => (
            <li
              key={person.id}
              className="flex min-h-11 items-center justify-between gap-2 px-3"
            >
              <span className="text-sm">{person.name}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => toggle(person.id)}
              >
                <Plus aria-hidden="true" data-icon />
                Agregar
              </Button>
            </li>
          ))}
        </ul>
      </section>
      <StepFooter count={selected.length} />
    </div>
  );
}

/** C: the list is the page; search sticks on top, the count rides the footer. */
function VariantC({
  filtered,
  query,
  selected,
  setQuery,
  toggle,
}: VariantProps) {
  const [tab, setTab] = useState("todos");
  const rows =
    tab === "seleccionados"
      ? filtered.filter((person) => selected.includes(person.id))
      : filtered;

  return (
    <div className="flex flex-col gap-4">
      <StepHeader />
      <h2 className="text-base font-medium">¿Quiénes bailan?</h2>
      <div className="sticky top-0 z-10 -mx-4 flex flex-col gap-2 bg-background/95 px-4 py-2 backdrop-blur sm:mx-0 sm:px-0">
        <SearchBox query={query} setQuery={setQuery} />
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full">
            <TabsTrigger value="todos">Todos</TabsTrigger>
            <TabsTrigger value="seleccionados">
              Seleccionados ({selected.length})
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="flex flex-col">
        {rows.map((person) => (
          <PersonRow
            key={person.id}
            checked={selected.includes(person.id)}
            person={person}
            toggle={toggle}
            large
          />
        ))}
      </div>
      <StepFooter count={selected.length}>
        <p className="mb-2 text-center text-sm font-medium">
          {countLabel(selected.length)}
        </p>
      </StepFooter>
    </div>
  );
}

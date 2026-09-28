import { useState } from "react";
import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

import { SearchInput } from "@/components/shared/search-input";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldError } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { matchesListSearch } from "@/lib/list-query/list-query";
import { cn } from "@/lib/shared/utils";

type ChecklistPerson = {
  value: string;
  label: string;
};

type PeopleChecklistFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = {
  control: Control<TFieldValues>;
  emptySelectionMessage: string;
  label: string;
  name: TName;
  onValueChange?: () => void;
  people: ChecklistPerson[];
  searchLabel: string;
};

type ChecklistTab = "todos" | "seleccionados";

/**
 * Picks people from a list shown in place, not in a popover: a long roster
 * scrolls inside the list, so nothing covers the actions below it. The list
 * takes the height its parent leaves it, down to a floor.
 */
function PeopleChecklistField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  control,
  emptySelectionMessage,
  label,
  name,
  onValueChange,
  people,
  searchLabel,
}: PeopleChecklistFieldProps<TFieldValues, TName>) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<ChecklistTab>("todos");

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const selected: string[] = Array.isArray(field.value)
          ? field.value
          : [];
        const rows = people.filter(
          (person) =>
            (tab === "todos" || selected.includes(person.value)) &&
            matchesListSearch(query, [person.label]),
        );

        function toggle(value: string) {
          field.onChange(
            selected.includes(value)
              ? selected.filter((selectedValue) => selectedValue !== value)
              : [...selected, value],
          );
          onValueChange?.();
        }

        return (
          <div
            role="group"
            aria-label={label}
            className="flex flex-1 flex-col gap-2"
          >
            <SearchInput
              aria-label={searchLabel}
              placeholder="Buscar por nombre"
              value={query}
              onValueChange={setQuery}
            />
            <Tabs
              value={tab}
              onValueChange={(value) => setTab(value as ChecklistTab)}
            >
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
                    ? emptySelectionMessage
                    : "Sin resultados."}
                </p>
              ) : null}
              {rows.map((person) => (
                <PeopleChecklistRow
                  key={person.value}
                  checked={selected.includes(person.value)}
                  person={person}
                  onToggle={() => toggle(person.value)}
                />
              ))}
            </div>
            <FieldError>{fieldState.error?.message}</FieldError>
          </div>
        );
      }}
    />
  );
}

function PeopleChecklistRow({
  checked,
  onToggle,
  person,
}: {
  checked: boolean;
  onToggle: () => void;
  person: ChecklistPerson;
}) {
  return (
    <div
      data-slot="people-checklist-row"
      className={cn(
        "flex min-h-10 w-full items-center rounded-md px-3 hover:bg-muted/60",
        checked && "bg-primary/5",
      )}
    >
      <Label className="flex flex-1 cursor-pointer items-center gap-3 self-stretch">
        <Checkbox checked={checked} onCheckedChange={onToggle} />
        <span className="flex-1">{person.label}</span>
      </Label>
    </div>
  );
}

export { PeopleChecklistField };

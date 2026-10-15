import { useState, type ReactNode } from "react";
import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

import { ChoiceCard } from "@/components/shared/choice-card";
import { SearchInput } from "@/components/shared/search-input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldError } from "@/components/ui/field";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { matchesListSearch } from "@/lib/list-query/list-query";

type ChecklistOption = {
  value: string;
  label: string;
};

type ChecklistFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = {
  control: Control<TFieldValues>;
  disabled?: boolean;
  emptySelectionMessage: string;
  /** An error the form does not own, such as a server preview's reason. */
  error?: string;
  /** Posts each checked option as a hidden input, for a form that submits its own fields. */
  inputName?: string;
  label: string;
  name: TName;
  /** What an empty list says: there is nothing to pick yet. */
  noOptionsMessage?: string;
  onValueChange?: () => void;
  options: ChecklistOption[];
  searchLabel: string;
};

type ChecklistTab = "all" | "selected";

/** A row's checkbox: on, off, or `indeterminate` for a mixed starting point. */
type ChecklistCheckedState = boolean | "indeterminate";

// Eight rows fit under the list's `max-h-80` even in one column, so a list
// this short never scrolls: a search would find nothing hidden, and every
// checked row is already in sight.
const SEARCHABLE_OPTION_COUNT = 9;

/**
 * Picks options from a list shown in place, not in a popover: a long list —
 * an academy's dancers, an event's schedules — scrolls inside itself, so
 * nothing covers the actions below it. The rows sit in two columns once the
 * list's own width allows, so the same field reads well on a page and in a
 * dialog. A short list is a plain checkbox group, without the search and the
 * `Todos | Seleccionados` tabs.
 */
function ChecklistField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  control,
  disabled = false,
  emptySelectionMessage,
  error,
  inputName,
  label,
  name,
  noOptionsMessage,
  onValueChange,
  options,
  searchLabel,
}: ChecklistFieldProps<TFieldValues, TName>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const selected: string[] = Array.isArray(field.value)
          ? field.value
          : [];

        return (
          <Checklist
            checkedStateOf={(value) => selected.includes(value)}
            disabled={disabled}
            emptySelectionMessage={emptySelectionMessage}
            error={fieldState.error?.message ?? error}
            label={label}
            noOptionsMessage={noOptionsMessage}
            onToggle={(value) => {
              field.onChange(
                selected.includes(value)
                  ? selected.filter((selectedValue) => selectedValue !== value)
                  : [...selected, value],
              );
              onValueChange?.();
            }}
            options={options}
            searchLabel={searchLabel}
          >
            {inputName
              ? selected.map((value) => (
                  <input
                    key={value}
                    type="hidden"
                    name={inputName}
                    value={value}
                  />
                ))
              : null}
          </Checklist>
        );
      }}
    />
  );
}

/**
 * The list itself, for a field whose value is not a plain set of picks: the
 * caller says what each row's checkbox shows and what a click does to it.
 * `Seleccionados` lists every row that is not off, a mixed one included.
 */
function Checklist({
  checkedStateOf,
  children,
  disabled = false,
  emptySelectionMessage,
  error,
  label,
  noOptionsMessage = "Sin opciones.",
  onToggle,
  options,
  searchLabel,
}: {
  checkedStateOf: (value: string) => ChecklistCheckedState;
  /** Rendered before the list: a form's hidden inputs, say. */
  children?: ReactNode;
  disabled?: boolean;
  emptySelectionMessage: string;
  error?: string;
  label: string;
  /** What an empty list says: there is nothing to pick yet. */
  noOptionsMessage?: string;
  onToggle: (value: string) => void;
  options: ChecklistOption[];
  searchLabel: string;
}) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<ChecklistTab>("all");
  const searchable = options.length >= SEARCHABLE_OPTION_COUNT;

  // A list that shrinks below the threshold drops its search and tabs, and
  // with them whatever they were narrowing it to: grown back, it starts over.
  if (!searchable && (query !== "" || tab !== "all")) {
    setQuery("");
    setTab("all");
  }

  const selectedCount = options.filter(
    (option) => checkedStateOf(option.value) !== false,
  ).length;
  const rows = options.filter(
    (option) =>
      (tab === "all" || checkedStateOf(option.value) !== false) &&
      matchesListSearch(query, [option.label]),
  );

  return (
    <div
      role="group"
      aria-label={label}
      className="@container flex flex-col gap-4"
    >
      {children}
      {searchable ? (
        <ChecklistNarrowing
          query={query}
          searchLabel={searchLabel}
          selectedCount={selectedCount}
          tab={tab}
          onQueryChange={setQuery}
          onTabChange={setTab}
        />
      ) : null}
      <div
        // Grows with the rows up to a ceiling, then scrolls inside, its
        // edges fading while there is more to scroll to. The fade is the
        // cue, so no scrollbar narrows the rows out of line with the
        // fields around the list.
        className="no-scrollbar max-h-80 scroll-fade overflow-y-auto"
      >
        {rows.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            {readEmptyMessage({
              emptySelectionMessage,
              hasOptions: options.length > 0,
              isSearching: query.length > 0,
              noOptionsMessage,
              tab,
            })}
          </p>
        ) : null}
        <div className="grid gap-2 @lg:grid-cols-2">
          {rows.map((option) => (
            <ChecklistRow
              key={option.value}
              checked={checkedStateOf(option.value)}
              disabled={disabled}
              invalid={Boolean(error)}
              option={option}
              onToggle={() => onToggle(option.value)}
            />
          ))}
        </div>
      </div>
      <FieldError>{error}</FieldError>
    </div>
  );
}

/** The search and the `Todos | Seleccionados` tabs of a long list. */
function ChecklistNarrowing({
  onQueryChange,
  onTabChange,
  query,
  searchLabel,
  selectedCount,
  tab,
}: {
  onQueryChange: (query: string) => void;
  onTabChange: (tab: ChecklistTab) => void;
  query: string;
  searchLabel: string;
  selectedCount: number;
  tab: ChecklistTab;
}) {
  return (
    <div className="flex flex-col gap-2 @md:flex-row @md:items-center @md:gap-4">
      <SearchInput
        aria-label={searchLabel}
        className="@md:w-64"
        placeholder="Buscar por nombre"
        value={query}
        onValueChange={onQueryChange}
      />
      <Tabs
        value={tab}
        onValueChange={(value) => onTabChange(value as ChecklistTab)}
      >
        <TabsList variant="line">
          <TabsTrigger value="all">Todos</TabsTrigger>
          <TabsTrigger value="selected">
            Seleccionados
            <span className="sr-only">, </span>
            <Badge variant="secondary">{selectedCount}</Badge>
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}

/** Why the list shows no row: nothing to pick, nothing picked, or no match. */
function readEmptyMessage({
  emptySelectionMessage,
  hasOptions,
  isSearching,
  noOptionsMessage,
  tab,
}: {
  emptySelectionMessage: string;
  hasOptions: boolean;
  isSearching: boolean;
  noOptionsMessage: string;
  tab: ChecklistTab;
}) {
  if (!hasOptions) {
    return noOptionsMessage;
  }

  if (tab === "selected" && !isSearching) {
    return emptySelectionMessage;
  }

  return "Sin resultados.";
}

function ChecklistRow({
  checked,
  disabled,
  invalid,
  onToggle,
  option,
}: {
  checked: ChecklistCheckedState;
  disabled: boolean;
  invalid: boolean;
  onToggle: () => void;
  option: ChecklistOption;
}) {
  return (
    <ChoiceCard disabled={disabled} label={option.label}>
      <Checkbox
        aria-invalid={invalid ? true : undefined}
        checked={checked}
        disabled={disabled}
        onCheckedChange={onToggle}
      />
    </ChoiceCard>
  );
}

export { Checklist, ChecklistField };

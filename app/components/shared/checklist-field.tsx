import { useState } from "react";
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
  label: string;
  name: TName;
  onValueChange?: () => void;
  options: ChecklistOption[];
  searchLabel: string;
};

type ChecklistTab = "all" | "selected";

/**
 * Picks options from a list shown in place, not in a popover: a long list —
 * an academy's dancers, an event's schedules — scrolls inside itself, so
 * nothing covers the actions below it. The rows sit in two columns once the
 * list's own width allows, so the same field reads well on a page and in a
 * dialog.
 */
function ChecklistField<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
>({
  control,
  disabled = false,
  emptySelectionMessage,
  label,
  name,
  onValueChange,
  options,
  searchLabel,
}: ChecklistFieldProps<TFieldValues, TName>) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<ChecklistTab>("all");

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const selected: string[] = Array.isArray(field.value)
          ? field.value
          : [];
        const rows = options.filter(
          (option) =>
            (tab === "all" || selected.includes(option.value)) &&
            matchesListSearch(query, [option.label]),
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
            className="@container flex flex-col gap-4"
          >
            <div className="flex flex-col gap-2 @md:flex-row @md:items-center @md:gap-4">
              <SearchInput
                aria-label={searchLabel}
                className="@md:w-64"
                placeholder="Buscar por nombre"
                value={query}
                onValueChange={setQuery}
              />
              <Tabs
                value={tab}
                onValueChange={(value) => setTab(value as ChecklistTab)}
              >
                <TabsList variant="line">
                  <TabsTrigger value="all">Todos</TabsTrigger>
                  <TabsTrigger value="selected">
                    Seleccionados
                    <span className="sr-only">, </span>
                    <Badge variant="secondary">{selected.length}</Badge>
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div
              // Grows with the rows up to a ceiling, then scrolls inside, its
              // edges fading while there is more to scroll to.
              className="max-h-80 scroll-fade overflow-y-auto"
            >
              {rows.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {tab === "selected" && query.length === 0
                    ? emptySelectionMessage
                    : "Sin resultados."}
                </p>
              ) : null}
              <div className="grid gap-2 @lg:grid-cols-2">
                {rows.map((option) => (
                  <ChecklistRow
                    key={option.value}
                    checked={selected.includes(option.value)}
                    disabled={disabled}
                    option={option}
                    onToggle={() => toggle(option.value)}
                  />
                ))}
              </div>
            </div>
            <FieldError>{fieldState.error?.message}</FieldError>
          </div>
        );
      }}
    />
  );
}

function ChecklistRow({
  checked,
  disabled,
  onToggle,
  option,
}: {
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
  option: ChecklistOption;
}) {
  return (
    <ChoiceCard disabled={disabled} label={option.label}>
      <Checkbox
        checked={checked}
        disabled={disabled}
        onCheckedChange={onToggle}
      />
    </ChoiceCard>
  );
}

export { ChecklistField };

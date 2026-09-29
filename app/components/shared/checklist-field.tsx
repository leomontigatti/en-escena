import { useState } from "react";
import {
  Controller,
  type Control,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

import { SearchInput } from "@/components/shared/search-input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldError } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { matchesListSearch } from "@/lib/list-query/list-query";
import { cn } from "@/lib/shared/utils";

type ChecklistOption = {
  value: string;
  label: string;
};

/**
 * `capped` grows with the rows up to a ceiling, then scrolls: a form with
 * other fields below it. `fill` takes whatever height the parent leaves, down
 * to a floor: a step whose only content is the list.
 */
type ChecklistHeight = "capped" | "fill";

type ChecklistFieldProps<
  TFieldValues extends FieldValues,
  TName extends FieldPath<TFieldValues>,
> = {
  control: Control<TFieldValues>;
  disabled?: boolean;
  emptySelectionMessage: string;
  height?: ChecklistHeight;
  label: string;
  name: TName;
  onValueChange?: () => void;
  options: ChecklistOption[];
  searchLabel: string;
};

type ChecklistTab = "todos" | "seleccionados";

/**
 * Picks options from a list shown in place, not in a popover: a long list —
 * an academy's dancers, an event's schedules — scrolls inside itself, so
 * nothing covers the actions below it. The rows sit in as many columns as the
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
  height = "capped",
  label,
  name,
  onValueChange,
  options,
  searchLabel,
}: ChecklistFieldProps<TFieldValues, TName>) {
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
        const rows = options.filter(
          (option) =>
            (tab === "todos" || selected.includes(option.value)) &&
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
            className={cn(
              "@container flex flex-col gap-2",
              height === "fill" && "flex-1",
            )}
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
                  <TabsTrigger value="todos">Todos</TabsTrigger>
                  <TabsTrigger value="seleccionados">
                    Seleccionados
                    <span className="sr-only">, </span>
                    <Badge variant="secondary">{selected.length}</Badge>
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div
              className={cn(
                "overflow-y-auto",
                height === "fill" ? "min-h-64 flex-1 basis-0" : "max-h-80",
              )}
            >
              {rows.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {tab === "seleccionados" && query.length === 0
                    ? emptySelectionMessage
                    : "Sin resultados."}
                </p>
              ) : null}
              <div className="grid gap-1 @lg:grid-cols-2 @3xl:grid-cols-3">
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
    <div
      data-slot="checklist-row"
      className={cn(
        "flex min-h-10 w-full items-center rounded-md px-3",
        !disabled && "hover:bg-muted/60",
        checked && "bg-primary/5",
      )}
    >
      <Label
        className={cn(
          "flex flex-1 items-center gap-3 self-stretch font-normal",
          !disabled && "cursor-pointer",
        )}
      >
        <span className="flex-1">{option.label}</span>
        <Checkbox
          checked={checked}
          disabled={disabled}
          onCheckedChange={onToggle}
        />
      </Label>
    </div>
  );
}

export { ChecklistField };

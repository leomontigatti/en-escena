import { ListFilter, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox";

import { FilterValueCombobox } from "./filter-value-combobox";
import {
  getAppliedFilters,
  setFilterValue,
  type FilterFieldDefinition,
  type FilterValues,
} from "./filter-schema";

/**
 * Prototype B — one `Añadir filtro` entry point over a single searchable list of
 * every field/option pair, with applied filters as editable chips beside it.
 *
 * The list is flat on purpose rather than a field menu that drills into values:
 * typing `mayo` reaches the day and typing `jazz` reaches the modality without
 * the user having to know which field holds what. Height is bounded by the
 * popup, and search — not scrolling — is how a long field like `Categoría` is
 * crossed, so the control does not grow as filters are added.
 */

type CommandPrototypeProps = {
  fields: FilterFieldDefinition[];
  values: FilterValues;
  onValuesChange: (nextValues: FilterValues) => void;
};

type FilterEntry = {
  fieldId: string;
  fieldLabel: string;
  optionLabel: string;
  value: string;
};

const entrySeparator = ":";

export function CommandPrototype({
  fields,
  values,
  onValuesChange,
}: CommandPrototypeProps) {
  const appliedFilters = getAppliedFilters(fields, values);
  const hasAppliedFilters = appliedFilters.length > 0;
  const entries = buildFilterEntries(fields);
  const entryKeys = entries.map(getEntryKey);
  const entryByKey = new Map(
    entries.map((entry) => [getEntryKey(entry), entry] as const),
  );
  const fieldById = new Map(fields.map((field) => [field.id, field] as const));

  function getEntryLabel(entryKey: string) {
    const entry = entryByKey.get(entryKey);

    return entry ? `${entry.fieldLabel} · ${entry.optionLabel}` : entryKey;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {appliedFilters.map((appliedFilter) => {
        const field = fieldById.get(appliedFilter.fieldId);

        if (!field) {
          return null;
        }

        return (
          <div
            key={appliedFilter.fieldId}
            className="flex items-center rounded-md border border-primary/40 bg-primary/5"
          >
            <FilterValueCombobox
              field={field}
              value={appliedFilter.value}
              onValueChange={(nextValue) => {
                onValuesChange(
                  setFilterValue(values, field.id, nextValue || null),
                );
              }}
              trigger={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="pr-1.5 font-normal"
                >
                  <span className="text-muted-foreground">
                    {appliedFilter.fieldLabel}
                  </span>
                  <span className="font-medium">
                    {appliedFilter.optionLabel}
                  </span>
                </Button>
              }
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="mr-1"
              onClick={() => {
                onValuesChange(setFilterValue(values, field.id, null));
              }}
            >
              <X data-icon />
              <span className="sr-only">
                {`Quitar el filtro ${appliedFilter.fieldLabel}`}
              </span>
            </Button>
          </div>
        );
      })}
      <Combobox
        items={entryKeys}
        itemToStringLabel={getEntryLabel}
        itemToStringValue={getEntryLabel}
        value=""
        onValueChange={(nextValue) => {
          if (typeof nextValue !== "string" || nextValue.length === 0) {
            return;
          }

          const entry = entryByKey.get(nextValue);

          if (entry) {
            onValuesChange(setFilterValue(values, entry.fieldId, entry.value));
          }
        }}
      >
        <ComboboxTrigger
          showChevron={false}
          render={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-dashed font-normal"
            >
              <ListFilter data-icon="inline-start" />
              {hasAppliedFilters ? "Añadir filtro" : "Filtrar"}
            </Button>
          }
        />
        <ComboboxContent className="w-72">
          <ComboboxInput placeholder="Buscar filtro" showTrigger={false} />
          <ComboboxEmpty>Sin resultados.</ComboboxEmpty>
          <ComboboxList className="max-h-72">
            {(entryKey: string) => (
              <ComboboxItem key={entryKey} value={entryKey}>
                {getEntryLabel(entryKey)}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      {hasAppliedFilters ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onValuesChange(createClearedValues(fields))}
        >
          Limpiar
        </Button>
      ) : null}
    </div>
  );
}

function buildFilterEntries(fields: FilterFieldDefinition[]): FilterEntry[] {
  return fields.flatMap((field) =>
    field.options.map((option) => ({
      fieldId: field.id,
      fieldLabel: field.label,
      optionLabel: option.label,
      value: option.value,
    })),
  );
}

function getEntryKey(entry: FilterEntry) {
  return `${entry.fieldId}${entrySeparator}${entry.value}`;
}

function createClearedValues(fields: FilterFieldDefinition[]): FilterValues {
  return Object.fromEntries(fields.map((field) => [field.id, null]));
}

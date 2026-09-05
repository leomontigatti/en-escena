import { ChevronDown, ListFilter } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, FieldGroup } from "@/components/ui/field";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

import { FilterValueCombobox } from "./filter-value-combobox";
import {
  getAppliedFilters,
  setFilterValue,
  type FilterFieldDefinition,
  type FilterValues,
} from "./filter-schema";

/**
 * Prototype C — the current single trigger, but what it opens is a side panel
 * with one labelled row per field instead of every option stacked.
 *
 * The panel scrolls by design rather than by accident, and it is the only one of
 * the three that needs no separate small-screen layout: the same sheet is the
 * mobile answer. The cost is that filtering is modal — the list is covered while
 * choosing, and the applied state is a count badge until the sheet is opened.
 */

type SheetPrototypeProps = {
  fields: FilterFieldDefinition[];
  values: FilterValues;
  onValuesChange: (nextValues: FilterValues) => void;
};

export function SheetPrototype({
  fields,
  values,
  onValuesChange,
}: SheetPrototypeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const appliedFilters = getAppliedFilters(fields, values);
  const hasAppliedFilters = appliedFilters.length > 0;

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="relative">
          <ListFilter data-icon="inline-start" />
          Filtros
          {hasAppliedFilters ? (
            <Badge
              variant="secondary"
              className="pointer-events-none ml-1 min-w-5 justify-center px-1"
            >
              {appliedFilters.length}
            </Badge>
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="gap-0">
        <SheetHeader>
          <SheetTitle>Filtros</SheetTitle>
          <SheetDescription>
            Acotá el listado de coreografías del evento activo.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4">
          <FieldGroup>
            {fields.map((field) => {
              const value = values[field.id] ?? null;
              const selectedOption = field.options.find(
                (option) => option.value === value,
              );

              return (
                <Field key={field.id}>
                  <FieldLabel>{field.label}</FieldLabel>
                  <FilterValueCombobox
                    field={field}
                    value={value}
                    onValueChange={(nextValue) => {
                      onValuesChange(
                        setFilterValue(values, field.id, nextValue || null),
                      );
                    }}
                    trigger={
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full justify-between font-normal"
                      >
                        {selectedOption ? (
                          selectedOption.label
                        ) : (
                          <span className="text-muted-foreground">Todas</span>
                        )}
                        <ChevronDown data-icon="inline-end" />
                      </Button>
                    }
                  />
                </Field>
              );
            })}
          </FieldGroup>
        </div>
        <SheetFooter>
          <Button
            type="button"
            variant="outline"
            disabled={!hasAppliedFilters}
            onClick={() => onValuesChange(createClearedValues(fields))}
          >
            Limpiar filtros
          </Button>
          <Button type="button" onClick={() => setIsOpen(false)}>
            Ver resultados
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function createClearedValues(fields: FilterFieldDefinition[]): FilterValues {
  return Object.fromEntries(fields.map((field) => [field.id, null]));
}

import { z } from "zod";

/**
 * Prototype of the schema-driven filter contract, following the idea ReUI's
 * filters build on: one field definition list is the single source for parsing,
 * validating, serializing and rendering a filter set.
 *
 * The choreographies list currently spells the same filter out in seven places
 * (`readChoreographyFilters`, `buildChoreographyFacets`,
 * `normalizeChoreographyFilters`, `matchesChoreographyFilters`,
 * `buildCanonicalChoreographiesSearch`, plus three builders in the view). Adding
 * one filter means editing all seven, and forgetting the canonical builder makes
 * the filter silently do nothing, because the loader redirects the param away.
 */

export type FilterOption = {
  label: string;
  value: string;
};

export type FilterFieldDefinition = {
  /**
   * The URL search param name, so it is Spanish like the rest of the address:
   * `?dia=2026-05-01`.
   */
  id: string;
  label: string;
  options: FilterOption[];
};

export type FilterValues = Record<string, string | null>;

export type AppliedFilter = {
  fieldId: string;
  fieldLabel: string;
  optionLabel: string;
  value: string;
};

/**
 * A value survives only when it is one of the field's own options. `.catch`
 * covers both an absent param and one naming an option that no longer exists —
 * the case `keepKnownFacetValue` handles today — so an event that drops a
 * category cannot leave a list filtered by something unselectable.
 */
function createFieldSchema(options: FilterOption[]) {
  const optionValues = options.map((option) => option.value);

  return z
    .string()
    .transform((value) => value.trim())
    .refine((value) => optionValues.includes(value))
    .nullable()
    .catch(null);
}

function createFilterSchema(fields: FilterFieldDefinition[]) {
  return z.object(
    Object.fromEntries(
      fields.map((field) => [field.id, createFieldSchema(field.options)]),
    ),
  );
}

export function parseFilterValues(
  fields: FilterFieldDefinition[],
  searchParams: URLSearchParams,
): FilterValues {
  const schema = createFilterSchema(fields);
  const rawValues = Object.fromEntries(
    fields.map((field) => [field.id, searchParams.get(field.id)]),
  );

  return schema.parse(rawValues) as FilterValues;
}

export function createEmptyFilterValues(
  fields: FilterFieldDefinition[],
): FilterValues {
  return Object.fromEntries(fields.map((field) => [field.id, null]));
}

/**
 * The canonical search string for a filter set: applied filters in field order,
 * everything else dropped, and the page reset because a narrower list has fewer
 * pages. This is the one place a new filter has to reach today and the easiest
 * to forget.
 */
export function buildFilterSearch(
  fields: FilterFieldDefinition[],
  values: FilterValues,
  currentSearch = "",
) {
  const searchParams = new URLSearchParams(currentSearch);

  for (const field of fields) {
    const value = values[field.id];

    if (value) {
      searchParams.set(field.id, value);
    } else {
      searchParams.delete(field.id);
    }
  }

  searchParams.delete("pagina");

  return searchParams.toString();
}

export function getAppliedFilters(
  fields: FilterFieldDefinition[],
  values: FilterValues,
): AppliedFilter[] {
  return fields.flatMap((field) => {
    const value = values[field.id];

    if (!value) {
      return [];
    }

    const option = field.options.find(
      (fieldOption) => fieldOption.value === value,
    );

    if (!option) {
      return [];
    }

    return [
      {
        fieldId: field.id,
        fieldLabel: field.label,
        optionLabel: option.label,
        value,
      },
    ];
  });
}

export function setFilterValue(
  values: FilterValues,
  fieldId: string,
  nextValue: string | null,
): FilterValues {
  return {
    ...values,
    [fieldId]: values[fieldId] === nextValue ? null : nextValue,
  };
}

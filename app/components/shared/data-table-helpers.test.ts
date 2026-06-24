import { describe, expect, test } from "vitest";

import {
  createColumnFilters,
  getActiveFacetedFilterValues,
  getFacetedFilterSummary,
  getPaginationPages,
  getVisibleFacetedFilterValue,
  getServerSortDirection,
  mergeBaseFacetedFilterValues,
  mergeServerFilterValues,
  toggleFacetedFilterValue,
} from "@/components/shared/data-table-helpers";
import type { DataTableFacetedFilter } from "@/components/shared/data-table.shared";

describe("data-table helpers", () => {
  const statusFilter: DataTableFacetedFilter = {
    columnId: "status",
    label: "Filtros",
    groups: [
      {
        id: "estado",
        label: "Estado",
        options: [
          { label: "Activos", value: "active" },
          { label: "Archivados", value: "archived" },
        ],
      },
      {
        label: "Sede",
        options: [{ label: "Norte", value: "north" }],
      },
    ],
  };

  test("builds compact pagination ranges with ellipses around the current page", () => {
    expect(getPaginationPages(10, 5)).toEqual([
      1,
      "ellipsis",
      4,
      5,
      6,
      "ellipsis",
      10,
    ]);
  });

  test("merges base faceted values into the selected filter state", () => {
    expect(
      mergeBaseFacetedFilterValues(
        {
          status: {
            estado: "active",
          },
        },
        {
          status: {
            sede: "north",
          },
        },
      ),
    ).toEqual({
      status: {
        estado: "active",
        sede: "north",
      },
    });

    expect(
      createColumnFilters({
        status: {
          estado: "active",
          sede: "north",
        },
      }),
    ).toEqual([
      {
        id: "status",
        value: {
          estado: "active",
          sede: "north",
        },
      },
    ]);
  });

  test("hides base faceted values from the visible selected state", () => {
    expect(
      getVisibleFacetedFilterValue(
        {
          estado: "active",
        },
        {
          estado: "active",
          sede: "north",
        },
      ),
    ).toEqual({
      sede: "north",
    });

    expect(getActiveFacetedFilterValues({ estado: "", sede: "north" })).toEqual(
      ["north"],
    );
  });

  test("toggles one faceted filter group without mutating other groups", () => {
    expect(
      toggleFacetedFilterValue(
        {
          estado: "active",
          sede: "north",
        },
        "estado",
        "active",
      ),
    ).toEqual({
      sede: "north",
    });

    expect(
      toggleFacetedFilterValue(
        {
          estado: "active",
        },
        "sede",
        "north",
      ),
    ).toEqual({
      estado: "active",
      sede: "north",
    });
  });

  test("summarizes only active faceted filter labels", () => {
    expect(
      getFacetedFilterSummary(statusFilter, {
        estado: "archived",
        Sede: "north",
      }),
    ).toBe("Estado: Archivados, Sede: Norte");
  });

  test("replaces only the targeted server-side filter entry", () => {
    expect(
      mergeServerFilterValues(
        [
          { id: "status", value: { estado: "active" } },
          { id: "academy", value: { sede: "north" } },
        ],
        "status",
        { estado: "archived" },
      ),
    ).toEqual([
      { id: "academy", value: { sede: "north" } },
      { id: "status", value: { estado: "archived" } },
    ]);
  });

  test("resolves server sort direction only for the active column", () => {
    expect(getServerSortDirection({ id: "name", desc: true }, "name")).toBe(
      "desc",
    );
    expect(getServerSortDirection({ id: "name", desc: true }, "academy")).toBe(
      false,
    );
  });
});

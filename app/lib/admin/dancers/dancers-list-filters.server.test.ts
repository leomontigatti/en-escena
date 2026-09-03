import { describe, expect, test } from "vitest";

import { readDancerFilters } from "@/lib/admin/dancers/dancers-list-filters.server";

describe("readDancerFilters", () => {
  test("reads participation from `participando` and status from `estado`", () => {
    expect(
      readDancerFilters(new URLSearchParams("participando=no&estado=todos")),
    ).toMatchObject({ participation: "no", status: "all" });
  });

  test("ignores participation values inside `estado`", () => {
    expect(
      readDancerFilters(new URLSearchParams("estado=participando")),
    ).toMatchObject({ participation: "all", status: "active" });

    expect(
      readDancerFilters(new URLSearchParams("estado=no-participando")),
    ).toMatchObject({ participation: "all", status: "active" });
  });

  test("keeps `estado=archivados` as an archived status filter", () => {
    expect(
      readDancerFilters(new URLSearchParams("estado=archivados")),
    ).toMatchObject({ participation: "all", status: "archived" });
  });

  test("combines `estado=archivados` with an explicit participation", () => {
    expect(
      readDancerFilters(
        new URLSearchParams("estado=archivados&participando=si"),
      ),
    ).toMatchObject({ participation: "yes", status: "archived" });
  });

  test("reads the identification facet from 'identificacion'", () => {
    expect(
      readDancerFilters(
        new URLSearchParams("identificacion=sin-verificar&participando=si"),
      ),
    ).toMatchObject({
      identification: "unverified",
      participation: "yes",
      status: "active",
    });
  });

  test("reads `participando=todos` as no participation filter", () => {
    expect(
      readDancerFilters(new URLSearchParams("participando=todos")),
    ).toMatchObject({ participation: "all" });
  });
});

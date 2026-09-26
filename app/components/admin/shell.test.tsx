import { describe, expect, test } from "vitest";

import {
  getAdminBreadcrumbItems,
  getAdminShellOptions,
} from "@/components/admin/shell";

type AdminBreadcrumbTestMatch = Parameters<
  typeof getAdminBreadcrumbItems
>[0][number];

describe("admin shell route handles", () => {
  test("collects static and dynamic breadcrumbs from route handles", () => {
    const breadcrumbItems = getAdminBreadcrumbItems([
      { params: {} },
      {
        params: {},
        handle: {
          adminBreadcrumbs: [
            { label: "Profesores", to: "/administracion/profesores" },
          ],
        },
      },
      {
        params: {},
        data: {
          professor: { firstName: "Ana", lastName: "Pérez" },
        },
        handle: {
          adminBreadcrumbs: [
            (match: AdminBreadcrumbTestMatch) => {
              const data = match.data as
                | { professor?: { firstName: string; lastName: string } }
                | undefined;

              return data?.professor
                ? {
                    label: `${data.professor.firstName} ${data.professor.lastName}`,
                  }
                : null;
            },
          ],
        },
      },
    ]);

    expect(breadcrumbItems).toEqual([
      { label: "Profesores", to: "/administracion/profesores" },
      { label: "Ana Pérez" },
    ]);
  });

  test("merges shell options from deeper route matches", () => {
    const shellOptions = getAdminShellOptions([
      { params: {}, handle: { adminShell: { showEventSelector: true } } },
      { params: {}, handle: { adminShell: { showEventSelector: false } } },
    ]);

    expect(shellOptions).toEqual({ showEventSelector: false });
  });
});

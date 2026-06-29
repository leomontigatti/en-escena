import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";

const codebaseMapPath = path.resolve("docs/agents/codebase-map.md");
const adminComponentsDirectory = path.resolve("app/components/admin");

describe("admin migration audit", () => {
  test("documents the stable admin entry points in the codebase map", () => {
    const codebaseMap = readFileSync(codebaseMapPath, "utf8");

    expect(codebaseMap).toContain("## Admin Shell And Dashboard");
    expect(codebaseMap).toContain("app/routes/administracion.tsx");
    expect(codebaseMap).toContain("app/routes/administracion._index.tsx");
    expect(codebaseMap).toContain("## Admin Users");
    expect(codebaseMap).toContain("app/features/admin/users/");
    expect(codebaseMap).toContain("## Admin Choreographies");
    expect(codebaseMap).toContain("## Admin Events And Bases Del Evento");
    expect(codebaseMap).toContain("app/features/admin/events/list/");
    expect(codebaseMap).toContain("app/features/admin/event-modalities/");
    expect(codebaseMap).toContain("app/features/admin/event-categories/");
    expect(codebaseMap).toContain("app/features/admin/event-schedules/");
    expect(codebaseMap).toContain("app/features/admin/event-prices/");
    expect(codebaseMap).not.toContain(
      "## Admin Migration To app/features/admin",
    );
  });

  test("keeps migrated admin route adapters owned by admin feature modules", () => {
    for (const route of migratedAdminRouteAudits) {
      expectRouteAdapterDelegatesToFeature(route);
    }
  });

  test("keeps app/components/admin at the audited structure used by the migration", () => {
    expect(listFiles(adminComponentsDirectory)).toEqual(
      expectedAdminComponentFiles,
    );
  });
});

type MigratedAdminRouteAudit = {
  featureImportPrefix: string;
  filePath: string;
  routeFile: string;
};

const migratedAdminRouteAudits = [
  migratedAdminRoute(
    "administracion.bailarines.tsx",
    "@/features/admin/dancers/",
  ),
  migratedAdminRoute(
    "administracion.bailarines_.$dancerId.tsx",
    "@/features/admin/dancers/",
  ),
  migratedAdminRoute(
    "administracion.categorias.tsx",
    "@/features/admin/event-categories/",
  ),
  migratedAdminRoute(
    "administracion.categorias_.nueva.tsx",
    "@/features/admin/event-categories/",
  ),
  migratedAdminRoute(
    "administracion.categorias_.$categoryId.tsx",
    "@/features/admin/event-categories/",
  ),
  migratedAdminRoute(
    "administracion.coreografias.tsx",
    "@/features/admin/choreographies/",
  ),
  migratedAdminRoute(
    "administracion.cronogramas.tsx",
    "@/features/admin/event-schedules/",
  ),
  migratedAdminRoute(
    "administracion.cronogramas_.nuevo.tsx",
    "@/features/admin/event-schedules/",
  ),
  migratedAdminRoute(
    "administracion.cronogramas_.$scheduleId.tsx",
    "@/features/admin/event-schedules/",
  ),
  migratedAdminRoute("administracion.eventos.tsx", "@/features/admin/events/"),
  migratedAdminRoute(
    "administracion.eventos_.nuevo.tsx",
    "@/features/admin/events/",
  ),
  migratedAdminRoute(
    "administracion.eventos_.$eventId.tsx",
    "@/features/admin/events/",
  ),
  migratedAdminRoute(
    "administracion.modalidades.tsx",
    "@/features/admin/event-modalities/",
  ),
  migratedAdminRoute(
    "administracion.modalidades_.nueva.tsx",
    "@/features/admin/event-modalities/",
  ),
  migratedAdminRoute(
    "administracion.modalidades_.$modalityId.tsx",
    "@/features/admin/event-modalities/",
  ),
  migratedAdminRoute(
    "administracion.precios.tsx",
    "@/features/admin/event-prices/",
  ),
  migratedAdminRoute(
    "administracion.precios_.nuevo.tsx",
    "@/features/admin/event-prices/",
  ),
  migratedAdminRoute(
    "administracion.precios_.$priceId.tsx",
    "@/features/admin/event-prices/",
  ),
  migratedAdminRoute(
    "administracion.profesores.tsx",
    "@/features/admin/professors/",
  ),
  migratedAdminRoute(
    "administracion.profesores_.$professorId.tsx",
    "@/features/admin/professors/",
  ),
  migratedAdminRoute("administracion.usuarios.tsx", "@/features/admin/users/"),
  migratedAdminRoute(
    "administracion.usuarios_.nuevo.tsx",
    "@/features/admin/users/",
  ),
  migratedAdminRoute(
    "administracion.usuarios_.$userId.tsx",
    "@/features/admin/users/",
  ),
  migratedAdminRoute(
    "administracion.usuarios_.invitaciones.tsx",
    "@/features/admin/users/",
  ),
] as const;

const expectedAdminComponentFiles = [
  "events/event-categories.tsx",
  "events/event-modalities.tsx",
  "events/event-prices.test.tsx",
  "events/event-prices.tsx",
  "events/event-prices/actions.tsx",
  "events/event-prices/deposit-percentage-form.tsx",
  "events/event-prices/form.tsx",
  "events/event-prices/list-table.tsx",
  "events/event-prices/route-views.tsx",
  "events/event-prices/shared.ts",
  "events/event-schedules.tsx",
  "events/event-schedules/dialogs.tsx",
  "events/event-schedules/form.tsx",
  "events/event-schedules/list-table.tsx",
  "events/event-schedules/route-views.tsx",
  "events/event-schedules/shared.ts",
  "events/event-schedules/submitted-values.ts",
  "events/form.tsx",
  "resource-layout.test.tsx",
  "resource-layout.tsx",
  "shell.test.tsx",
  "shell.tsx",
];

function migratedAdminRoute(
  routeFile: string,
  featureImportPrefix: string,
): MigratedAdminRouteAudit {
  return {
    featureImportPrefix,
    filePath: path.resolve("app/routes", routeFile),
    routeFile,
  };
}

function expectRouteAdapterDelegatesToFeature(route: MigratedAdminRouteAudit) {
  const runtimeSource = stripTypeOnlyImports(
    readFileSync(route.filePath, "utf8"),
  );

  expect(
    runtimeSource,
    `${route.routeFile} should import runtime collaborators from ${route.featureImportPrefix}`,
  ).toContain(route.featureImportPrefix);

  expect(
    runtimeSource,
    `${route.routeFile} should not own admin runtime logic in app/lib/admin`,
  ).not.toContain("@/lib/admin/");
}

function stripTypeOnlyImports(source: string) {
  return source.replace(/^import type[\s\S]*?;\n/gm, "");
}

function listFiles(directoryPath: string, relativePrefix = ""): string[] {
  return readdirSync(directoryPath, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = path.join(directoryPath, entry.name);
      const relativePath = path.join(relativePrefix, entry.name);

      if (entry.isDirectory()) {
        return listFiles(entryPath, relativePath);
      }

      return [relativePath];
    })
    .sort();
}

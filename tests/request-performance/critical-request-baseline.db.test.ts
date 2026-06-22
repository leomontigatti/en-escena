import { describe, expect, test } from "vitest";

import {
  measureCriticalRequestBaseline,
  type PhaseTiming,
} from "./critical-request-baseline";
import { installDatabaseTestHooks } from "../db/harness";

installDatabaseTestHooks();

describe.sequential("critical request performance baseline", () => {
  test("measures the critical admin and portal loaders/actions by phase", async () => {
    const results = await measureCriticalRequestBaseline();

    expect(results.map((result) => result.id)).toEqual(
      expect.arrayContaining([
        "administracion-layout-loader",
        "administracion-eventos-loader",
        "administracion-eventos-create-action",
        "administracion-eventos-detail-loader",
        "administracion-eventos-update-action",
        "administracion-bases-loader",
        "administracion-bases-create-modality-action",
        "administracion-bailarines-loader",
        "administracion-profesores-loader",
        "portal-layout-loader",
        "portal-bailarines-loader",
        "portal-bailarines-create-action",
        "portal-bailarin-detail-loader",
        "portal-bailarin-update-action",
        "portal-profesores-loader",
        "portal-profesores-create-action",
        "portal-profesor-detail-loader",
        "portal-profesor-update-action",
        "portal-coreografias-loader",
        "portal-coreografias-create-options-loader",
        "portal-coreografias-create-action",
        "portal-coreografia-detail-loader",
        "portal-coreografia-update-action",
        "portal-perfil-loader",
        "portal-perfil-update-action",
      ]),
    );

    expect(results).toHaveLength(25);

    for (const result of results) {
      expect(result.requestMs).toBeGreaterThan(0);
      expect(result.roundTripMs).toBeGreaterThanOrEqual(result.requestMs);
      expectValidPhaseTimings(result.phases);
    }

    for (const result of results.filter((entry) => entry.kind === "action")) {
      expect(result.phases.actionMs).toBeGreaterThan(0);
      expect(result.phases.revalidationMs).toBeGreaterThanOrEqual(0);
    }
  });
});

function expectValidPhaseTimings(phases: PhaseTiming) {
  expect(phases.authSessionMs).toBeGreaterThanOrEqual(0);
  expect(phases.eventContextMs).toBeGreaterThanOrEqual(0);
  expect(phases.mainQueryMs).toBeGreaterThanOrEqual(0);
  expect(phases.readinessConfigurationMs).toBeGreaterThanOrEqual(0);
  expect(phases.actionMs).toBeGreaterThanOrEqual(0);
  expect(phases.revalidationMs).toBeGreaterThanOrEqual(0);
}

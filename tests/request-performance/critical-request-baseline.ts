import { vi } from "vitest";

import { db } from "@/db";
import * as adminEventContextModule from "@/lib/admin/event-context.server";
import * as adminDancersModule from "@/lib/admin/dancers/dancers.server";
import * as adminProfessorsModule from "@/lib/admin/professors/professors.server";
import * as adminEventModalitiesActionModule from "@/features/admin/modalities/action.server";
import * as internalAccessModule from "@/lib/auth/internal-access.server";
import * as internalNavigationModule from "@/lib/auth/internal-navigation.server";
import * as eventsManagementModule from "@/lib/events/management.server";
import * as eventBasesModule from "@/lib/events/bases.server";
import * as eventReadinessModule from "@/lib/events/registration-readiness.server";
import * as portalChoreographiesModule from "@/lib/portal/choreographies.server";
import * as portalChoreographyMusicModule from "@/lib/portal/choreography-music.server";
import * as portalDancersModule from "@/lib/portal/dancers.server";
import * as portalEventContextModule from "@/lib/portal/event-context.server";
import * as portalProfessorsModule from "@/lib/portal/professors.server";
import * as portalProfileModule from "@/features/portal/profile/academy-profile.server";
import * as choreographyRegistrationModule from "@/lib/choreographies/registration-confirmation.server";
import { loader as adminLayoutLoader } from "@/routes/administracion";
import { loader as adminDancersLoader } from "@/routes/administracion.bailarines";
import { loader as adminModalitiesLoader } from "@/routes/administracion.modalidades";
import { action as adminModalityCreateAction } from "@/routes/administracion.modalidades_.nueva";
import { loader as adminEventosLoader } from "@/routes/administracion.eventos";
import {
  action as adminEventoDetailAction,
  loader as adminEventoDetailLoader,
} from "@/routes/administracion.eventos_.$eventId";
import { action as adminEventoCreateAction } from "@/routes/administracion.eventos_.nuevo";
import { loader as adminProfessorsLoader } from "@/routes/administracion.profesores";
import { loader as portalLayoutLoader } from "@/routes/portal";
import {
  action as portalBailarinAction,
  loader as portalBailarinLoader,
} from "@/routes/portal.bailarines";
import {
  action as portalBailarinDetailAction,
  loader as portalBailarinDetailLoader,
} from "@/routes/portal.bailarines_.$dancerId";
import {
  action as portalCoreografiaAction,
  loader as portalCoreografiaLoader,
} from "@/routes/portal.coreografias";
import { loader as portalCoreografiaCreateOptionsLoader } from "@/routes/portal.coreografias_.crear";
import {
  action as portalCoreografiaDetailAction,
  loader as portalCoreografiaDetailLoader,
} from "@/routes/portal.coreografias_.$choreographyId";
import {
  action as portalPerfilAction,
  loader as portalPerfilLoader,
} from "@/routes/portal.perfil";
import {
  action as portalProfesorAction,
  loader as portalProfesorLoader,
} from "@/routes/portal.profesores";
import {
  action as portalProfesorDetailAction,
  loader as portalProfesorDetailLoader,
} from "@/routes/portal.profesores_.$professorId";
import {
  adminDetailArgs,
  adminEventFormData,
  adminLoaderArgs,
  choreographyCreateFormData,
  choreographyMusicUpdateFormData,
  portalLayoutArgs,
  seedBaselineFixture,
  stringFormData,
} from "./critical-request-baseline-fixture";

export type PhaseTiming = {
  authSessionMs: number;
  eventContextMs: number;
  mainQueryMs: number;
  readinessConfigurationMs: number;
  actionMs: number;
  revalidationMs: number;
};

export type CriticalRequestBaselineResult = {
  id: string;
  kind: "loader" | "action";
  route: string;
  surface: "administracion" | "portal";
  requestMs: number;
  roundTripMs: number;
  phases: PhaseTiming;
};

type TimedSpyRegistration = (phases: PhaseTiming) => void;
type AsyncMethod = (...args: unknown[]) => unknown;
type SpyWithMockImplementation = {
  mockImplementation: (
    implementation: (this: unknown, ...callArgs: unknown[]) => unknown,
  ) => void;
};

export async function measureCriticalRequestBaseline(): Promise<
  CriticalRequestBaselineResult[]
> {
  const fixture = await seedBaselineFixture();

  const results = [
    await measureScenario({
      id: "administracion-layout-loader",
      kind: "loader",
      route: "/administracion",
      surface: "administracion",
      setupSpies: [
        trackAsync(
          internalNavigationModule,
          "requireAdminPanelUser",
          "authSessionMs",
        ),
        trackAsync(
          adminEventContextModule,
          "loadAdminEventContext",
          "eventContextMs",
        ),
      ],
      run: () =>
        adminLayoutLoader(
          adminLoaderArgs(fixture.adminRequest("/administracion")),
        ),
    }),
    await measureScenario({
      id: "administracion-eventos-loader",
      kind: "loader",
      route: "/administracion/eventos",
      surface: "administracion",
      setupSpies: [
        trackAsync(
          internalNavigationModule,
          "requireAdminPanelUser",
          "authSessionMs",
        ),
        trackAsync(db.query.events, "findMany", "mainQueryMs"),
        trackAsync(
          eventReadinessModule,
          "getEventRegistrationReadinessByEventId",
          "readinessConfigurationMs",
        ),
      ],
      run: () =>
        adminEventosLoader(
          adminLoaderArgs(fixture.adminRequest("/administracion/eventos")),
        ),
    }),
    await measureScenario({
      id: "administracion-eventos-create-action",
      kind: "action",
      route: "/administracion/eventos/nuevo",
      surface: "administracion",
      setupSpies: [
        trackAsync(
          internalNavigationModule,
          "requireAdminPanelUser",
          "authSessionMs",
        ),
        trackAsync(eventsManagementModule, "createEvent", "actionMs"),
      ],
      run: () =>
        adminEventoCreateAction(
          adminLoaderArgs(
            fixture.adminRequest(
              "/administracion/eventos/nuevo",
              adminEventFormData({
                name: "Evento Medición",
                registrationStartsAt: "2027-03-01",
                registrationEndsAt: "2027-04-30",
                startsAt: "2027-05-01",
                endsAt: "2027-05-03",
                requiredDepositPercentage: "35",
              }),
            ),
          ),
        ),
      runRevalidation: async (result) => {
        const response = expectResponse(result);
        const eventId = response.headers
          .get("location")
          ?.match(/\/administracion\/eventos\/([^?]+)/)?.[1];

        if (!eventId) {
          throw new Error("Expected event creation redirect with an event id.");
        }

        await adminEventoDetailLoader(
          adminDetailArgs(
            fixture.adminRequest(
              `http://localhost/administracion/eventos/${eventId}`,
            ),
            eventId,
          ),
        );
      },
    }),
    await measureScenario({
      id: "administracion-eventos-detail-loader",
      kind: "loader",
      route: `/administracion/eventos/${fixture.activeEvent.id}`,
      surface: "administracion",
      setupSpies: [
        trackAsync(
          internalNavigationModule,
          "requireAdminPanelUser",
          "authSessionMs",
        ),
        trackAsync(db.query.events, "findFirst", "mainQueryMs"),
        trackAsync(
          eventReadinessModule,
          "getEventRegistrationReadiness",
          "readinessConfigurationMs",
        ),
      ],
      run: () =>
        adminEventoDetailLoader(
          adminDetailArgs(
            fixture.adminRequest(
              `http://localhost/administracion/eventos/${fixture.activeEvent.id}`,
            ),
            fixture.activeEvent.id,
          ),
        ),
    }),
    await measureScenario({
      id: "administracion-eventos-update-action",
      kind: "action",
      route: `/administracion/eventos/${fixture.activeEvent.id}`,
      surface: "administracion",
      setupSpies: [
        trackAsync(
          internalNavigationModule,
          "requireAdminPanelUser",
          "authSessionMs",
        ),
        trackAsync(eventsManagementModule, "updateEvent", "actionMs"),
      ],
      run: () =>
        adminEventoDetailAction(
          adminDetailArgs(
            fixture.adminRequest(
              `http://localhost/administracion/eventos/${fixture.activeEvent.id}`,
              adminEventFormData({
                intent: "update",
                name: "Evento Activo Ajustado",
                registrationStartsAt: "2026-03-01",
                registrationEndsAt: "2026-04-30",
                startsAt: "2026-05-01",
                endsAt: "2026-05-03",
                requiredDepositPercentage: "30",
              }),
            ),
            fixture.activeEvent.id,
          ),
        ),
      runRevalidation: async () => {
        await adminEventoDetailLoader(
          adminDetailArgs(
            fixture.adminRequest(
              `http://localhost/administracion/eventos/${fixture.activeEvent.id}`,
            ),
            fixture.activeEvent.id,
          ),
        );
      },
    }),
    await measureScenario({
      id: "administracion-bases-loader",
      kind: "loader",
      route: "/administracion/modalidades",
      surface: "administracion",
      setupSpies: [
        trackAsync(
          internalNavigationModule,
          "requireAdminPanelUser",
          "authSessionMs",
        ),
        trackAsync(
          adminEventContextModule,
          "loadAdminEventContext",
          "eventContextMs",
        ),
        trackAsync(
          eventBasesModule,
          "getChoreographyRegistrationInitialOptions",
          "readinessConfigurationMs",
        ),
      ],
      run: () =>
        adminModalitiesLoader(
          adminLoaderArgs(fixture.adminRequest("/administracion/modalidades")),
        ),
    }),
    await measureScenario({
      id: "administracion-bases-create-modality-action",
      kind: "action",
      route: "/administracion/modalidades/nueva",
      surface: "administracion",
      setupSpies: [
        trackAsync(
          internalNavigationModule,
          "requireAdminPanelUser",
          "authSessionMs",
        ),
        trackAsync(
          adminEventContextModule,
          "loadAdminEventContext",
          "eventContextMs",
        ),
        trackAsync(
          adminEventModalitiesActionModule,
          "handleEventModalityAction",
          "actionMs",
        ),
      ],
      run: () =>
        adminModalityCreateAction(
          adminLoaderArgs(
            fixture.adminRequest(
              "/administracion/modalidades/nueva",
              stringFormData({
                intent: "create-modality",
                name: "Medición modalidad",
              }),
            ),
          ),
        ),
      runRevalidation: async () => {
        await adminModalitiesLoader(
          adminLoaderArgs(fixture.adminRequest("/administracion/modalidades")),
        );
      },
    }),
    await measureScenario({
      id: "administracion-bailarines-loader",
      kind: "loader",
      route: "/administracion/bailarines",
      surface: "administracion",
      setupSpies: [
        trackAsync(
          internalAccessModule,
          "requireInternalUser",
          "authSessionMs",
        ),
        trackAsync(
          adminEventContextModule,
          "loadAdminEventContext",
          "eventContextMs",
        ),
        trackAsync(
          adminDancersModule,
          "listAdministrativeDancers",
          "mainQueryMs",
        ),
      ],
      run: () =>
        adminDancersLoader(
          adminLoaderArgs(fixture.adminRequest("/administracion/bailarines")),
        ),
    }),
    await measureScenario({
      id: "administracion-profesores-loader",
      kind: "loader",
      route: "/administracion/profesores",
      surface: "administracion",
      setupSpies: [
        trackAsync(
          internalAccessModule,
          "requireInternalUser",
          "authSessionMs",
        ),
        trackAsync(
          adminEventContextModule,
          "loadAdminEventContext",
          "eventContextMs",
        ),
        trackAsync(
          adminProfessorsModule,
          "listAdministrativeProfessors",
          "mainQueryMs",
        ),
      ],
      run: () =>
        adminProfessorsLoader(
          adminLoaderArgs(fixture.adminRequest("/administracion/profesores")),
        ),
    }),
    await measureScenario({
      id: "portal-layout-loader",
      kind: "loader",
      route: "/portal",
      surface: "portal",
      setupSpies: [
        trackAsync(internalAccessModule, "requireAcademyUser", "authSessionMs"),
        trackAsync(
          portalEventContextModule,
          "getPortalShellEventContext",
          "eventContextMs",
        ),
      ],
      run: () =>
        portalLayoutLoader(portalLayoutArgs(fixture.portalRequest("/portal"))),
    }),
    await measureScenario({
      id: "portal-bailarines-loader",
      kind: "loader",
      route: "/portal/bailarines",
      surface: "portal",
      setupSpies: [
        trackAsync(internalAccessModule, "requireAcademyUser", "authSessionMs"),
        trackAsync(
          portalEventContextModule,
          "getPortalActiveEventSummaryContext",
          "eventContextMs",
        ),
        trackAsync(portalDancersModule, "listDancersForAcademy", "mainQueryMs"),
      ],
      run: () =>
        portalBailarinLoader({
          request: fixture.portalRequest("/portal/bailarines"),
        }),
    }),
    await measureScenario({
      id: "portal-bailarines-create-action",
      kind: "action",
      route: "/portal/bailarines",
      surface: "portal",
      setupSpies: [
        trackAsync(internalAccessModule, "requireAcademyUser", "authSessionMs"),
        trackAsync(portalDancersModule, "createDancerForAcademy", "actionMs"),
      ],
      run: () =>
        portalBailarinAction({
          request: fixture.portalPostRequest(
            "/portal/bailarines",
            stringFormData({
              intent: "create-dancer",
              firstName: "Mora",
              lastName: "Lima",
              birthDate: "2013-02-02",
            }),
          ),
        }),
      runRevalidation: async () => {
        await portalBailarinLoader({
          request: fixture.portalRequest("/portal/bailarines"),
        });
      },
    }),
    await measureScenario({
      id: "portal-bailarin-detail-loader",
      kind: "loader",
      route: `/portal/bailarines/${fixture.dancer.id}`,
      surface: "portal",
      setupSpies: [
        trackAsync(internalAccessModule, "requireAcademyUser", "authSessionMs"),
        trackAsync(portalDancersModule, "findDancerForAcademy", "mainQueryMs"),
      ],
      run: () =>
        portalBailarinDetailLoader({
          request: fixture.portalRequest(
            `/portal/bailarines/${fixture.dancer.id}`,
          ),
          params: { dancerId: fixture.dancer.id },
        }),
    }),
    await measureScenario({
      id: "portal-bailarin-update-action",
      kind: "action",
      route: `/portal/bailarines/${fixture.dancer.id}`,
      surface: "portal",
      setupSpies: [
        trackAsync(internalAccessModule, "requireAcademyUser", "authSessionMs"),
        trackAsync(portalDancersModule, "updateDancerForAcademy", "actionMs"),
      ],
      run: () =>
        portalBailarinDetailAction({
          request: fixture.portalPostRequest(
            `/portal/bailarines/${fixture.dancer.id}`,
            stringFormData({
              intent: "update-dancer",
              firstName: "Ana María",
              lastName: "Paz",
              birthDate: "2012-01-10",
              documentType: "dni",
              documentNumber: "12345678",
              documentFrontImageStorageKey: "",
              documentBackImageStorageKey: "",
            }),
          ),
          params: { dancerId: fixture.dancer.id },
        }),
      runRevalidation: async () => {
        await portalBailarinDetailLoader({
          request: fixture.portalRequest(
            `/portal/bailarines/${fixture.dancer.id}`,
          ),
          params: { dancerId: fixture.dancer.id },
        });
      },
    }),
    await measureScenario({
      id: "portal-profesores-loader",
      kind: "loader",
      route: "/portal/profesores",
      surface: "portal",
      setupSpies: [
        trackAsync(internalAccessModule, "requireAcademyUser", "authSessionMs"),
        trackAsync(
          portalEventContextModule,
          "getPortalActiveEventSummaryContext",
          "eventContextMs",
        ),
        trackAsync(
          portalProfessorsModule,
          "listAcademyProfessors",
          "mainQueryMs",
        ),
      ],
      run: () =>
        portalProfesorLoader({
          request: fixture.portalRequest("/portal/profesores"),
        }),
    }),
    await measureScenario({
      id: "portal-profesores-create-action",
      kind: "action",
      route: "/portal/profesores",
      surface: "portal",
      setupSpies: [
        trackAsync(internalAccessModule, "requireAcademyUser", "authSessionMs"),
        trackAsync(
          portalProfessorsModule,
          "createAcademyProfessor",
          "actionMs",
        ),
      ],
      run: () =>
        portalProfesorAction({
          request: fixture.portalPostRequest(
            "/portal/profesores",
            stringFormData({
              intent: "create-professor",
              firstName: "Julia",
              lastName: "Sosa",
            }),
          ),
        }),
      runRevalidation: async () => {
        await portalProfesorLoader({
          request: fixture.portalRequest("/portal/profesores"),
        });
      },
    }),
    await measureScenario({
      id: "portal-profesor-detail-loader",
      kind: "loader",
      route: `/portal/profesores/${fixture.professor.id}`,
      surface: "portal",
      setupSpies: [
        trackAsync(internalAccessModule, "requireAcademyUser", "authSessionMs"),
        trackAsync(
          portalProfessorsModule,
          "findAcademyProfessor",
          "mainQueryMs",
        ),
      ],
      run: () =>
        portalProfesorDetailLoader({
          request: fixture.portalRequest(
            `/portal/profesores/${fixture.professor.id}`,
          ),
          params: { professorId: fixture.professor.id },
        }),
    }),
    await measureScenario({
      id: "portal-profesor-update-action",
      kind: "action",
      route: `/portal/profesores/${fixture.professor.id}`,
      surface: "portal",
      setupSpies: [
        trackAsync(internalAccessModule, "requireAcademyUser", "authSessionMs"),
        trackAsync(
          portalProfessorsModule,
          "updateAcademyProfessor",
          "actionMs",
        ),
      ],
      run: () =>
        portalProfesorDetailAction({
          request: fixture.portalPostRequest(
            `/portal/profesores/${fixture.professor.id}`,
            stringFormData({
              intent: "update-professor",
              firstName: "Luz Marina",
              lastName: "Suarez",
              documentType: "dni",
              documentNumber: "22333444",
            }),
          ),
          params: { professorId: fixture.professor.id },
        }),
      runRevalidation: async () => {
        await portalProfesorDetailLoader({
          request: fixture.portalRequest(
            `/portal/profesores/${fixture.professor.id}`,
          ),
          params: { professorId: fixture.professor.id },
        });
      },
    }),
    await measureScenario({
      id: "portal-coreografias-loader",
      kind: "loader",
      route: "/portal/coreografias",
      surface: "portal",
      setupSpies: [
        trackAsync(internalAccessModule, "requireAcademyUser", "authSessionMs"),
        trackAsync(
          portalEventContextModule,
          "getPortalActiveEventReadinessContext",
          "eventContextMs",
        ),
        trackAsync(
          portalChoreographiesModule,
          "listChoreographiesForAcademyEvent",
          "mainQueryMs",
        ),
        trackAsync(
          portalDancersModule,
          "countActiveDancersForAcademy",
          "mainQueryMs",
        ),
      ],
      run: () =>
        portalCoreografiaLoader({
          request: fixture.portalRequest("/portal/coreografias"),
        }),
    }),
    await measureScenario({
      id: "portal-coreografias-create-options-loader",
      kind: "loader",
      route: "/portal/coreografias/crear",
      surface: "portal",
      setupSpies: [
        trackAsync(internalAccessModule, "requireAcademyUser", "authSessionMs"),
        trackAsync(
          portalEventContextModule,
          "getPortalActiveEventReadinessContext",
          "eventContextMs",
        ),
        trackAsync(portalDancersModule, "listDancersForAcademy", "mainQueryMs"),
        trackAsync(
          portalProfessorsModule,
          "listAcademyProfessors",
          "mainQueryMs",
        ),
        trackAsync(
          eventBasesModule,
          "getEventBases",
          "readinessConfigurationMs",
        ),
      ],
      run: () =>
        portalCoreografiaCreateOptionsLoader({
          request: fixture.portalRequest("/portal/coreografias/crear"),
        }),
    }),
    await measureScenario({
      id: "portal-coreografias-create-action",
      kind: "action",
      route: "/portal/coreografias",
      surface: "portal",
      setupSpies: [
        trackAsync(internalAccessModule, "requireAcademyUser", "authSessionMs"),
        trackAsync(
          choreographyRegistrationModule,
          "createChoreographyRegistration",
          "actionMs",
        ),
      ],
      run: () =>
        portalCoreografiaAction({
          request: fixture.portalPostRequest(
            "/portal/coreografias",
            choreographyCreateFormData({
              eventId: fixture.activeEvent.id,
              name: "Nueva medición",
              modalityId: fixture.catalog.modality.id,
              submodalityId: fixture.catalog.submodality.id,
              dancerIds: [fixture.secondaryDancer.id],
              professorIds: [fixture.secondaryProfessor.id],
              experienceLevelId: fixture.catalog.level.id,
              scheduleCapacityId: fixture.catalog.scheduleCapacity.id,
            }),
          ),
        }),
      runRevalidation: async () => {
        await portalCoreografiaLoader({
          request: fixture.portalRequest("/portal/coreografias"),
        });
      },
    }),
    await measureScenario({
      id: "portal-coreografia-detail-loader",
      kind: "loader",
      route: `/portal/coreografias/${fixture.choreography.id}`,
      surface: "portal",
      setupSpies: [
        trackAsync(internalAccessModule, "requireAcademyUser", "authSessionMs"),
        trackAsync(
          portalEventContextModule,
          "getPortalActiveEventContext",
          "eventContextMs",
        ),
        trackAsync(
          portalChoreographiesModule,
          "findChoreographyForAcademyEvent",
          "mainQueryMs",
        ),
      ],
      run: () =>
        portalCoreografiaDetailLoader({
          request: fixture.portalRequest(
            `/portal/coreografias/${fixture.choreography.id}`,
          ),
          params: { choreographyId: fixture.choreography.id },
        }),
    }),
    await measureScenario({
      id: "portal-coreografia-update-action",
      kind: "action",
      route: `/portal/coreografias/${fixture.choreography.id}`,
      surface: "portal",
      setupSpies: [
        trackAsync(internalAccessModule, "requireAcademyUser", "authSessionMs"),
        trackAsync(
          portalEventContextModule,
          "getPortalActiveEventContext",
          "eventContextMs",
        ),
        trackAsync(
          portalChoreographyMusicModule,
          "updateChoreographyMusic",
          "actionMs",
        ),
      ],
      run: () =>
        portalCoreografiaDetailAction({
          request: fixture.portalPostRequest(
            `/portal/coreografias/${fixture.choreography.id}`,
            choreographyMusicUpdateFormData({
              musicStorageKey: fixture.choreography.musicStorageKey ?? "",
            }),
          ),
          params: { choreographyId: fixture.choreography.id },
        }),
      runRevalidation: async () => {
        await portalCoreografiaDetailLoader({
          request: fixture.portalRequest(
            `/portal/coreografias/${fixture.choreography.id}`,
          ),
          params: { choreographyId: fixture.choreography.id },
        });
      },
    }),
    await measureScenario({
      id: "portal-perfil-loader",
      kind: "loader",
      route: "/portal/perfil",
      surface: "portal",
      setupSpies: [
        trackAsync(internalAccessModule, "requireAcademyUser", "authSessionMs"),
      ],
      run: () =>
        portalPerfilLoader({
          request: fixture.portalRequest("/portal/perfil"),
        }),
    }),
    await measureScenario({
      id: "portal-perfil-update-action",
      kind: "action",
      route: "/portal/perfil",
      surface: "portal",
      setupSpies: [
        trackAsync(internalAccessModule, "requireAcademyUser", "authSessionMs"),
        trackAsync(portalProfileModule, "updateAcademyProfile", "actionMs"),
      ],
      run: () =>
        portalPerfilAction({
          request: fixture.portalPostRequest(
            "/portal/perfil",
            stringFormData({
              intent: "update-academy-profile",
              name: fixture.academy.academy.name,
              contactName: "Contacto Medición",
              phone: "1199988877",
            }),
          ),
        }),
      runRevalidation: async () => {
        await portalPerfilLoader({
          request: fixture.portalRequest("/portal/perfil"),
        });
      },
    }),
  ];

  if (process.env.REQUEST_PERFORMANCE_BASELINE_LOG === "1") {
    console.info(formatCriticalRequestBaseline(results));
  }

  return results;
}

function formatCriticalRequestBaseline(
  results: CriticalRequestBaselineResult[],
) {
  const lines = [
    "id | requestMs | roundTripMs | authSessionMs | eventContextMs | mainQueryMs | readinessConfigurationMs | actionMs | revalidationMs",
    "--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---:",
  ];

  for (const result of results) {
    lines.push(
      [
        result.id,
        result.requestMs.toFixed(2),
        result.roundTripMs.toFixed(2),
        result.phases.authSessionMs.toFixed(2),
        result.phases.eventContextMs.toFixed(2),
        result.phases.mainQueryMs.toFixed(2),
        result.phases.readinessConfigurationMs.toFixed(2),
        result.phases.actionMs.toFixed(2),
        result.phases.revalidationMs.toFixed(2),
      ].join(" | "),
    );
  }

  return lines.join("\n");
}

async function measureScenario({
  id,
  kind,
  route,
  surface,
  setupSpies,
  run,
  runRevalidation,
}: {
  id: string;
  kind: "loader" | "action";
  route: string;
  surface: "administracion" | "portal";
  setupSpies: TimedSpyRegistration[];
  run: () => Promise<unknown>;
  runRevalidation?: (result: unknown) => Promise<void>;
}): Promise<CriticalRequestBaselineResult> {
  const phases = createEmptyPhaseTiming();

  try {
    for (const registerSpy of setupSpies) {
      registerSpy(phases);
    }

    const requestStart = performance.now();
    const result = await executeOperation(run);
    const requestMs = performance.now() - requestStart;

    vi.restoreAllMocks();

    if (runRevalidation) {
      const revalidationStart = performance.now();
      await runRevalidation(result);
      phases.revalidationMs = performance.now() - revalidationStart;
    }

    return {
      id,
      kind,
      route,
      surface,
      requestMs,
      roundTripMs: requestMs + phases.revalidationMs,
      phases,
    };
  } finally {
    vi.restoreAllMocks();
  }
}

function createEmptyPhaseTiming(): PhaseTiming {
  return {
    authSessionMs: 0,
    eventContextMs: 0,
    mainQueryMs: 0,
    readinessConfigurationMs: 0,
    actionMs: 0,
    revalidationMs: 0,
  };
}

function trackAsync<T extends object, K extends keyof T>(
  object: T,
  methodName: K,
  phase: Exclude<keyof PhaseTiming, "revalidationMs">,
): TimedSpyRegistration {
  return (phases) => {
    const target = object as Record<PropertyKey, AsyncMethod>;
    const original = target[methodName as PropertyKey];
    const spyOn = vi.spyOn as (
      target: Record<PropertyKey, AsyncMethod>,
      methodName: K,
    ) => SpyWithMockImplementation;

    spyOn(target, methodName).mockImplementation(function (
      this: unknown,
      ...args: unknown[]
    ) {
      const start = performance.now();

      return Promise.resolve(original.apply(this, args)).finally(() => {
        phases[phase] += performance.now() - start;
      });
    });
  };
}

async function executeOperation(run: () => Promise<unknown>) {
  try {
    return await run();
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }

    throw error;
  }
}

function expectResponse(result: unknown) {
  if (!(result instanceof Response)) {
    throw new Error("Expected route operation to throw a redirect response.");
  }

  return result;
}

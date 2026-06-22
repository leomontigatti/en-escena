import { eq } from "drizzle-orm";
import { vi } from "vitest";

import { db } from "@/db";
import {
  academies,
  categories,
  categoryExperienceLevels,
  categoryModalities,
  choreographies,
  choreographyDancers,
  choreographyProfessors,
  dancers,
  events,
  experienceLevels,
  modalities,
  prices,
  professors,
  scheduleCapacities,
  scheduleModalities,
  schedules,
  submodalities,
  user,
} from "@/db/schema";
import * as adminEventContextModule from "@/lib/admin/event-context.server";
import * as adminDancersModule from "@/lib/admin/dancers/dancers.server";
import * as adminProfessorsModule from "@/lib/admin/professors/professors.server";
import * as adminEventBasesModule from "@/lib/admin/events/bases-action.server";
import { createLocalAccessUser } from "@/lib/auth/access-test-auth.server";
import * as internalAccessModule from "@/lib/auth/internal-access.server";
import * as internalNavigationModule from "@/lib/auth/internal-navigation.server";
import { createEvent, activateEvent } from "@/lib/events/management.server";
import * as eventsManagementModule from "@/lib/events/management.server";
import * as eventBasesModule from "@/lib/events/bases.server";
import * as eventReadinessModule from "@/lib/events/registration-readiness.server";
import * as portalChoreographiesModule from "@/lib/portal/choreographies.server";
import * as portalDancersModule from "@/lib/portal/dancers.server";
import * as portalEventContextModule from "@/lib/portal/event-context.server";
import * as portalProfessorsModule from "@/lib/portal/professors.server";
import * as portalProfileModule from "@/lib/portal/academy-profile.server";
import * as choreographyRegistrationModule from "@/lib/choreographies/registration-confirmation.server";
import { loader as adminLayoutLoader } from "@/routes/administracion";
import { loader as adminDancersLoader } from "@/routes/administracion.bailarines";
import {
  action as adminBasesAction,
  loader as adminBasesLoader,
} from "@/lib/admin/events/bases-route.server";
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

type BaselineFixture = Awaited<ReturnType<typeof seedBaselineFixture>>;
type TimedSpyRegistration = (phases: PhaseTiming) => void;

let nextIdentity = 0;

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
          "getEventRegistrationReadiness",
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
          "getEventBases",
          "readinessConfigurationMs",
        ),
      ],
      run: () =>
        adminBasesLoader(
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
        trackAsync(adminEventBasesModule, "runEventBasesAction", "actionMs"),
      ],
      run: () =>
        adminBasesAction(
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
        await adminBasesLoader(
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
          "getPortalEventContext",
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
          "getPortalEventContext",
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
          "getPortalEventContext",
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
          "getPortalEventContext",
          "eventContextMs",
        ),
        trackAsync(
          portalChoreographiesModule,
          "listChoreographiesForAcademyEvent",
          "mainQueryMs",
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
        portalCoreografiaLoader({
          request: fixture.portalRequest("/portal/coreografias"),
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
          "getPortalEventContext",
          "eventContextMs",
        ),
        trackAsync(
          portalChoreographiesModule,
          "findChoreographyForAcademyEvent",
          "mainQueryMs",
        ),
        trackAsync(
          portalChoreographiesModule,
          "listProfessorOptionsForChoreography",
          "mainQueryMs",
        ),
        trackAsync(
          portalChoreographiesModule,
          "listDancerOptionsForChoreography",
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
          "getPortalEventContext",
          "eventContextMs",
        ),
        trackAsync(
          portalChoreographiesModule,
          "updateChoreography",
          "actionMs",
        ),
      ],
      run: () =>
        portalCoreografiaDetailAction({
          request: fixture.portalPostRequest(
            `/portal/coreografias/${fixture.choreography.id}`,
            choreographyUpdateFormData({
              dancerIds: [fixture.dancer.id],
              professorIds: [fixture.professor.id],
              experienceLevelId: fixture.catalog.level.id,
              scheduleCapacityId: fixture.catalog.scheduleCapacity.id,
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

export function formatCriticalRequestBaseline(
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
    const target = object as Record<PropertyKey, (...args: unknown[]) => unknown>;
    const original = target[methodName as PropertyKey];

    (vi.spyOn as (...args: unknown[]) => { mockImplementation: (fn: (...callArgs: unknown[]) => unknown) => void })(
      target,
      methodName,
    ).mockImplementation(function (
      this: unknown,
      ...args: unknown[]
    ) {
      const start = performance.now();

      return Promise.resolve(
        original.apply(this, args),
      ).finally(() => {
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

async function seedBaselineFixture() {
  const admin = await createInternalSession("admin");
  const academy = await createAcademySession();

  const activeEvent = await createSavedEvent({
    name: "Evento Activo",
    registrationStartsAt: date("2026-03-01T12:00:00Z"),
    registrationEndsAt: date("2026-04-30T12:00:00Z"),
    startsAt: date("2026-05-01T12:00:00Z"),
    endsAt: date("2026-05-03T12:00:00Z"),
  });
  const futureEvent = await createSavedEvent({
    name: "Evento Futuro",
    registrationStartsAt: date("2027-03-01T12:00:00Z"),
    registrationEndsAt: date("2027-04-30T12:00:00Z"),
    startsAt: date("2027-05-01T12:00:00Z"),
    endsAt: date("2027-05-03T12:00:00Z"),
  });
  await createSavedEvent({
    name: "Evento Finalizado",
    registrationStartsAt: date("2024-03-01T12:00:00Z"),
    registrationEndsAt: date("2024-04-30T12:00:00Z"),
    startsAt: date("2024-05-01T12:00:00Z"),
    endsAt: date("2024-05-03T12:00:00Z"),
  });
  await activateEvent(activeEvent.id);

  const catalog = await createEventCatalog(activeEvent.id);
  await db
    .update(events)
    .set({ registrationReadinessDirty: false })
    .where(eq(events.id, activeEvent.id));
  await db
    .update(events)
    .set({ registrationReadinessDirty: true })
    .where(eq(events.id, futureEvent.id));

  const dancer = await createDancer(academy.academyId, {
    firstName: "Ana",
    lastName: "Paz",
    birthDate: "2012-01-10",
  });
  const secondaryDancer = await createDancer(academy.academyId, {
    firstName: "Bea",
    lastName: "Lagos",
    birthDate: "2011-02-11",
  });
  const professor = await createProfessor(academy.academyId, {
    firstName: "Luz",
    lastName: "Suarez",
  });
  const secondaryProfessor = await createProfessor(academy.academyId, {
    firstName: "Nora",
    lastName: "Diaz",
  });
  const choreography = await createChoreographyRecord({
    academyId: academy.academyId,
    eventId: activeEvent.id,
    name: "Coreografía Base",
    modalityId: catalog.modality.id,
    submodalityId: catalog.submodality.id,
    categoryId: catalog.categoryWithLevel.id,
    experienceLevelId: catalog.level.id,
    scheduleCapacityId: catalog.scheduleCapacity.id,
  });
  await db.insert(choreographyDancers).values({
    choreographyId: choreography.id,
    dancerId: dancer.id,
    ageAtEventStart: 14,
  });
  await db.insert(choreographyProfessors).values({
    choreographyId: choreography.id,
    professorId: professor.id,
  });

  return {
    activeEvent,
    academy,
    admin,
    catalog,
    choreography,
    dancer,
    professor,
    secondaryDancer,
    secondaryProfessor,
    adminRequest(path: string, body?: FormData) {
      return new Request(toUrl(path), {
        method: body ? "POST" : "GET",
        body,
        headers: { cookie: admin.cookie },
      });
    },
    portalRequest(path: string) {
      return new Request(toUrl(path), {
        headers: { cookie: academy.cookie },
      });
    },
    portalPostRequest(path: string, body: FormData) {
      return new Request(toUrl(path), {
        method: "POST",
        body,
        headers: { cookie: academy.cookie },
      });
    },
  };
}

async function createInternalSession(role: "admin" | "auditor") {
  const identity = nextEmailSlug();
  const signUpResult = await createLocalAccessUser({
    email: `${identity}@example.com`,
    name: `${identity}@example.com`,
    password: "password-segura",
  });

  await db
    .update(user)
    .set({
      emailVerified: true,
      role,
    })
    .where(eq(user.id, signUpResult.response.user.id));

  return {
    cookie: createRequestCookie(signUpResult.headers),
  };
}

async function createAcademySession() {
  const identity = nextEmailSlug();
  const signUpResult = await createLocalAccessUser({
    email: `${identity}@example.com`,
    name: `${identity}@example.com`,
    password: "password-segura",
  });

  await db
    .update(user)
    .set({
      emailVerified: true,
      role: "academy",
    })
    .where(eq(user.id, signUpResult.response.user.id));

  const [academy] = await db
    .insert(academies)
    .values({
      userId: signUpResult.response.user.id,
      name: "Academia Medición",
      contactName: "Contacto",
      phone: "1112345678",
    })
    .returning();

  return {
    academy,
    academyId: academy.id,
    cookie: createRequestCookie(signUpResult.headers),
  };
}

async function createSavedEvent(
  overrides: Partial<Parameters<typeof createEvent>[0]> = {},
) {
  const result = await createEvent({
    name: "Evento",
    registrationStartsAt: date("2026-03-01T12:00:00Z"),
    registrationEndsAt: date("2026-04-30T12:00:00Z"),
    startsAt: date("2026-05-01T12:00:00Z"),
    endsAt: date("2026-05-03T12:00:00Z"),
    ...overrides,
  });

  if (!result.ok) {
    throw new Error(result.error);
  }

  return result.event;
}

async function createEventCatalog(eventId: string) {
  const [modality] = await db
    .insert(modalities)
    .values({ eventId, name: `Jazz ${eventId}` })
    .returning();
  const [submodality] = await db
    .insert(submodalities)
    .values({
      eventId,
      modalityId: modality.id,
      name: `Lyrical ${eventId}`,
    })
    .returning();
  const [level] = await db
    .insert(experienceLevels)
    .values({ eventId, name: `Inicial ${eventId}` })
    .returning();
  const [categoryWithLevel] = await db
    .insert(categories)
    .values({
      eventId,
      name: `Juvenil ${eventId}`,
      minAge: 13,
      maxAge: 17,
      groupTypes: ["solo"],
      groupTypeKey: "solo",
      experienceLevelKey: level.id,
    })
    .returning();
  await db.insert(categoryModalities).values({
    categoryId: categoryWithLevel.id,
    modalityId: modality.id,
  });
  await db.insert(categoryExperienceLevels).values({
    categoryId: categoryWithLevel.id,
    experienceLevelId: level.id,
  });
  const [schedule] = await db
    .insert(schedules)
    .values({
      eventId,
      name: `Bloque ${eventId}`,
      scheduledDate: "2026-05-01",
      startTime: "10:00",
      totalCapacity: 10,
    })
    .returning();
  await db.insert(scheduleModalities).values({
    scheduleId: schedule.id,
    modalityId: modality.id,
  });
  const [scheduleCapacity] = await db
    .insert(scheduleCapacities)
    .values({
      scheduleId: schedule.id,
      groupType: "solo",
      capacity: 5,
    })
    .returning();
  await db.insert(prices).values({
    eventId,
    name: `Precio ${eventId}`,
    groupType: "solo",
    amount: 10000,
    paymentDeadline: "2026-05-31",
    scheduleId: null,
  });

  return {
    categoryWithLevel,
    level,
    modality,
    scheduleCapacity,
    submodality,
  };
}

async function createDancer(
  academyId: string,
  overrides: Partial<typeof dancers.$inferInsert> = {},
) {
  const [dancer] = await db
    .insert(dancers)
    .values({
      academyId,
      firstName: "Ana",
      lastName: "Paz",
      birthDate: "2012-01-10",
      active: true,
      ...overrides,
    })
    .returning();

  return dancer;
}

async function createProfessor(
  academyId: string,
  overrides: Partial<typeof professors.$inferInsert> = {},
) {
  const [professor] = await db
    .insert(professors)
    .values({
      academyId,
      firstName: "Luz",
      lastName: "Suarez",
      active: true,
      ...overrides,
    })
    .returning();

  return professor;
}

async function createChoreographyRecord(
  overrides: Partial<typeof choreographies.$inferInsert> & {
    academyId: string;
    eventId: string;
    name: string;
    modalityId: string;
    scheduleCapacityId: string;
  },
) {
  const [choreography] = await db
    .insert(choreographies)
    .values({
      academyId: overrides.academyId,
      eventId: overrides.eventId,
      name: overrides.name,
      modalityId: overrides.modalityId,
      submodalityId: overrides.submodalityId ?? null,
      groupType: overrides.groupType ?? "solo",
      categoryId: overrides.categoryId ?? null,
      categoryAgeBasis: overrides.categoryAgeBasis ?? 13,
      categoryCalculationMode: overrides.categoryCalculationMode ?? "oldest",
      experienceLevelId: overrides.experienceLevelId ?? null,
      scheduleCapacityId: overrides.scheduleCapacityId,
      musicStorageKey: overrides.musicStorageKey ?? "music/base.mp3",
      hasPresentation: overrides.hasPresentation ?? false,
      hasActiveFinancialLink: overrides.hasActiveFinancialLink ?? false,
    })
    .returning();

  return choreography;
}

function adminLoaderArgs(request: Request) {
  return {
    request,
    params: {},
    context: {},
    url: new URL(request.url),
    pattern: new URL(request.url).pathname,
  };
}

function portalLayoutArgs(request: Request) {
  return {
    request,
    params: {},
    context: {},
    url: new URL(request.url),
    pattern: "/portal",
  };
}

function adminDetailArgs(request: Request, eventId: string) {
  return {
    request,
    params: { eventId },
    context: {},
    url: new URL(request.url),
    pattern: "/administracion/eventos/:eventId",
  };
}

function adminEventFormData(values: Record<string, string>) {
  return stringFormData({
    intent: "update",
    ...values,
  });
}

function stringFormData(values: Record<string, string | string[]>) {
  const formData = new FormData();

  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        formData.append(key, item);
      }
      continue;
    }

    formData.set(key, value);
  }

  return formData;
}

function choreographyCreateFormData(input: {
  eventId: string;
  name: string;
  modalityId: string;
  submodalityId: string;
  dancerIds: string[];
  professorIds: string[];
  experienceLevelId: string;
  scheduleCapacityId: string;
}) {
  return stringFormData({
    intent: "create-choreography",
    eventId: input.eventId,
    name: input.name,
    modalityId: input.modalityId,
    submodalityId: input.submodalityId,
    dancerIds: input.dancerIds,
    professorIds: input.professorIds,
    experienceLevelId: input.experienceLevelId,
    scheduleCapacityId: input.scheduleCapacityId,
  });
}

function choreographyUpdateFormData(input: {
  dancerIds: string[];
  professorIds: string[];
  experienceLevelId: string;
  scheduleCapacityId: string;
}) {
  return stringFormData({
    intent: "update-choreography",
    dancerIds: input.dancerIds,
    professorIds: input.professorIds,
    experienceLevelId: input.experienceLevelId,
    scheduleCapacityId: input.scheduleCapacityId,
  });
}

function createRequestCookie(headers: Headers) {
  const setCookie = headers.get("set-cookie");

  if (!setCookie) {
    throw new Error("Expected access auth to return a session cookie.");
  }

  const sessionCookie = setCookie.match(/sb-access-token=([^;]+)/);

  if (!sessionCookie?.[1]) {
    throw new Error("Expected access auth to return a session cookie.");
  }

  return `sb-access-token=${sessionCookie[1]}`;
}

function toUrl(path: string) {
  return path.startsWith("http://") || path.startsWith("https://")
    ? path
    : `http://localhost${path}`;
}

function nextEmailSlug() {
  nextIdentity += 1;
  return `baseline-${nextIdentity}`;
}

function date(value: string) {
  return new Date(value);
}

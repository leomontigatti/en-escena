/** @vitest-environment jsdom */

import { afterEach, describe, expect, test } from "vitest";

import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

import { ChoreographyCreationSummary } from "@/features/portal/choreographies/create/summary";
import type { RegistrationResolution } from "@/features/portal/choreographies/create/flow";

const renderer = createReactDomTestRenderer();

describe("choreography creation summary", () => {
  afterEach(() => {
    renderer.cleanup();
  });

  test("warns that the Coreografía cannot be edited after creating it", () => {
    renderer.render(
      <ChoreographyCreationSummary
        baseOptions={{
          modalities: [{ id: "modality_1", name: "Jazz" }],
          submodalities: [
            { id: "submodality_1", name: "Lyrical", modalityId: "modality_1" },
          ],
        }}
        name="Danza de la Luna"
        resolution={buildResolution()}
        selectedExperienceLevelId="amateur"
        selectedModalityId="modality_1"
        selectedProfessors={[
          { id: "professor_1", firstName: "Luz", lastName: "Suárez" },
        ]}
        selectedScheduleCapacityId="capacity_1"
        selectedSubmodalityId="submodality_1"
      />,
    );

    const markup = renderer.getContainer().innerHTML;

    expect(markup).toContain(
      "Revisá los datos ya que una vez guardados no vas a poder modificarlos.",
    );
  });
});

function buildResolution(): RegistrationResolution {
  return {
    categoryAgeBasis: 14,
    category: {
      status: "resolved" as const,
      id: "category_1",
      name: "Juvenil",
    },
    categoryCalculationMode: "oldest" as const,
    dancers: [
      {
        id: "dancer_1",
        firstName: "Ana",
        lastName: "Paz",
        ageAtEventStart: 11,
      },
    ],
    experienceLevel: {
      required: true as const,
      options: [{ id: "amateur" as const, name: "Amateur" }],
    },
    groupType: "solo" as const,
    schedule: {
      status: "multiple" as const,
      canConfirm: true as const,
      options: [
        {
          id: "capacity_1",
          scheduleId: "schedule_1",
          scheduleCapacityId: "capacity_1",
          capacity: 8,
          groupType: "solo" as const,
          usesGlobalCapacity: false,
          schedule: {
            id: "schedule_1",
            name: "Domingo mañana",
            scheduledDate: "2026-05-03",
            startTime: "10:00",
          },
        },
      ],
    },
  };
}

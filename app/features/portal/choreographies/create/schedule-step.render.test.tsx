/** @vitest-environment jsdom */

import { useForm } from "react-hook-form";
import { afterEach, describe, expect, test } from "vitest";

import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

import { CreateChoreographyScheduleStep } from "@/features/portal/choreographies/create/dialog";
import {
  emptyCreateChoreographyValues,
  everyScheduleCapacityFullMessage,
  type CreateChoreographyFormValues,
  type RegistrationResolution,
} from "@/features/portal/choreographies/create/flow";

const renderer = createReactDomTestRenderer();

describe("choreography creation schedule step", () => {
  afterEach(() => {
    renderer.cleanup();
  });

  test("offers the cupos with their ocupación while at least one has room", () => {
    renderer.render(
      <ScheduleStepHarness
        resolution={buildResolution([
          {
            id: "capacity_1",
            isFull: true,
            label: "1 de mayo de 2026 - 14:00 hs. · 5/5 ocupados · sin cupo",
          },
          {
            id: "capacity_2",
            isFull: false,
            label: "2 de mayo de 2026 - 18:00 hs. · 1/5 ocupados",
          },
        ])}
      />,
    );

    const markup = renderer.getContainer().innerHTML;

    expect(markup).toContain("Cronograma");
    expect(markup).toContain('data-slot="select-trigger"');
    expect(markup).not.toContain(everyScheduleCapacityFullMessage);
  });

  // Un select con todo deshabilitado es un callejón sin salida silencioso: el
  // registro tiene que decir por qué no hay nada para elegir.
  test("replaces the select with the blocked message when every cupo is full", () => {
    renderer.render(
      <ScheduleStepHarness
        resolution={buildResolution([
          {
            id: "capacity_1",
            isFull: true,
            label: "1 de mayo de 2026 - 14:00 hs. · 5/5 ocupados · sin cupo",
          },
          {
            id: "capacity_2",
            isFull: true,
            label: "2 de mayo de 2026 - 18:00 hs. · 5/5 ocupados · sin cupo",
          },
        ])}
      />,
    );

    const markup = renderer.getContainer().innerHTML;

    expect(markup).toContain(everyScheduleCapacityFullMessage);
    expect(markup).not.toContain('data-slot="select-trigger"');
  });
});

function ScheduleStepHarness({
  resolution,
}: {
  resolution: RegistrationResolution;
}) {
  const form = useForm<CreateChoreographyFormValues>({
    defaultValues: emptyCreateChoreographyValues,
  });

  return (
    <CreateChoreographyScheduleStep
      control={form.control}
      id="schedule-capacity"
      resolution={resolution}
    />
  );
}

function buildResolution(
  options: { id: string; isFull: boolean; label: string }[],
): RegistrationResolution {
  return {
    categoryAgeBasis: 12,
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
        ageAtEventStart: 12,
      },
    ],
    experienceLevel: {
      required: false as const,
      options: [],
    },
    groupType: "solo" as const,
    schedule: {
      status: "multiple" as const,
      canConfirm: true as const,
      options: options.map((option) => ({
        ...option,
        scheduleId: `schedule_${option.id}`,
        scheduleCapacityId: option.id,
        capacity: 5,
        groupType: "solo" as const,
        usesGlobalCapacity: false,
        schedule: {
          id: `schedule_${option.id}`,
          name: "Bloque",
          scheduledDate: "2026-05-01",
          startTime: "14:00",
        },
      })),
    },
  };
}

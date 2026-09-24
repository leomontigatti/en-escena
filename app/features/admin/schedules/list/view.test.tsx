/** @vitest-environment jsdom */

import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { EventSchedulesListView } from "@/features/admin/schedules/list/view";
import type { EventSchedulesListLoaderData } from "@/features/admin/schedules/shared";
import type { ScheduleListItem } from "@/lib/events/bases.server";
import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

describe("EventSchedulesListView", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(() => {
    renderer.cleanup();
  });

  // The switch lives in the schedule detail; the list only says where it is
  // standing, so an administrator reads every schedule at once.
  test("badges the inscriptions state of each schedule", () => {
    renderList();

    const headers = getHeaderLabels();

    expect(headers).toContain("Inscripciones");
    expect(getCellTexts("Inscripciones")).toEqual(["Abiertas", "Cerradas"]);
  });

  // Informational: nothing in the column submits anything.
  test("offers no control to change the inscriptions state", () => {
    renderList();

    const cells = getCells("Inscripciones");

    expect(cells.length).toBe(2);
    for (const cell of cells) {
      expect(cell.querySelector("button, input, a, form")).toBeNull();
    }
  });

  test("reads the day and the hour of a schedule in one column", () => {
    renderList();

    const headers = getHeaderLabels();

    expect(headers).toContain("Fecha");
    expect(headers).not.toContain("Hora");
    expect(getCellTexts("Fecha")).toEqual([
      "21 de octubre de 2026, 09:00",
      "21 de octubre de 2026, 12:30",
    ]);
  });

  // Same date, different hours: the merged column keeps the day as the first
  // key and the hour as the second.
  test("sorts the merged column by date and then by time", () => {
    renderList({
      schedules: [
        createSchedule({
          id: "schedule_late",
          name: "Bloque tarde",
          scheduledDate: "2026-10-21",
          startTime: "12:30",
        }),
        createSchedule({
          id: "schedule_next_day",
          name: "Bloque del día siguiente",
          scheduledDate: "2026-10-22",
          startTime: "08:00",
        }),
        createSchedule({
          id: "schedule_early",
          name: "Bloque mañana",
          scheduledDate: "2026-10-21",
          startTime: "09:00",
        }),
      ],
    });

    expect(getCellTexts("Nombre")).toEqual([
      "Bloque mañana",
      "Bloque tarde",
      "Bloque del día siguiente",
    ]);
  });

  function renderList(overrides: Partial<EventSchedulesListLoaderData> = {}) {
    renderer.render(
      <MemoryRouter>
        <EventSchedulesListView loaderData={createLoaderData(overrides)} />
      </MemoryRouter>,
    );
  }

  function getHeaderLabels() {
    return Array.from(document.querySelectorAll("thead th")).map((header) =>
      header.textContent?.trim(),
    );
  }

  /** The cells under a column, found by the label its header reads. */
  function getCells(header: string) {
    const columnIndex = getHeaderLabels().indexOf(header);

    if (columnIndex < 0) {
      throw new Error(`Expected a "${header}" column to be rendered.`);
    }

    return Array.from(document.querySelectorAll("tbody tr")).map((row) => {
      const cell = row.querySelectorAll("td")[columnIndex];

      if (!cell) {
        throw new Error(`Expected a "${header}" cell in every row.`);
      }

      return cell;
    });
  }

  function getCellTexts(header: string) {
    return getCells(header).map((cell) => cell.textContent?.trim());
  }
});

function createLoaderData(
  overrides: Partial<EventSchedulesListLoaderData>,
): EventSchedulesListLoaderData {
  return {
    selectedEventId: "event_1",
    schedules: [
      createSchedule({
        id: "schedule_morning",
        name: "Bloque mañana",
        registrationOpen: true,
        scheduledDate: "2026-10-21",
        startTime: "09:00",
      }),
      createSchedule({
        id: "schedule_afternoon",
        name: "Bloque tarde",
        scheduledDate: "2026-10-21",
        startTime: "12:30",
      }),
    ],
    ...overrides,
  };
}

function createSchedule({
  id,
  name,
  registrationOpen = false,
  scheduledDate,
  startTime,
}: {
  id: string;
  name: string;
  registrationOpen?: boolean;
  scheduledDate: string;
  startTime: string;
}): ScheduleListItem {
  return {
    id,
    eventId: "event_1",
    name,
    scheduledDate,
    startTime,
    totalCapacity: 10,
    registrationOpen,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    modalities: [],
    modalityIds: [],
    categories: [],
    categoryIds: [],
    availablePlaces: 10,
    occupiedCount: 0,
    scheduleCapacities: [],
  };
}

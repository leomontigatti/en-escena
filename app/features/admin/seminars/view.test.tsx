/** @vitest-environment jsdom */

import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { SeminarCreateView } from "@/features/admin/seminars/create/view";
import { SeminarDetailView } from "@/features/admin/seminars/detail/view";
import { SeminarsListView } from "@/features/admin/seminars/list/view";
import { defaultSeminarFormValues } from "@/features/admin/seminars/shared";
import type { SeminarListItem } from "@/lib/seminars/repository.server";
import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

const renderer = createReactDomTestRenderer();

afterEach(() => {
  renderer.cleanup();
});

function buildSeminar(
  overrides: Partial<SeminarListItem> = {},
): SeminarListItem {
  return {
    id: "seminar_1",
    eventId: "event_1",
    instructorName: "Abril Sosa",
    instructorPictureStorageKey: null,
    scheduledDate: "2026-10-10",
    startTime: "18:30",
    quota: 20,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    availablePlaces: 20,
    ...overrides,
  };
}

async function renderAt(path: string, element: React.ReactElement) {
  const router = createMemoryRouter(
    [{ path, action: async () => null, element }],
    { initialEntries: [path] },
  );

  await renderer.renderAsync(<RouterProvider router={router} />);
}

describe("SeminarsListView", () => {
  test("reads the seminar with the schedule views' date and available-places wording", async () => {
    await renderAt(
      "/administracion/seminarios",
      <SeminarsListView
        loaderData={{
          selectedEventId: "event_1",
          seminars: [buildSeminar({ availablePlaces: 12 })],
        }}
      />,
    );

    expect(document.body.textContent).toContain("10 de octubre de 2026");
    expect(document.body.textContent).toContain("18:30");
    expect(document.body.textContent).toContain(" / 12 disponibles");
    expect(
      document.querySelector('a[href="/administracion/seminarios/seminar_1"]')
        ?.textContent,
    ).toBe("Abril Sosa");
  });

  test("marks a seminar with no places left as destructive", async () => {
    await renderAt(
      "/administracion/seminarios",
      <SeminarsListView
        loaderData={{
          selectedEventId: "event_1",
          seminars: [buildSeminar({ availablePlaces: 0 })],
        }}
      />,
    );

    const suffix = Array.from(document.querySelectorAll("span")).find(
      (element) => element.textContent === " / sin lugares",
    );

    expect(suffix?.className).toContain("text-destructive");
  });

  test("offers the empty state and the create action when the event has no seminars", async () => {
    await renderAt(
      "/administracion/seminarios",
      <SeminarsListView
        loaderData={{ selectedEventId: "event_1", seminars: [] }}
      />,
    );

    expect(document.body.textContent).toContain(
      "Todavía no hay seminarios creados.",
    );
    expect(
      document.querySelector('a[href="/administracion/seminarios/nuevo"]')
        ?.textContent,
    ).toContain("Nuevo seminario");
  });
});

describe("SeminarDetailView", () => {
  test("shows what is left of the quota inside the field and in its accessible name", async () => {
    await renderAt(
      "/administracion/seminarios/seminar_1",
      <SeminarDetailView
        loaderData={{
          selectedEventId: "event_1",
          seminar: buildSeminar({ availablePlaces: 12 }),
          values: {
            instructorName: "Abril Sosa",
            scheduledDate: "2026-10-10",
            startTime: "18:30",
            quota: "20",
          },
        }}
      />,
    );

    expect(document.body.textContent).toContain(" / 12 disponibles");
    expect(document.querySelector("#quota")?.getAttribute("aria-label")).toBe(
      "Cupo. Quedan 12 de 20 lugares.",
    );
    expect(
      document.querySelectorAll('[data-slot="field-description"]'),
    ).toHaveLength(0);
  });
});

describe("SeminarCreateView", () => {
  test("leaves the quota bare, with no places suffix to report", async () => {
    await renderAt(
      "/administracion/seminarios/nuevo",
      <SeminarCreateView
        loaderData={{
          selectedEventId: "event_1",
          values: defaultSeminarFormValues(),
        }}
      />,
    );

    expect(document.body.textContent).not.toContain("disponibles");
    expect(
      document.querySelector("#quota")?.getAttribute("aria-label"),
    ).toBeNull();
  });
});

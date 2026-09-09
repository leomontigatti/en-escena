/** @vitest-environment jsdom */

import { act } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { PortalSeminarsListRouteView } from "@/features/portal/seminars/list/view";
import type {
  PortalSeminarCard,
  PortalSeminarsListLoaderData,
} from "@/features/portal/seminars/list/shared";
import {
  createReactDomTestRenderer,
  getReactDomTexts,
} from "@/lib/test-support/react-dom";

const renderer = createReactDomTestRenderer();

afterEach(() => {
  renderer.cleanup();
});

function buildSeminar(
  overrides: Partial<PortalSeminarCard> = {},
): PortalSeminarCard {
  return {
    id: "seminar_1",
    instructorName: "Abril Sosa",
    instructorPictureUrl: null,
    scheduledDate: "2026-10-10",
    startTime: "18:30",
    hasStarted: false,
    isFull: false,
    inscriptions: [],
    people: [
      { id: "dancer_1", kind: "dancer", fullName: "Ana Paz" },
      { id: "professor_1", kind: "professor", fullName: "Luz Suárez" },
    ],
    ...overrides,
  };
}

async function renderSeminars(loaderData: PortalSeminarsListLoaderData) {
  const router = createMemoryRouter(
    [
      {
        path: "/portal/seminarios",
        action: async () => null,
        element: <PortalSeminarsListRouteView loaderData={loaderData} />,
      },
    ],
    { initialEntries: ["/portal/seminarios"] },
  );

  await renderer.renderAsync(<RouterProvider router={router} />);
}

function findByText(selector: string, text: string) {
  return Array.from(document.querySelectorAll(selector)).find(
    (element) => element.textContent?.trim() === text,
  );
}

describe("PortalSeminarsListRouteView", () => {
  test("reads the instructor, the moment and the academy's own inscriptions, and never a quota figure", async () => {
    await renderSeminars({
      hasActiveEvent: true,
      seminars: [
        buildSeminar({
          inscriptions: [{ id: "inscription_1", fullName: "Ana Paz" }],
        }),
      ],
    });

    const text = document.body.textContent ?? "";

    expect(text).toContain("Abril Sosa");
    expect(text).toContain("10 de octubre de 2026 · 18:30");
    expect(text).toContain("Ana Paz");
    expect(text).not.toContain("cupo");
    expect(text).not.toContain("disponibles");
  });

  test("says nobody is registered yet and offers the button when the seminar is open", async () => {
    await renderSeminars({ hasActiveEvent: true, seminars: [buildSeminar()] });

    expect(document.body.textContent).toContain(
      "Todavía no inscribiste a nadie.",
    );
    expect(findByText("button", "Inscribir")).toBeDefined();
  });

  test("replaces the button with the reason when the seminar is full or has started", async () => {
    await renderSeminars({
      hasActiveEvent: true,
      seminars: [
        buildSeminar({ id: "seminar_full", isFull: true }),
        buildSeminar({ id: "seminar_started", hasStarted: true }),
      ],
    });

    expect(document.body.textContent).toContain("Sin lugares disponibles.");
    expect(document.body.textContent).toContain("El seminario ya comenzó.");
    expect(findByText("button", "Inscribir")).toBeUndefined();
  });

  test("shows the empty state without an active event and without seminars", async () => {
    await renderSeminars({ hasActiveEvent: false, seminars: [] });

    expect(document.body.textContent).toContain("No hay un evento activo");

    renderer.cleanup();
    await renderSeminars({ hasActiveEvent: true, seminars: [] });

    expect(document.body.textContent).toContain("Todavía no hay seminarios");
  });

  test("offers a removal on each own chip that confirms before deleting", async () => {
    await renderSeminars({
      hasActiveEvent: true,
      seminars: [
        buildSeminar({
          inscriptions: [{ id: "inscription_1", fullName: "Ana Paz" }],
        }),
      ],
    });

    const removeButton = document.querySelector<HTMLButtonElement>(
      '[aria-label="Eliminar la inscripción de Ana Paz"]',
    );

    expect(removeButton).not.toBeNull();
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();

    await act(async () => {
      removeButton?.click();
    });

    const dialog = document.querySelector('[role="alertdialog"]');

    expect(dialog?.textContent).toContain("Ana Paz");
    expect(dialog?.textContent).toContain("libera su lugar");
  });

  test("drops the removal once the seminar has started and keeps the chip's padding", async () => {
    await renderSeminars({
      hasActiveEvent: true,
      seminars: [
        buildSeminar({
          id: "seminar_open",
          inscriptions: [{ id: "inscription_1", fullName: "Ana Paz" }],
        }),
        buildSeminar({
          id: "seminar_started",
          hasStarted: true,
          inscriptions: [{ id: "inscription_2", fullName: "Luz Suárez" }],
        }),
      ],
    });

    const chips = Array.from(
      document.querySelectorAll('[data-slot="badge"]'),
    ).map((chip) => chip as HTMLElement);

    expect(
      document.querySelector(
        '[aria-label="Eliminar la inscripción de Ana Paz"]',
      ),
    ).not.toBeNull();
    expect(
      document.querySelector(
        '[aria-label="Eliminar la inscripción de Luz Suárez"]',
      ),
    ).toBeNull();
    expect(chips).toHaveLength(2);
    expect(chips[1].className).toBe(chips[0].className);
  });

  test("opens the register dialog on the picker, with dancers and professors under their own headings", async () => {
    await renderSeminars({ hasActiveEvent: true, seminars: [buildSeminar()] });

    const registerButton = findByText("button", "Inscribir");

    await act(async () => {
      (registerButton as HTMLButtonElement).click();
    });

    const trigger = document.querySelector<HTMLElement>(
      '[data-slot="combobox-trigger"]',
    );

    expect(document.body.textContent).toContain("Persona");
    expect(trigger).not.toBeNull();
    expect(document.activeElement).toBe(trigger);

    await act(async () => {
      trigger?.click();
    });

    // The kind is said once per heading, so the options carry the name alone.
    expect(getReactDomTexts('[data-slot="combobox-label"]')).toEqual([
      "Bailarines",
      "Profesores",
    ]);
    expect(getReactDomTexts('[role="option"]')).toEqual([
      "Ana Paz",
      "Luz Suárez",
    ]);
  });
});

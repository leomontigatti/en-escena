/** @vitest-environment jsdom */

import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { PortalSeminarsListRouteView } from "@/features/portal/seminars/list/view";
import type {
  PortalSeminarCard,
  PortalSeminarsListLoaderData,
} from "@/features/portal/seminars/list/shared";
import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

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
    inscriptionCount: 0,
    ...overrides,
  };
}

async function renderSeminars(loaderData: PortalSeminarsListLoaderData) {
  const router = createMemoryRouter(
    [
      {
        path: "/portal/seminarios",
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
  test("reads as a poster: the instructor, the moment, the academy's own count and one way in", async () => {
    await renderSeminars({
      hasActiveEvent: true,
      seminars: [buildSeminar({ inscriptionCount: 3 })],
    });

    const text = document.body.textContent ?? "";

    expect(text).toContain("Abril Sosa");
    expect(text).toContain("10 de octubre de 2026 · 18:30");
    expect(text).toContain("3 inscriptos");
    expect(
      document.querySelector('a[href="/portal/seminarios/seminar_1"]')
        ?.textContent,
    ).toBe("Ver detalle");
    expect(text).not.toContain("cupo");
    expect(text).not.toContain("disponibles");
    expect(text).not.toContain("$");
  });

  test("says the places are taken by the deposit administration registers", async () => {
    await renderSeminars({ hasActiveEvent: true, seminars: [buildSeminar()] });

    expect(document.body.textContent).toContain(
      "Cada inscripción toma su lugar cuando administración registra su seña.",
    );
  });

  test("counts nobody as `Sin inscriptos` and never says it as a sentence", async () => {
    await renderSeminars({ hasActiveEvent: true, seminars: [buildSeminar()] });

    expect(document.body.textContent).toContain("Sin inscriptos");
    expect(document.body.textContent).not.toContain(
      "Todavía no inscribiste a nadie.",
    );
  });

  test("renders a started seminar exactly as an open one", async () => {
    // The poster carries no state at all — whether the seminar has started, is
    // full or is unpriced is the detail's business — so the card of a started
    // seminar is the card of an open one, name for name.
    await renderSeminars({
      hasActiveEvent: true,
      seminars: [buildSeminar({ inscriptionCount: 1 })],
    });

    expect(findByText("button", "Inscribir")).toBeUndefined();
    expect(document.body.textContent).not.toContain("El seminario ya comenzó.");
    expect(document.body.textContent).not.toContain("Cupo completo");
    expect(
      document.querySelector('[aria-label^="Eliminar la inscripción"]'),
    ).toBeNull();
  });

  test("shows the empty state without an active event and without seminars", async () => {
    await renderSeminars({ hasActiveEvent: false, seminars: [] });

    expect(document.body.textContent).toContain("No hay un evento activo");

    renderer.cleanup();
    await renderSeminars({ hasActiveEvent: true, seminars: [] });

    expect(document.body.textContent).toContain("Todavía no hay seminarios");
  });
});

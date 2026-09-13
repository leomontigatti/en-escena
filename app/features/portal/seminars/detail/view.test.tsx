/** @vitest-environment jsdom */

import { act } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { PortalSeminarDetailRouteView } from "@/features/portal/seminars/detail/view";
import type {
  PortalSeminarDetailInscription,
  PortalSeminarDetailLoaderData,
  PortalSeminarDetailSeminar,
} from "@/features/portal/seminars/detail/shared";
import type { PortalSeminarPersonOption } from "@/features/portal/seminars/shared";
import {
  createReactDomTestRenderer,
  getReactDomTexts,
} from "@/lib/test-support/react-dom";

const renderer = createReactDomTestRenderer();

afterEach(() => {
  renderer.cleanup();
});

type LoaderDataOverrides = {
  inscriptions?: PortalSeminarDetailInscription[];
  people?: PortalSeminarPersonOption[];
  seminar?: Partial<PortalSeminarDetailSeminar>;
};

function buildLoaderData(
  overrides: LoaderDataOverrides = {},
): PortalSeminarDetailLoaderData {
  return {
    seminar: {
      id: "seminar_1",
      instructorName: "Abril Sosa",
      scheduledDate: "2026-10-10",
      startTime: "18:30",
      hasStarted: false,
      hasRegistrationPrices: true,
      isFull: false,
      ...overrides.seminar,
    },
    inscriptions: overrides.inscriptions ?? [],
    people: overrides.people ?? [
      { id: "dancer_1", kind: "dancer", fullName: "Ana Paz" },
      { id: "professor_1", kind: "professor", fullName: "Luz Suárez" },
    ],
  };
}

async function renderDetail(loaderData: PortalSeminarDetailLoaderData) {
  const router = createMemoryRouter(
    [
      {
        path: "/portal/seminarios/:seminarId",
        action: async () => null,
        element: <PortalSeminarDetailRouteView loaderData={loaderData} />,
      },
    ],
    { initialEntries: ["/portal/seminarios/seminar_1"] },
  );

  await renderer.renderAsync(<RouterProvider router={router} />);
}

function findByText(selector: string, text: string) {
  return Array.from(document.querySelectorAll(selector)).find(
    (element) => element.textContent?.trim() === text,
  );
}

describe("PortalSeminarDetailRouteView", () => {
  test("is headed by the instructor and the moment, with `Inscribir` as the page action", async () => {
    await renderDetail(buildLoaderData());

    const text = document.body.textContent ?? "";

    expect(document.querySelector("#seminario-title")?.textContent).toBe(
      "Abril Sosa",
    );
    expect(text).toContain("10 de octubre de 2026 · 18:30");
    expect(findByText("button", "Inscribir")).toBeDefined();
  });

  test("lists the academy's own inscriptions as a flat name-and-type table, without money", async () => {
    await renderDetail(
      buildLoaderData({
        inscriptions: [
          {
            id: "inscription_1",
            fullName: "Ana Paz",
            personKind: "dancer",
            hasMoney: true,
          },
          {
            id: "inscription_2",
            fullName: "Luz Suárez",
            personKind: "professor",
            hasMoney: false,
          },
        ],
      }),
    );

    expect(getReactDomTexts("thead th")).toEqual(["Nombre", "Tipo"]);
    expect(document.body.textContent).toContain("Bailarín");
    expect(document.body.textContent).toContain("Profesor");
    expect(document.querySelector('[role="tablist"]')).toBeNull();
    expect(document.body.textContent).not.toContain("$");
    expect(document.body.textContent).not.toContain("Seña");
    expect(document.body.textContent).not.toContain("Participando");
  });

  test("says nobody is registered yet when the academy has nobody in the seminar", async () => {
    await renderDetail(buildLoaderData());

    expect(document.body.textContent).toContain(
      "Todavía no inscribiste a nadie en este seminario.",
    );
  });

  test("warns that a started seminar takes neither a registration nor a removal", async () => {
    await renderDetail(
      buildLoaderData({
        seminar: { hasStarted: true },
        inscriptions: [
          {
            id: "inscription_1",
            fullName: "Ana Paz",
            personKind: "dancer",
            hasMoney: false,
          },
        ],
      }),
    );

    expect(document.body.textContent).toContain(
      "El seminario ya comenzó. Ya no se puede inscribir ni dar de baja.",
    );
    expect(findByText("button", "Inscribir")).toBeUndefined();
    expect(findByText("button", "Ana Paz")).toBeUndefined();
    expect(document.body.textContent).toContain("Ana Paz");
  });

  test("says the seminar is unpriced instead of offering the registration", async () => {
    await renderDetail(
      buildLoaderData({
        seminar: { hasRegistrationPrices: false },
      }),
    );

    expect(document.body.textContent).toContain(
      "Las inscripciones a este seminario todavía no están abiertas.",
    );
    expect(findByText("button", "Inscribir")).toBeUndefined();
  });

  test("notes a full seminar without closing anything", async () => {
    await renderDetail(
      buildLoaderData({
        seminar: { isFull: true },
      }),
    );

    expect(document.body.textContent).toContain(
      "Cupo completo: podés inscribir igual, pero la seña de una nueva inscripción no se cubre hasta que se libere un lugar.",
    );
    expect(findByText("button", "Inscribir")).toBeDefined();
  });

  test("keeps the full notice off a started seminar", async () => {
    await renderDetail(
      buildLoaderData({
        seminar: { hasStarted: true, isFull: true },
      }),
    );

    expect(document.body.textContent).not.toContain("Cupo completo");
  });

  test("confirms the removal of an unfunded row as a deletion", async () => {
    await renderDetail(
      buildLoaderData({
        inscriptions: [
          {
            id: "inscription_1",
            fullName: "Ana Paz",
            personKind: "dancer",
            hasMoney: false,
          },
        ],
      }),
    );

    expect(document.querySelector('[role="alertdialog"]')).toBeNull();

    await act(async () => {
      (findByText("button", "Ana Paz") as HTMLButtonElement).click();
    });

    const dialog = document.querySelector('[role="alertdialog"]');

    expect(dialog?.textContent).toContain("Ana Paz");
    expect(dialog?.textContent).toContain("libera su lugar");
    expect(dialog?.textContent).toContain("No se puede deshacer.");
  });

  test("confirms a funded inscription as a withdrawal, without naming an amount", async () => {
    await renderDetail(
      buildLoaderData({
        inscriptions: [
          {
            id: "inscription_1",
            fullName: "Ana Paz",
            personKind: "dancer",
            hasMoney: true,
          },
        ],
      }),
    );

    await act(async () => {
      (findByText("button", "Ana Paz") as HTMLButtonElement).click();
    });

    const dialog = document.querySelector('[role="alertdialog"]');

    expect(dialog?.textContent).not.toContain("Esta acción es irreversible.");
    expect(dialog?.textContent).toContain("queda retirada del seminario");
    expect(dialog?.textContent).toContain(
      "El dinero que la inscripción tiene asignado queda como está y, si ya tenía la seña cubierta, su lugar se libera.",
    );
    expect(dialog?.textContent).toContain(
      "Si volvés a inscribir a la persona, la inscripción vuelve con su dinero.",
    );
    expect(dialog?.textContent).toContain("Retirar inscripción");
    expect(dialog?.textContent).not.toContain("$");
  });

  test("opens the register dialog on the picker, with dancers and professors under their own headings and no price", async () => {
    await renderDetail(buildLoaderData());

    await act(async () => {
      (findByText("button", "Inscribir") as HTMLButtonElement).click();
    });

    const trigger = document.querySelector<HTMLElement>(
      '[data-slot="combobox-trigger"]',
    );
    const dialog = document.querySelector('[role="dialog"]');

    expect(document.body.textContent).toContain("Persona");
    expect(trigger).not.toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(dialog?.textContent).not.toContain("$");
    expect(dialog?.textContent).not.toContain("Seña");

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

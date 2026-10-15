/** @vitest-environment jsdom */

import { act } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import type {
  IndividualSeminarRow,
  IndividualSeminarsLoaderData,
} from "@/features/individual/seminars/shared";
import { IndividualSeminarsView } from "@/features/individual/seminars/view";
import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

const renderer = createReactDomTestRenderer();

afterEach(() => {
  renderer.cleanup();
});

function buildSeminar(
  overrides: Partial<IndividualSeminarRow> = {},
): IndividualSeminarRow {
  return {
    id: "seminar_1",
    instructorName: "Abril Sosa",
    scheduledDate: "2026-10-10",
    startTime: "18:30",
    priceAmount: 30000,
    hasStarted: false,
    isFull: false,
    startsBeforePaymentDeadline: false,
    inscription: null,
    academyInscriptions: [],
    ...overrides,
  };
}

function buildLoaderData(
  overrides: Partial<IndividualSeminarsLoaderData> = {},
): IndividualSeminarsLoaderData {
  return {
    hasActiveEvent: true,
    hasRegistrationPrices: true,
    isSeenByAcademy: false,
    seminars: [buildSeminar()],
    ...overrides,
  };
}

async function renderView(loaderData: IndividualSeminarsLoaderData) {
  const router = createMemoryRouter(
    [
      {
        path: "/particular/seminarios",
        action: async () => null,
        element: <IndividualSeminarsView loaderData={loaderData} />,
      },
    ],
    { initialEntries: ["/particular/seminarios"] },
  );

  await renderer.renderAsync(<RouterProvider router={router} />);
}

function findByText(selector: string, text: string) {
  return Array.from(document.querySelectorAll(selector)).find(
    (element) => element.textContent?.trim() === text,
  );
}

async function openSeminar(instructorName: string) {
  await act(async () => {
    (findByText("button", instructorName) as HTMLButtonElement).click();
  });
}

describe("IndividualSeminarsView", () => {
  test("opens the registration with the price and the reservation notice", async () => {
    await renderView(buildLoaderData());

    await openSeminar("Abril Sosa");

    const dialog = document.querySelector('[role="dialog"]');

    expect(dialog?.textContent).toContain("$ 30.000");
    expect(dialog?.textContent).toContain("Reserva de lugar");
    expect(dialog?.textContent).toContain("Tenés 48 horas");
    expect(dialog?.textContent).not.toContain(
      "Tu academia verá esta inscripción",
    );
    expect(findByText("button", "Inscribirme")).toBeDefined();
  });

  test("tells a linked individual in the registration that its academy will see it", async () => {
    await renderView(buildLoaderData({ isSeenByAcademy: true }));

    await openSeminar("Abril Sosa");

    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      "Tu academia verá esta inscripción",
    );
  });

  test("shows an academy's inscription read-only, naming the academy", async () => {
    await renderView(
      buildLoaderData({
        seminars: [
          buildSeminar({
            academyInscriptions: [
              { academyName: "Academia Norte", id: "inscription_1" },
            ],
          }),
        ],
      }),
    );

    expect(document.body.textContent).toContain("Inscripto por Academia Norte");

    await openSeminar("Abril Sosa");

    const dialog = document.querySelector('[role="alertdialog"]');

    expect(dialog?.textContent).toContain(
      "Academia Norte ya te inscribió en este seminario.",
    );
    expect(findByText("button", "Inscribirme")).toBeUndefined();
  });

  test("warns in the registration that a full seminar holds no place", async () => {
    await renderView(
      buildLoaderData({
        seminars: [buildSeminar({ isFull: true })],
      }),
    );

    await openSeminar("Abril Sosa");

    const dialog = document.querySelector('[role="dialog"]');

    expect(dialog?.textContent).toContain("Cupo completo");
    expect(dialog?.textContent).not.toContain("Reserva de lugar");
  });

  test("confirms the removal of an unfunded inscription as a deletion", async () => {
    await renderView(
      buildLoaderData({
        seminars: [
          buildSeminar({
            inscription: {
              id: "inscription_1",
              hasMoney: false,
              status: { kind: "reserved" },
            },
          }),
        ],
      }),
    );

    await openSeminar("Abril Sosa");

    const dialog = document.querySelector('[role="alertdialog"]');

    expect(dialog?.textContent).toContain("¿Eliminar la inscripción?");
    expect(dialog?.textContent).toContain("Esta acción es irreversible.");
  });

  test("confirms a funded inscription as a withdrawal", async () => {
    await renderView(
      buildLoaderData({
        seminars: [
          buildSeminar({
            inscription: {
              id: "inscription_1",
              hasMoney: true,
              status: { kind: "status", status: "depositMet" },
            },
          }),
        ],
      }),
    );

    await openSeminar("Abril Sosa");

    const dialog = document.querySelector('[role="alertdialog"]');

    expect(dialog?.textContent).toContain("¿Retirar la inscripción?");
    expect(dialog?.textContent).not.toContain("Esta acción es irreversible.");
  });

  test("says why a started seminar takes neither a registration nor a removal", async () => {
    await renderView(
      buildLoaderData({
        seminars: [
          buildSeminar({ hasStarted: true }),
          buildSeminar({
            id: "seminar_2",
            instructorName: "Julio Bocca",
            hasStarted: true,
            inscription: {
              id: "inscription_1",
              hasMoney: false,
              status: { kind: "status", status: "depositPending" },
            },
          }),
        ],
      }),
    );

    await openSeminar("Abril Sosa");

    expect(
      document.querySelector('[role="alertdialog"]')?.textContent,
    ).toContain("No te podés inscribir a este seminario");
    expect(
      document.querySelector('[role="alertdialog"]')?.textContent,
    ).toContain("El seminario ya comenzó.");
  });

  test("says why an unpriced event takes no registration yet", async () => {
    await renderView(buildLoaderData({ hasRegistrationPrices: false }));

    await openSeminar("Abril Sosa");

    expect(
      document.querySelector('[role="alertdialog"]')?.textContent,
    ).toContain(
      "Las inscripciones a este seminario todavía no están abiertas.",
    );
  });
});

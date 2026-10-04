// @vitest-environment jsdom

import { act } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import PortalProfessorDetailRoute from "@/routes/portal.profesores_.$professorId";
import {
  clickReactDomButton,
  createReactDomTestRenderer,
  setInputValue,
  updateReactDomForm,
  waitFor,
} from "@/lib/test-support/react-dom";

import type { PortalProfessorDetailLoaderData } from "./shared";

const loaderData: PortalProfessorDetailLoaderData = {
  choreographies: [],
  isParticipatingInActiveEvent: false,
  professor: {
    id: "profesor_1",
    firstName: "Ana",
    lastName: "Perez",
    active: true,
    documentType: null,
    documentNumber: null,
    isIncomplete: true,
    participationStatus: "not-participating",
  },
  selectedEventId: "event_1",
  seminarInscriptions: [],
};

describe("PortalProfessorDetailRoute tabs", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  test("keeps a refused save's values after a search in another tab", async () => {
    const router = createMemoryRouter(
      [
        {
          path: "/portal/profesores/:professorId",
          loader: () => loaderData,
          action: async () => ({
            status: "error" as const,
            message: "Revisá los datos del Profesor.",
            fieldErrors: {},
            values: {
              firstName: "Anita",
              lastName: "Perez",
              documentType: "",
              documentNumber: "",
            },
          }),
          element: <PortalProfessorDetailRoute loaderData={loaderData} />,
        },
      ],
      { initialEntries: ["/portal/profesores/profesor_1"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);
    await waitFor(
      () => document.querySelector('input[name="firstName"]') !== null,
    );
    await updateReactDomForm(() =>
      setInputValue(readInput("firstName"), "Anita"),
    );
    await clickReactDomButton("Guardar", { exact: true });
    await waitFor(() =>
      Object.values(router.state.actionData ?? {}).some(
        (data) => (data as { status?: string }).status === "error",
      ),
    );
    expect(readInput("firstName").value).toBe("Anita");

    await selectTab("Seminarios");
    await updateReactDomForm(() =>
      setInputValue(
        document.querySelector<HTMLInputElement>(
          'input[aria-label="Buscar en la tabla"]',
        )!,
        "Tango",
      ),
    );
    await waitFor(() => router.state.location.search === "?busqueda=Tango");
    await selectTab("Identificación");

    expect(readInput("firstName").value).toBe("Anita");
  });
});

function readInput(name: string) {
  return document.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;
}

/** Radix tabs activate on `mousedown`, not on `click`. */
async function selectTab(label: string) {
  const tab = [...document.querySelectorAll('[role="tab"]')].find(
    (element) => element.textContent === label,
  );

  await act(async () => {
    tab!.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, button: 0 }),
    );
  });
}

// @vitest-environment jsdom

import { type ReactElement } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { PortalProfessorsListRouteView } from "@/features/portal/professors/list/view";
import {
  clickReactDomButton,
  createReactDomTestRenderer,
} from "@/lib/test-support/react-dom";

type PortalProfessorsListRouteViewProps = Parameters<
  typeof PortalProfessorsListRouteView
>[0];

describe("PortalProfessorsListRouteView dialog", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  test("updates the open professor dialog with submitted values after a server error", async () => {
    await renderer.renderAsync(
      createRouteElement(
        "/portal/profesores",
        <PortalProfessorsListRouteView
          loaderData={createProfessorLoaderData()}
        />,
      ),
    );

    await clickReactDomButton("Nuevo profesor");

    expect(
      document.querySelector<HTMLInputElement>('input[name="lastName"]')?.value,
    ).toBe("");

    await renderer.renderAsync(
      createRouteElement(
        "/portal/profesores",
        <PortalProfessorsListRouteView
          loaderData={createProfessorLoaderData()}
          actionData={{
            status: "error",
            fieldErrors: {
              firstName: "Este campo es obligatorio.",
            },
            values: {
              firstName: "",
              lastName: "Pérez",
            },
            modalOpen: true,
          }}
        />,
      ),
    );

    expect(
      document.querySelector<HTMLInputElement>('input[name="lastName"]')?.value,
    ).toBe("Pérez");
  });
});

function createProfessorLoaderData(): PortalProfessorsListRouteViewProps["loaderData"] {
  return {
    professors: [],
  };
}

function createRouteElement(path: string, element: ReactElement) {
  return (
    <RouterProvider
      router={createMemoryRouter(
        [
          {
            path,
            action: async () => null,
            element,
          },
        ],
        { initialEntries: [path] },
      )}
    />
  );
}

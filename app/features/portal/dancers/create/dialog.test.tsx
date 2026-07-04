// @vitest-environment jsdom

import { type ReactElement } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { PortalDancersListRouteView } from "@/features/portal/dancers/list/view";
import {
  clickReactDomButton,
  createReactDomTestRenderer,
} from "@/lib/test-support/react-dom";

type PortalDancersListRouteViewProps = Parameters<
  typeof PortalDancersListRouteView
>[0];

describe("PortalDancersListRouteView dialog", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  test("shows the create dialog with submitted values after a server error", async () => {
    await renderer.renderAsync(
      createRouteElement(
        "/portal/bailarines",
        <PortalDancersListRouteView
          loaderData={createDancerLoaderData()}
          actionData={{
            status: "error",
            fieldErrors: {
              firstName: "Este campo es obligatorio.",
              birthDate: "La fecha de nacimiento no puede ser futura.",
            },
            values: {
              firstName: "",
              lastName: "López",
              birthDate: "2999-01-01",
            },
            modalOpen: true,
          }}
        />,
      ),
    );

    expect(document.body.textContent).toContain("Nuevo bailarín");
    expect(document.body.textContent).toContain(
      "Ingresá los datos mínimos para cargarlo en la academia.",
    );
    expect(document.body.textContent).not.toContain(
      "Este campo es obligatorio.",
    );
    expect(document.body.textContent).not.toContain(
      "La fecha de nacimiento no puede ser futura.",
    );
    expect(
      document.querySelector<HTMLInputElement>('input[name="lastName"]')?.value,
    ).toBe("López");
    expect(
      document.querySelector<HTMLInputElement>('input[name="birthDate"]')
        ?.value,
    ).toBe("2999-01-01");
  });

  test("updates the open dancer dialog with submitted values after a server error", async () => {
    await renderer.renderAsync(
      createRouteElement(
        "/portal/bailarines",
        <PortalDancersListRouteView loaderData={createDancerLoaderData()} />,
      ),
    );

    await clickReactDomButton("Nuevo bailarín");

    expect(
      document.querySelector<HTMLInputElement>('input[name="lastName"]')?.value,
    ).toBe("");

    await renderer.renderAsync(
      createRouteElement(
        "/portal/bailarines",
        <PortalDancersListRouteView
          loaderData={createDancerLoaderData()}
          actionData={{
            status: "error",
            fieldErrors: {
              birthDate: "La fecha de nacimiento no puede ser futura.",
            },
            values: {
              firstName: "Ana",
              lastName: "López",
              birthDate: "2999-01-01",
            },
            modalOpen: true,
          }}
        />,
      ),
    );

    expect(
      document.querySelector<HTMLInputElement>('input[name="firstName"]')
        ?.value,
    ).toBe("Ana");
    expect(
      document.querySelector<HTMLInputElement>('input[name="lastName"]')?.value,
    ).toBe("López");
    expect(
      document.querySelector<HTMLInputElement>('input[name="birthDate"]')
        ?.value,
    ).toBe("2999-01-01");
  });
});

function createDancerLoaderData(): PortalDancersListRouteViewProps["loaderData"] {
  return {
    dancers: [],
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

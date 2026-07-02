// @vitest-environment jsdom

import "@/test/react-test-env";

import { act, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { PortalDancersListRouteView } from "@/features/portal/dancers/list/view";

type PortalDancersListRouteViewProps = Parameters<
  typeof PortalDancersListRouteView
>[0];

describe("PortalDancersListRouteView dialog", () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }

    container?.remove();
    container = null;
    document.body.innerHTML = "";
  });

  test("shows the create dialog with submitted values after a server error", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      renderRoute(
        root,
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
      );
    });

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
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      renderRoute(
        root,
        "/portal/bailarines",
        <PortalDancersListRouteView loaderData={createDancerLoaderData()} />,
      );
    });

    await act(async () => {
      clickButton("Nuevo bailarín");
    });

    expect(
      document.querySelector<HTMLInputElement>('input[name="lastName"]')?.value,
    ).toBe("");

    await act(async () => {
      renderRoute(
        root,
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
      );
    });

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

function renderRoute(
  root: ReturnType<typeof createRoot> | null,
  path: string,
  element: ReactElement,
) {
  root?.render(
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
    />,
  );
}

function clickButton(label: string) {
  const button = Array.from(document.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.includes(label),
  );

  if (!button) {
    throw new Error(`Expected button "${label}" to be rendered.`);
  }

  button.click();
}

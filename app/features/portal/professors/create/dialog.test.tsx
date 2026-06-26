// @vitest-environment jsdom

import "@/test/react-test-env";

import { act, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { PortalProfessorsListRouteView } from "@/features/portal/professors/list/view";

type PortalProfessorsListRouteViewProps = Parameters<
  typeof PortalProfessorsListRouteView
>[0];

describe("PortalProfessorsListRouteView dialog", () => {
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

  test("updates the open professor dialog with submitted values after a server error", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      renderRoute(
        root,
        "/portal/profesores",
        <PortalProfessorsListRouteView
          loaderData={createProfessorLoaderData()}
        />,
      );
    });

    await act(async () => {
      clickButton("Nuevo profesor");
    });

    expect(
      document.querySelector<HTMLInputElement>('input[name="lastName"]')?.value,
    ).toBe("");

    await act(async () => {
      renderRoute(
        root,
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
      );
    });

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

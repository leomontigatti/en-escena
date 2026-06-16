// @vitest-environment jsdom

import "@/test/react-test-env";

import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, describe, expect, test } from "vitest";

type PortalBailarinesRouteViewComponent =
  typeof import("@/routes/portal.bailarines").PortalBailarinesRouteView;
type PortalBailarinesRouteViewProps =
  Parameters<PortalBailarinesRouteViewComponent>[0];

describe("PortalBailarinesRouteView dialog", () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;
  let PortalBailarinesRouteView: PortalBailarinesRouteViewComponent;

  beforeAll(async () => {
    ({ PortalBailarinesRouteView } =
      await import("@/routes/portal.bailarines"));
  }, 20_000);

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

  test("shows the create dialog with server field errors and submitted values", async () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <MemoryRouter initialEntries={["/portal/bailarines"]}>
          <PortalBailarinesRouteView
            loaderData={createLoaderData()}
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
          />
        </MemoryRouter>,
      );
    });

    expect(document.body.textContent).toContain("Nuevo bailarín");
    expect(document.body.textContent).toContain(
      "Ingresá los datos mínimos para cargarlo en la academia.",
    );
    expect(document.body.textContent).toContain("Este campo es obligatorio.");
    expect(document.body.textContent).toContain(
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
});

function createLoaderData(): PortalBailarinesRouteViewProps["loaderData"] {
  return {
    dancers: [],
  };
}

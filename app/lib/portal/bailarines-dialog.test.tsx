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
  });

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
    email: "portal@example.com",
    userName: "Portal User",
    academy: {
      id: "academy_1",
      userId: "user_1",
      name: "Academia de Prueba",
      contactName: "Contacto",
      phone: "11 1234-5678",
    },
    eventContext: {
      events: [
        {
          id: "event_1",
          name: "Regional 2026",
          active: true,
          registrationStartsAt: new Date("2026-03-01T12:00:00.000Z"),
          registrationEndsAt: new Date("2026-04-30T12:00:00.000Z"),
          startsAt: new Date("2026-05-01T12:00:00.000Z"),
          endsAt: new Date("2026-05-03T12:00:00.000Z"),
        },
      ],
      selectedEvent: {
        id: "event_1",
        name: "Regional 2026",
        active: true,
        registrationStartsAt: new Date("2026-03-01T12:00:00.000Z"),
        registrationEndsAt: new Date("2026-04-30T12:00:00.000Z"),
        startsAt: new Date("2026-05-01T12:00:00.000Z"),
        endsAt: new Date("2026-05-03T12:00:00.000Z"),
      },
      activeEvent: {
        id: "event_1",
        name: "Regional 2026",
        active: true,
        registrationStartsAt: new Date("2026-03-01T12:00:00.000Z"),
        registrationEndsAt: new Date("2026-04-30T12:00:00.000Z"),
        startsAt: new Date("2026-05-01T12:00:00.000Z"),
        endsAt: new Date("2026-05-03T12:00:00.000Z"),
      },
      hasActiveEvent: true,
      activeEventRegistrationReadiness: {
        eventId: "event_1",
        isReady: true,
        missingItems: [],
      },
      hasEvents: true,
      isReadOnly: false,
      isRegistrationOpen: true,
    },
    dancers: [],
  };
}

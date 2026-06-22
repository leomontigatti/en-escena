/** @vitest-environment jsdom */

import "@/test/react-test-env";

import { act } from "react";
import type * as React from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, test, vi } from "vitest";

const reactRouterMocks = vi.hoisted(() => ({
  useFormAction: vi.fn(),
  useNavigation: vi.fn(),
  useSubmit: vi.fn(),
}));

vi.mock("react-router", async () => {
  const actual =
    await vi.importActual<typeof import("react-router")>("react-router");

  return {
    ...actual,
    Link: ({
      children,
      to,
      ...props
    }: {
      children: React.ReactNode;
      to: string;
    }) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
    useFormAction: reactRouterMocks.useFormAction,
    useNavigation: reactRouterMocks.useNavigation,
    useSubmit: reactRouterMocks.useSubmit,
  };
});

import { AdministracionEventoDetalleRouteView } from "@/routes/administracion.eventos_.$eventId";
import { AdministracionEventoNuevoRouteView } from "@/routes/administracion.eventos_.nuevo";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

describe("Evento RHF + React Router form submission", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    reactRouterMocks.useFormAction.mockReset();
    reactRouterMocks.useNavigation.mockReset();
    reactRouterMocks.useSubmit.mockReset();

    if (root) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }

    if (container) {
      container.remove();
      container = null;
    }

    document.body.innerHTML = "";
  });

  test("submits the new Evento form through React Router instead of form.submit()", async () => {
    const nativeSubmitSpy = vi
      .spyOn(HTMLFormElement.prototype, "submit")
      .mockImplementation(() => {});
    const submitSpy = vi.fn();

    reactRouterMocks.useFormAction.mockReturnValue(
      "/administracion/eventos/nuevo",
    );
    reactRouterMocks.useNavigation.mockReturnValue({ state: "idle" });
    reactRouterMocks.useSubmit.mockReturnValue(submitSpy);

    render(
      <AdministracionEventoNuevoRouteView
        actionData={{
          status: "error",
          message: "Revisá los datos del Evento.",
          fieldErrors: {},
          values: buildSubmittedEventValues(),
        }}
      />,
    );

    const form = document.querySelector("form");
    const submitButton = getButton("Guardar");

    expect(form).toBeInstanceOf(HTMLFormElement);

    await act(async () => {
      (form as HTMLFormElement).requestSubmit(submitButton);
      await Promise.resolve();
    });

    expect(nativeSubmitSpy).not.toHaveBeenCalled();
    expect(submitSpy).toHaveBeenCalledTimes(1);
    expect(submitSpy).toHaveBeenCalledWith(
      submitButton,
      expect.objectContaining({
        action: "/administracion/eventos/nuevo",
        method: "post",
      }),
    );
  });

  test("blocks invalid client data and keeps validation errors visible", async () => {
    const nativeSubmitSpy = vi
      .spyOn(HTMLFormElement.prototype, "submit")
      .mockImplementation(() => {});
    const submitSpy = vi.fn();

    reactRouterMocks.useFormAction.mockReturnValue(
      "/administracion/eventos/nuevo",
    );
    reactRouterMocks.useNavigation.mockReturnValue({ state: "idle" });
    reactRouterMocks.useSubmit.mockReturnValue(submitSpy);

    render(<AdministracionEventoNuevoRouteView />);

    const form = document.querySelector("form");

    expect(form).toBeInstanceOf(HTMLFormElement);

    await act(async () => {
      (form as HTMLFormElement).requestSubmit(getButton("Guardar"));
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain("Este campo es obligatorio.");
    expect(nativeSubmitSpy).not.toHaveBeenCalled();
    expect(submitSpy).not.toHaveBeenCalled();
  });

  test("shows pending feedback while the Evento detail form is saving", () => {
    const formData = new FormData();
    formData.set("intent", "update");

    reactRouterMocks.useFormAction.mockReturnValue(
      "/administracion/eventos/evento_1",
    );
    reactRouterMocks.useNavigation.mockReturnValue({
      formData,
      formMethod: "post",
      state: "submitting",
    });
    reactRouterMocks.useSubmit.mockReturnValue(vi.fn());

    render(
      <AdministracionEventoDetalleRouteView
        loaderData={buildDetailLoaderData()}
      />,
    );

    const submitButton = getButton("Guardando evento...");

    expect(submitButton.disabled).toBe(true);
  });

  test("keeps server field errors visible on the Evento detail form", () => {
    reactRouterMocks.useFormAction.mockReturnValue(
      "/administracion/eventos/evento_1",
    );
    reactRouterMocks.useNavigation.mockReturnValue({ state: "idle" });
    reactRouterMocks.useSubmit.mockReturnValue(vi.fn());

    render(
      <AdministracionEventoDetalleRouteView
        loaderData={buildDetailLoaderData()}
        actionData={{
          status: "error",
          message: "Revisá los datos del evento.",
          fieldErrors: {
            name: "Usá un nombre distinto para el evento.",
          },
          values: {
            name: "Evento 2026",
            registrationStartsAt: "2026-03-01",
            registrationEndsAt: "2026-04-30",
            startsAt: "2026-05-01",
            endsAt: "2026-05-03",
            requiredDepositPercentage: "45",
          },
        }}
      />,
    );

    expect(document.body.textContent).toContain(
      "Usá un nombre distinto para el evento.",
    );
  });
});

function render(element: React.ReactNode) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);

  act(() => {
    root?.render(element);
  });
}

function getButton(label: string) {
  const button = Array.from(document.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.includes(label),
  );

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Expected button "${label}" to be rendered.`);
  }

  return button;
}

function buildDetailLoaderData(): Parameters<
  typeof AdministracionEventoDetalleRouteView
>[0]["loaderData"] {
  return {
    event: {
      id: "evento_1",
      name: "Evento 2026",
      registrationStartsAt: new Date("2026-03-01T03:00:00.000Z"),
      registrationEndsAt: new Date("2026-04-30T03:00:00.000Z"),
      startsAt: new Date("2026-05-01T03:00:00.000Z"),
      endsAt: new Date("2026-05-03T03:00:00.000Z"),
      active: false,
      requiredDepositPercentage: 30,
      programVisible: false,
      resultsVisible: false,
      registrationReady: false,
      registrationReadinessMissingItems: [],
      registrationReadinessDirty: true,
      registrationReadinessCalculatedAt: null,
      createdAt: new Date("2026-01-01T12:00:00.000Z"),
    },
    registrationReadiness: {
      eventId: "evento_1",
      isReady: true,
      missingItems: [],
    },
  };
}

function buildSubmittedEventValues() {
  return {
    name: "Metropolitano 2027",
    registrationStartsAt: "2027-03-01",
    registrationEndsAt: "2027-05-02",
    startsAt: "2027-05-01",
    endsAt: "2027-05-03",
    requiredDepositPercentage: "45",
  };
}

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

import { CategoryDetailView } from "@/features/admin/categories/detail/view";
import {
  EventModalityDetailRouteView,
  NewEventModalityRouteView,
} from "@/features/admin/modalities/route-views";
import { EventPriceDetailRouteView } from "@/features/admin/prices/route-views";
import { EventScheduleDetailRouteView } from "@/features/admin/schedules/route-views";
import type { ActionData } from "@/lib/admin/events/bases-action/shared.server";
import type { EventBasesLoaderData } from "./event-bases.test-helpers";

let container: HTMLDivElement | null = null;
let root: ReturnType<typeof createRoot> | null = null;

describe("Evento bases migrated forms", () => {
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

  for (const { description, formId, navigation, renderView, submitLabel } of [
    {
      description: "modalidades",
      formId: "update-modality-form",
      renderView: () => (
        <EventModalityDetailRouteView
          loaderData={buildLoaderData()}
          modalityId="modality_1"
        />
      ),
      submitLabel: "Guardar",
      navigation: buildPendingNavigation({
        intent: "update-modality",
        id: "modality_1",
      }),
    },
    {
      description: "categorías",
      formId: "update-category-form",
      renderView: () => (
        <CategoryDetailView
          loaderData={buildLoaderData()}
          categoryId="category_1"
        />
      ),
      submitLabel: "Guardar",
      navigation: buildPendingNavigation({
        intent: "update-category",
        id: "category_1",
      }),
    },
    {
      description: "cronogramas",
      formId: "update-schedule-form",
      renderView: () => (
        <EventScheduleDetailRouteView
          loaderData={buildLoaderData()}
          scheduleId="schedule_1"
        />
      ),
      submitLabel: "Guardar",
      navigation: buildPendingNavigation({
        intent: "update-schedule",
        id: "schedule_1",
      }),
    },
    {
      description: "precios",
      formId: "update-price-form",
      renderView: () => (
        <EventPriceDetailRouteView
          loaderData={buildLoaderData()}
          priceId="price_1"
        />
      ),
      submitLabel: "Guardar",
      navigation: buildPendingNavigation({
        intent: "update-price",
        id: "price_1",
      }),
    },
  ]) {
    test(`shows route-pending feedback while ${description} is saving`, () => {
      reactRouterMocks.useFormAction.mockReturnValue("/administracion/recurso");
      reactRouterMocks.useNavigation.mockReturnValue(navigation);
      reactRouterMocks.useSubmit.mockReturnValue(vi.fn());

      render(renderView());

      const submitButton = document.querySelector(`button[form="${formId}"]`);

      expect(submitButton).toBeInstanceOf(HTMLButtonElement);
      expect(submitButton?.textContent).toContain(submitLabel);
      expect((submitButton as HTMLButtonElement).disabled).toBe(true);
    });
  }

  test("submits the modalidad form through React Router instead of form.submit()", async () => {
    const nativeSubmitSpy = vi
      .spyOn(HTMLFormElement.prototype, "submit")
      .mockImplementation(() => {});
    const submitSpy = vi.fn();

    reactRouterMocks.useFormAction.mockReturnValue(
      "/administracion/modalidades/modality_1",
    );
    reactRouterMocks.useNavigation.mockReturnValue({ state: "idle" });
    reactRouterMocks.useSubmit.mockReturnValue(submitSpy);

    render(
      <EventModalityDetailRouteView
        loaderData={buildLoaderData()}
        modalityId="modality_1"
      />,
    );

    const form = document.querySelector("form#update-modality-form");
    const submitButton = document.querySelector(
      'button[form="update-modality-form"]',
    );

    expect(form).toBeInstanceOf(HTMLFormElement);
    expect(submitButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      (form as HTMLFormElement).requestSubmit(
        submitButton as HTMLButtonElement,
      );
      await Promise.resolve();
    });

    expect(nativeSubmitSpy).not.toHaveBeenCalled();
    expect(submitSpy).toHaveBeenCalledTimes(1);
    expect(submitSpy).toHaveBeenCalledWith(
      submitButton,
      expect.objectContaining({
        action: "/administracion/modalidades/modality_1",
        method: "post",
      }),
    );
  });

  test("submits the cronograma detail form through React Router instead of form.submit()", async () => {
    const nativeSubmitSpy = vi
      .spyOn(HTMLFormElement.prototype, "submit")
      .mockImplementation(() => {});
    const submitSpy = vi.fn();

    reactRouterMocks.useFormAction.mockReturnValue(
      "/administracion/cronogramas/schedule_1",
    );
    reactRouterMocks.useNavigation.mockReturnValue({ state: "idle" });
    reactRouterMocks.useSubmit.mockReturnValue(submitSpy);

    render(
      <EventScheduleDetailRouteView
        loaderData={buildLoaderData()}
        scheduleId="schedule_1"
      />,
    );

    const form = document.querySelector("form#update-schedule-form");
    const submitButton = document.querySelector(
      'button[form="update-schedule-form"]',
    );

    expect(form).toBeInstanceOf(HTMLFormElement);
    expect(submitButton).toBeInstanceOf(HTMLButtonElement);

    await act(async () => {
      (form as HTMLFormElement).requestSubmit(
        submitButton as HTMLButtonElement,
      );
      await Promise.resolve();
    });

    expect(nativeSubmitSpy).not.toHaveBeenCalled();
    expect(submitSpy).toHaveBeenCalledTimes(1);
    expect(submitSpy).toHaveBeenCalledWith(
      submitButton,
      expect.objectContaining({
        action: "/administracion/cronogramas/schedule_1",
        method: "post",
      }),
    );
  });

  test("keeps client validation errors visible and blocks route submission", async () => {
    const nativeSubmitSpy = vi
      .spyOn(HTMLFormElement.prototype, "submit")
      .mockImplementation(() => {});
    const submitSpy = vi.fn();

    reactRouterMocks.useFormAction.mockReturnValue(
      "/administracion/modalidades/nueva",
    );
    reactRouterMocks.useNavigation.mockReturnValue({ state: "idle" });
    reactRouterMocks.useSubmit.mockReturnValue(submitSpy);

    render(
      <NewEventModalityRouteView
        loaderData={buildLoaderData()}
        actionData={undefined}
      />,
    );

    const form = document.querySelector("form#create-modality-form");
    const submitButton = document.querySelector(
      'button[form="create-modality-form"]',
    );

    expect(form).toBeInstanceOf(HTMLFormElement);

    await act(async () => {
      (form as HTMLFormElement).requestSubmit(
        submitButton as HTMLButtonElement,
      );
      await Promise.resolve();
    });

    expect(document.body.textContent).toContain("Este campo es obligatorio.");
    expect(nativeSubmitSpy).not.toHaveBeenCalled();
    expect(submitSpy).not.toHaveBeenCalled();
  });

  test("keeps server field errors out of the migrated form fields", () => {
    reactRouterMocks.useFormAction.mockReturnValue(
      "/administracion/modalidades/modality_1",
    );
    reactRouterMocks.useNavigation.mockReturnValue({ state: "idle" });
    reactRouterMocks.useSubmit.mockReturnValue(vi.fn());

    const actionData: ActionData = {
      status: "error",
      message: "Ya existe una modalidad con ese nombre en este evento.",
      fieldErrors: { name: "Usá un nombre distinto para la modalidad." },
      scope: {
        intent: "update-modality",
        recordId: "modality_1",
      },
      values: {
        name: "Jazz",
        submodalities: [],
      },
    };

    render(
      <EventModalityDetailRouteView
        loaderData={buildLoaderData()}
        modalityId="modality_1"
        actionData={actionData}
      />,
    );

    expect(document.body.textContent).not.toContain(
      "Usá un nombre distinto para la modalidad.",
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

function buildPendingNavigation(values: Record<string, string>): {
  formData: FormData;
  formMethod: string;
  state: string;
} {
  return {
    formData: buildFormData(values),
    formMethod: "post",
    state: "submitting",
  };
}

function buildFormData(values: Record<string, string>) {
  const formData = new FormData();

  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }

  return formData;
}

function buildLoaderData(): EventBasesLoaderData {
  const createdAt = new Date("2026-01-01T12:00:00Z");

  return {
    selectedEventId: "event_1",
    requiredDepositPercentage: 30,
    modalities: [
      {
        id: "modality_1",
        eventId: "event_1",
        name: "Jazz",
        createdAt,
      },
    ],
    submodalities: [
      {
        id: "submodality_1",
        eventId: "event_1",
        modalityId: "modality_1",
        name: "Lyrical",
        createdAt,
      },
    ],
    categories: [
      {
        id: "category_1",
        eventId: "event_1",
        name: "Mayores",
        minAge: 18,
        maxAge: 99,
        groupTypes: ["solo"],
        groupTypeKey: "solo",
        experienceLevelKey: "amateur",
        createdAt,
        modalityIds: ["modality_1"],
        experienceLevelIds: ["amateur"],
      },
    ],
    schedules: [
      {
        id: "schedule_1",
        eventId: "event_1",
        name: "Sábado mañana",
        scheduledDate: "2026-05-02",
        startTime: "09:00",
        totalCapacity: 20,
        createdAt,
        modalities: [{ id: "modality_1", name: "Jazz" }],
        modalityIds: ["modality_1"],
        occupiedCapacity: 0,
        scheduleCapacities: [
          {
            id: "schedule_capacity_1",
            scheduleId: "schedule_1",
            groupType: "solo",
            capacity: 8,
            createdAt,
          },
        ],
      },
    ],
    prices: [
      {
        id: "price_1",
        eventId: "event_1",
        name: "General solo",
        groupType: "solo",
        amount: 10000,
        paymentDeadline: "2026-04-30",
        scheduleId: null,
        createdAt,
        schedule: null,
      },
    ],
  };
}

/** @vitest-environment jsdom */

import { act, type ComponentProps } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";

import { EventDetailView } from "@/features/admin/events/detail/view";
import type { EventDetailLoaderData } from "@/features/admin/events/detail/shared";
import { eventDocumentSummaries } from "@/lib/events/event-documents.test-support";
import {
  createReactDomTestRenderer,
  getButton,
} from "@/lib/test-support/react-dom";

const useNavigationMock = vi.hoisted(() => vi.fn());

vi.mock("react-router", async () => {
  const actual =
    await vi.importActual<typeof import("react-router")>("react-router");

  return {
    ...actual,
    useNavigation: useNavigationMock,
  };
});

describe("EventDetailView delete", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(() => {
    renderer.cleanup();
    useNavigationMock.mockReset();
  });

  test("confirms the delete through the shared alert dialog", async () => {
    useNavigationMock.mockReturnValue({ state: "idle" });

    await renderDetail();

    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(document.body.textContent).toContain("Eliminar evento");
    expect(getButton("Eliminar").disabled).toBe(false);
  });

  test("disables the destructive action while its delete submission is pending", async () => {
    const formData = new FormData();
    formData.set("intent", "delete");
    formData.set("id", "event_1");
    useNavigationMock.mockReturnValue({
      formData,
      formMethod: "post",
      state: "submitting",
    });

    await renderDetail();

    expect(getButton("Eliminar").disabled).toBe(true);
  });

  async function renderDetail(
    props: Partial<ComponentProps<typeof EventDetailView>> = {},
  ) {
    const router = createMemoryRouter(
      [
        {
          path: "/administracion/eventos/event_1",
          action: async () => null,
          element: (
            <EventDetailView
              loaderData={buildLoaderData()}
              initialDeleteDialogOpen
              {...props}
            />
          ),
        },
      ],
      { initialEntries: ["/administracion/eventos/event_1"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);
  }
});

describe("EventDetailView tabs", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(() => {
    renderer.cleanup();
    useNavigationMock.mockReset();
  });

  test("splits information and documents into tabs", async () => {
    await renderTabs();

    const triggers = Array.from(
      document.querySelectorAll('[data-slot="tabs-trigger"]'),
    ).map((trigger) => trigger.textContent);

    expect(triggers).toEqual(["Información", "Documentos"]);
  });

  // The documents tab renders an upload form per document, so the event form
  // cannot wrap the tabs. The inscription dates therefore live outside it and
  // are tied back by id — if that association breaks, saving from the documents
  // tab would blank the inscription window instead of leaving it alone.
  test("keeps the inscription dates submitting with the event form", async () => {
    await renderTabs();

    const form = document.querySelector<HTMLFormElement>(
      "#admin-evento-detail-form",
    );
    const registrationStart = document.querySelector<HTMLInputElement>(
      'input[name="registrationStartsAt"]',
    );

    expect(form).not.toBeNull();
    expect(registrationStart).not.toBeNull();
    expect(form?.contains(registrationStart!)).toBe(false);
    expect(registrationStart?.getAttribute("form")).toBe(
      "admin-evento-detail-form",
    );
    expect(Array.from(new FormData(form!).keys())).toContain(
      "registrationStartsAt",
    );
  });

  // forceMount keeps these inputs submittable from either tab; it must not also
  // leave them on screen under Documentos.
  test("hides the information fields while the documents tab is open", async () => {
    await renderTabs();

    const informationPanel = document.querySelector<HTMLElement>(
      '[data-slot="tabs-content"]',
    );

    expect(informationPanel?.dataset.state).toBe("active");

    await act(async () => {
      const trigger = getButton("Documentos");
      trigger.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, button: 0 }),
      );
      trigger.focus();
      trigger.click();
    });

    // forceMount stops Radix from setting `hidden`, so the class is what
    // actually hides the panel. Asserting it keeps the two in step.
    expect(informationPanel?.dataset.state).toBe("inactive");
    expect(informationPanel?.className).toContain(
      "data-[state=inactive]:hidden",
    );
    expect(
      document.querySelector('input[name="registrationStartsAt"]'),
    ).not.toBeNull();
  });

  test("keeps the upload forms out of the event form", async () => {
    await renderTabs();

    const form = document.querySelector<HTMLFormElement>(
      "#admin-evento-detail-form",
    );

    expect(form?.querySelector("form")).toBeNull();
  });

  async function renderTabs() {
    useNavigationMock.mockReturnValue({ state: "idle" });

    const router = createMemoryRouter(
      [
        {
          path: "/administracion/eventos/event_1",
          action: async () => null,
          element: <EventDetailView loaderData={buildLoaderData()} />,
        },
      ],
      { initialEntries: ["/administracion/eventos/event_1"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);
  }
});

function buildLoaderData(): EventDetailLoaderData {
  return {
    documents: eventDocumentSummaries(),
    event: {
      id: "event_1",
      name: "Festival 2026",
      active: true,
      programVisible: false,
      resultsVisible: false,
      requiredDepositPercentage: 30,
      registrationStartsAt: new Date("2026-01-01T00:00:00Z"),
      registrationEndsAt: new Date("2026-02-01T00:00:00Z"),
      startsAt: new Date("2026-03-01T00:00:00Z"),
      endsAt: new Date("2026-03-02T00:00:00Z"),
      registrationReady: true,
      registrationReadinessMissingItems: [],
      registrationReadinessDirty: false,
      registrationReadinessCalculatedAt: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    },
    registrationReadiness: {
      eventId: "event_1",
      isReady: true,
      missingItems: [],
    },
  };
}

/** @vitest-environment jsdom */

import { act, type ComponentProps } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";

import { EventDetailView } from "@/features/admin/events/detail/view";
import type { EventDetailLoaderData } from "@/features/admin/events/detail/shared";
import {
  eventDocumentFileField,
  eventDocumentKeptField,
} from "@/features/admin/events/detail/shared";
import { eventDocumentKinds } from "@/lib/events/event-documents";
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

describe("EventDetailView form", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(() => {
    renderer.cleanup();
    useNavigationMock.mockReset();
  });

  // One "Guardar" for the event and its three PDFs. That is only possible while
  // nothing nests a form inside the event form, so the documents are fields.
  test("carries the documents as fields of the single event form", async () => {
    await renderForm();

    const form = getEventForm();

    expect(document.querySelector('[data-slot="tabs-trigger"]')).toBeNull();
    expect(form.querySelector("form")).toBeNull();
    expect(form.getAttribute("enctype")).toBe("multipart/form-data");
    expect(
      form.querySelector<HTMLInputElement>('input[name="intent"]')?.value,
    ).toBe("update");

    for (const kind of eventDocumentKinds) {
      expect(
        form.querySelector(`input[name="${eventDocumentFileField(kind)}"]`),
      ).not.toBeNull();
    }
  });

  test("keeps every field on the same submission", async () => {
    await renderForm();

    const submitted = Array.from(new FormData(getEventForm()).keys());

    expect(submitted).toContain("name");
    expect(submitted).toContain("registrationStartsAt");
    expect(submitted).toContain(eventDocumentKeptField("professor_contract"));
  });

  test("holds Guardar until something changes", async () => {
    await renderForm();

    expect(getButton("Guardar").disabled).toBe(true);

    await act(async () => {
      setInputValue(
        document.querySelector<HTMLInputElement>('input[name="name"]')!,
        "Festival 2027",
      );
    });

    expect(getButton("Guardar").disabled).toBe(false);
  });

  // The "kept" fields start out matching what the loader returned. If they read
  // as empty on the first render the card would offer to save a removal of
  // every document already uploaded.
  test("does not read an uploaded document as a pending removal", async () => {
    await renderForm({
      documents: eventDocumentSummaries({
        professor_contract: {
          downloadUrl: "/almacenamiento?key=contrato",
          uploadedAt: new Date("2026-05-04T15:00:00Z"),
        },
      }),
    });

    expect(getButton("Guardar").disabled).toBe(true);
    expect(
      document.querySelector('a[href="/almacenamiento?key=contrato"]'),
    ).not.toBeNull();
  });

  // An alert about the whole event is not a field: it belongs above the card,
  // where the stack owns the spacing between however many of them there are.
  test("renders the readiness alert above the card", async () => {
    await renderForm({
      registrationReadiness: {
        eventId: "event_1",
        isReady: false,
        missingItems: [
          { code: "prices", detail: "Sin precios.", label: "Precios" },
        ],
      },
    });

    const alert = document.querySelector('[data-slot="alert"]');
    const card = document.querySelector('[data-slot="card"]');

    expect(alert).not.toBeNull();
    expect(card?.contains(alert!)).toBe(false);
    expect(
      alert!.compareDocumentPosition(card!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  function getEventForm() {
    const form = document.querySelector<HTMLFormElement>("form[enctype]");

    expect(form).not.toBeNull();

    return form!;
  }

  function setInputValue(input: HTMLInputElement, value: string) {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  async function renderForm(overrides: Partial<EventDetailLoaderData> = {}) {
    useNavigationMock.mockReturnValue({ state: "idle" });

    const router = createMemoryRouter(
      [
        {
          path: "/administracion/eventos/event_1",
          action: async () => null,
          element: (
            <EventDetailView
              loaderData={{ ...buildLoaderData(), ...overrides }}
            />
          ),
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

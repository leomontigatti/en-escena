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
import { eventFormValues } from "@/lib/admin/events/form-values";
import { eventDocumentSummaries } from "@/lib/events/event-documents.test-support";
import {
  clickReactDomButton,
  createReactDomTestRenderer,
  findButton,
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

  test("disables the destructive action while its delete submission is pending", async () => {
    const formData = new FormData();
    formData.set("intent", "delete");
    formData.set("id", "event_1");
    useNavigationMock.mockReturnValue({
      formData,
      formMethod: "post",
      state: "submitting",
    });

    await renderDetail({ loaderData: buildFreeLoaderData() });

    expect(getButton("Eliminar").disabled).toBe(true);
  });

  // The active event and one with choreographies cannot be deleted: the item
  // stays enabled and the click lists why, instead of a refusal after submit.
  test("answers Eliminar with why the event cannot be deleted", async () => {
    useNavigationMock.mockReturnValue({ state: "idle" });

    await renderDetail({
      initialDeleteDialogOpen: true,
      loaderData: { ...buildLoaderData(), hasChoreographies: true },
    });

    const dialog = document.querySelector('[role="alertdialog"]');

    expect(dialog?.querySelector("h2")?.textContent).toBe(
      "No se puede eliminar el evento",
    );
    expect(dialog?.textContent).toContain("Es el evento activo.");
    expect(dialog?.textContent).toContain("Tiene coreografías inscriptas.");
    expect(dialog?.querySelector('button[type="submit"]')).toBeNull();
  });

  test("asks to confirm Eliminar on an inactive event without choreographies", async () => {
    useNavigationMock.mockReturnValue({ state: "idle" });

    await renderDetail({
      initialDeleteDialogOpen: true,
      loaderData: buildFreeLoaderData(),
    });

    expect(document.querySelector('[role="alertdialog"] h2')?.textContent).toBe(
      "¿Eliminar el evento?",
    );
  });

  // Choreographies were inscribed against the dates and the deposit: the
  // fields read as locked before anything is typed, and the alert says why.
  test("locks the dates and the deposit while choreographies are inscribed", async () => {
    useNavigationMock.mockReturnValue({ state: "idle" });

    await renderDetail({
      initialDeleteDialogOpen: false,
      loaderData: { ...buildLoaderData(), hasChoreographies: true },
    });

    expect(document.body.textContent).toContain(
      "Las fechas y la seña no se pueden cambiar",
    );
    expect(document.body.textContent).toContain(
      "Tiene coreografías inscriptas.",
    );
    expect(
      document.querySelector<HTMLInputElement>(
        'input[name="requiredDepositPercentage"]',
      )?.value,
    ).toBe("30");
    expect(
      document.querySelector<HTMLInputElement>('input[name="startsAt"]')?.value,
      // The fixture's midnight UTC is still the previous day in the business
      // time zone.
    ).toBe("2026-02-28");
    expect(
      Array.from(document.querySelectorAll<HTMLInputElement>("input[readonly]"))
        .length,
    ).toBe(3);
  });

  // A structural edit refused because a choreography was inscribed meanwhile
  // comes back as the draft; the locked fields must still show and post the
  // saved values, or every later save would be refused too.
  test("locks the saved dates and deposit, not a refused draft of them", async () => {
    useNavigationMock.mockReturnValue({ state: "idle" });

    await renderDetail({
      actionData: {
        status: "error",
        message:
          "No se pueden editar fechas ni seña con dependencias operativas.",
        fieldErrors: {},
        values: {
          ...eventFormValues(buildLoaderData().event),
          requiredDepositPercentage: "45",
          startsAt: "2026-02-20",
        },
      },
      initialDeleteDialogOpen: false,
      loaderData: { ...buildLoaderData(), hasChoreographies: true },
    });

    expect(
      document.querySelector<HTMLInputElement>(
        'input[name="requiredDepositPercentage"]',
      )?.value,
    ).toBe("30");
    expect(
      document.querySelector<HTMLInputElement>('input[name="startsAt"]')?.value,
    ).toBe("2026-02-28");
  });

  test("leaves the dates and the deposit editable on an event without choreographies", async () => {
    useNavigationMock.mockReturnValue({ state: "idle" });

    await renderDetail({
      initialDeleteDialogOpen: false,
      loaderData: buildFreeLoaderData(),
    });

    expect(document.body.textContent).not.toContain(
      "Las fechas y la seña no se pueden cambiar",
    );
    expect(document.querySelectorAll("input[readonly]")).toHaveLength(0);
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

  test("keeps every field on the same submission", async () => {
    await renderForm();

    const submitted = Array.from(new FormData(getEventForm()).keys());

    expect(submitted).toContain("name");
    expect(submitted).toContain("startsAt");
    expect(submitted).toContain("endsAt");
    expect(submitted).not.toContain("registrationStartsAt");
    expect(submitted).toContain(eventDocumentKeptField("professor_contract"));
  });

  test("holds `Guardar` until something changes", async () => {
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

  // The generic per-code line cannot say which category is missing, so this is
  // the one readiness failure whose own detail reaches the alert.
  test("shows the uncovered ages of an age-coverage failure", async () => {
    await renderForm({
      registrationReadiness: {
        eventId: "event_1",
        isReady: false,
        missingItems: [
          {
            code: "age-coverage",
            label: "Cobertura de edades",
            detail:
              "Faltan categorías para Modalidad Acrobacias Aéreas, Tipo de grupo Solo: sin cobertura para las edades 1 a 4.",
          },
        ],
      },
    });

    const alert = document.querySelector('[data-slot="alert"]');

    expect(alert?.textContent).toContain(
      "Faltan categorías para Modalidad Acrobacias Aéreas, Tipo de grupo Solo: sin cobertura para las edades 1 a 4.",
    );
    expect(
      alert?.querySelector('a[href="/administracion/categorias"]'),
    ).not.toBeNull();
  });

  // Radix unmounts an inactive panel, and an unmounted input is not submitted:
  // without `forceMount` a tab switch would post empty identifiers — clearing
  // them — and drop a PDF chosen in a native file input.
  test("force-mounts both tab panels, hiding the one that is not showing", async () => {
    await renderForm();

    const panels = Array.from(
      document.querySelectorAll('[data-slot="tabs-content"]'),
    );

    expect(panels).toHaveLength(2);
    expect(panels.map((panel) => panel.getAttribute("data-state"))).toEqual([
      "active",
      "inactive",
    ]);
    expect(panels[1]!.className).toContain("data-[state=inactive]:hidden");
    expect(
      Array.from(document.querySelectorAll('[data-slot="tabs-trigger"]')).map(
        (trigger) => trigger.textContent,
      ),
    ).toEqual(["Documentos", "Instrucciones de pago"]);

    // The hidden panel's fields still ride the one submission.
    const submitted = Array.from(new FormData(getEventForm()).keys());

    expect(submitted).toContain("paymentInstructionsCbu");
    expect(submitted).toContain("paymentInstructionsText");
    expect(submitted).toContain(eventDocumentFileField("professor_contract"));
  });

  test("brings the instructions tab forward when the submit fails there, and leaves it there while the field is fixed", async () => {
    await renderForm();

    await act(async () => {
      setInputValue(getInput("paymentInstructionsCbu"), "123");
    });
    await submitEventForm();

    const trigger = getTabTrigger("Instrucciones de pago");

    expect(trigger.getAttribute("data-state")).toBe("active");
    expect(trigger.querySelector("svg")).not.toBeNull();

    // Keyed on the submit count, not on the errors: fixing the field mid-typing
    // must not yank the tab back under the administration's hands.
    await act(async () => {
      setInputValue(getInput("paymentInstructionsCbu"), validCbu);
    });

    expect(
      getTabTrigger("Instrucciones de pago").getAttribute("data-state"),
    ).toBe("active");
  });

  // The cap is the one rule a person can cross while typing, so it does not
  // wait for a submit: the field's own invalid state turns the label, the
  // border and the ring destructive, and the counter is told separately.
  test("marks the how-to-pay text invalid as it crosses the cap, without a submit", async () => {
    await renderForm();

    const textarea = document.querySelector<HTMLTextAreaElement>(
      'textarea[name="paymentInstructionsText"]',
    )!;

    await act(async () => {
      setTextareaValue(textarea, "a".repeat(2001));
    });

    expect(textarea.getAttribute("aria-invalid")).toBe("true");
    expect(document.body.textContent).toContain("2001 / 2000");

    await act(async () => {
      setTextareaValue(textarea, "a");
    });

    expect(textarea.getAttribute("aria-invalid")).toBeNull();
    expect(document.body.textContent).toContain("1 / 2000");
  });

  // The counter and the schema measure the same text: the column stores it
  // trimmed, so 2000 characters plus a trailing newline is a text the save
  // accepts and the field must not paint destructive.
  test("counts the how-to-pay text trimmed, as the schema and the column do", async () => {
    await renderForm();

    const textarea = getInstructionsTextarea();

    await act(async () => {
      setTextareaValue(textarea, `${"a".repeat(2000)}\n  `);
    });

    expect(textarea.getAttribute("aria-invalid")).toBeNull();
    expect(document.body.textContent).toContain("2000 / 2000");
  });

  // Clearing the instructions is a plain save: text can be retyped, a PDF
  // cannot, so only the documents earn a confirmation.
  test("saves with every instruction field empty without opening the documents dialog", async () => {
    await renderForm();

    await act(async () => {
      setInputValue(getInput("name"), "Festival 2027");
    });
    await submitEventForm();

    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  });

  test("still confirms before a save that removes a document", async () => {
    await renderForm({
      documents: eventDocumentSummaries({
        professor_contract: {
          downloadUrl: "/almacenamiento?key=contrato",
          uploadedAt: new Date("2026-05-04T15:00:00Z"),
        },
      }),
    });

    await clickReactDomButton("Quitar contrato para profesores");
    await submitEventForm();

    expect(document.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(document.body.textContent).toContain("Confirmar los cambios");
  });

  function getInput(name: string) {
    const input = document.querySelector<HTMLInputElement>(
      `input[name="${name}"]`,
    );

    expect(input).not.toBeNull();

    return input!;
  }

  function getInstructionsTextarea() {
    const textarea = document.querySelector<HTMLTextAreaElement>(
      'textarea[name="paymentInstructionsText"]',
    );

    expect(textarea).not.toBeNull();

    return textarea!;
  }

  function getTabTrigger(label: string) {
    const trigger = Array.from(
      document.querySelectorAll('[data-slot="tabs-trigger"]'),
    ).find((candidate) => candidate.textContent?.includes(label));

    expect(trigger).toBeDefined();

    return trigger!;
  }

  async function submitEventForm() {
    await act(async () => {
      getEventForm().requestSubmit();
      await Promise.resolve();
    });
  }

  function setTextareaValue(textarea: HTMLTextAreaElement, value: string) {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }

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

/** A CBU whose two check digits agree — PRD #895's fixture. */
const validCbu = "0070099330004512345678";

/** An inactive event nothing is inscribed on: nothing locked, deletable. */
function buildFreeLoaderData(): EventDetailLoaderData {
  const loaderData = buildLoaderData();

  return { ...loaderData, event: { ...loaderData.event, active: false } };
}

function buildLoaderData(): EventDetailLoaderData {
  return {
    documents: eventDocumentSummaries(),
    hasChoreographies: false,
    event: {
      id: "event_1",
      name: "Festival 2026",
      active: true,
      resultsPublishedAt: null,
      requiredDepositPercentage: 30,
      startsAt: new Date("2026-03-01T00:00:00Z"),
      endsAt: new Date("2026-03-02T00:00:00Z"),
      registrationReady: true,
      registrationReadinessMissingItems: [],
      registrationReadinessDirty: false,
      registrationReadinessCalculatedAt: null,
      paymentInstructionsCbu: null,
      paymentInstructionsAlias: null,
      paymentInstructionsHolderName: null,
      paymentInstructionsBankName: null,
      paymentInstructionsHolderCuit: null,
      paymentInstructionsText: null,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    },
    registrationReadiness: {
      eventId: "event_1",
      isReady: true,
      missingItems: [],
    },
  };
}

describe("EventDetailView results", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(() => {
    renderer.cleanup();
    useNavigationMock.mockReset();
  });

  // The publication moved to the results list (#1439).
  test("offers nothing about results, in the menu or above the form", async () => {
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
    await openActionsMenu();

    const labels = Array.from(
      document.querySelectorAll('[role="menuitem"]'),
    ).map((item) => item.textContent?.trim() ?? "");

    expect(labels.some((label) => label.includes("resultados"))).toBe(false);
  });
});

async function openActionsMenu() {
  const button = findButton("Acciones", { exact: true });

  if (!button) {
    throw new Error("Expected the event actions button to be rendered.");
  }

  const pointerDown = new MouseEvent("pointerdown", {
    bubbles: true,
    button: 0,
    cancelable: true,
  });
  Object.defineProperty(pointerDown, "pointerType", { value: "mouse" });

  await act(async () => {
    button.dispatchEvent(pointerDown);
    button.dispatchEvent(
      new MouseEvent("pointerup", {
        bubbles: true,
        button: 0,
        cancelable: true,
      }),
    );
    await Promise.resolve();
  });
}

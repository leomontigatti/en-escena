/** @vitest-environment jsdom */

import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { renderInDataRouter } from "@/lib/test-support/data-router";
import {
  createReactDomTestRenderer,
  findButton,
} from "@/lib/test-support/react-dom";
import { DancerDetailRouteView } from "@/routes/administracion.bailarines_.$dancerId";

type DetailRouteViewProps = Parameters<typeof DancerDetailRouteView>[0];

describe("DancerDetailRouteView", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  // Taking part in the active event is the normal state of most of the roster,
  // so `Archivar` stays enabled and says why on the click instead of an alert
  // that would sit on nearly every dancer (style guide, Detail pages).
  test("opens the blocked acknowledgment when archiving a participant", async () => {
    await renderDetailIntoDocument(
      createLoaderData({ isParticipatingInActiveEvent: true }),
    );

    expect(document.body.textContent).not.toContain("No se puede archivar");

    await openActionsMenu();
    await clickMenuItem("Archivar");

    expect(document.body.textContent).toContain(
      "No se puede archivar al bailarín",
    );
    expect(document.body.textContent).not.toContain("¿Archivar al bailarín?");
  });

  test("asks to confirm archiving a dancer outside the active event", async () => {
    await renderDetailIntoDocument(createLoaderData());

    await openActionsMenu();
    await clickMenuItem("Archivar");

    expect(document.body.textContent).toContain("¿Archivar al bailarín?");
    expect(document.body.textContent).not.toContain("No se puede archivar");
  });

  async function renderDetailIntoDocument(
    loaderData: DetailRouteViewProps["loaderData"],
  ) {
    const router = createMemoryRouter(
      [
        {
          path: "/administracion/bailarines/dancer-1",
          action: async () => null,
          element: <DancerDetailRouteView loaderData={loaderData} />,
        },
      ],
      { initialEntries: ["/administracion/bailarines/dancer-1"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);
  }

  test("renders the ficha for auditors with disabled fields and only Volver", () => {
    const markup = renderDetailView({
      loaderData: createLoaderData({ canEdit: false }),
    });

    expect(markup).toContain("Julia Detalle");
    expect(markup).toContain("Academia Test");
    expect(markup).toContain("Julia");
    expect(markup).toContain("Detalle");
    expect(markup).toContain("Identificación");
    expect(markup).toContain("Inscripciones");
    expect(markup).toContain(
      "La documentación está lista para verificar la identidad del bailarín.",
    );
    expect(markup).toContain("Volver");
    expect(markup).not.toContain("Editar");
    expect(markup).not.toContain("Cancelar");
    expect(markup).not.toContain("Guardar");
    expect(markup).not.toContain("Descartar cambios");
    expect(markup).not.toContain("Acciones");
    expect(markup).not.toContain("Verificar");
  });

  test("renders the fields editable in place with Guardar and no edit mode", () => {
    const markup = renderDetailView({
      loaderData: createLoaderData(),
    });

    expect(markup).toContain('name="firstName" value="Julia"');
    expect(markup).toContain('name="lastName" value="Detalle"');
    expect(markup).toContain('name="birthDate" value="2012-07-12"');
    expect(markup).toContain('name="documentNumber" value="12345678"');
    expect(markup).toContain("Guardar");
    expect(markup).not.toContain("Cancelar");
    expect(markup).not.toContain("Editar");
  });

  // The refusal itself lands on the field through an effect, which server
  // rendering never runs; the link to the match is what this markup shows.
  test("links to the dancer already holding the document", () => {
    const markup = renderDetailView({
      loaderData: createLoaderData(),
      actionData: {
        status: "error",
        message: "Revisá los datos del Bailarín.",
        fieldErrors: {
          documentNumber:
            "Ya existe un bailarín archivado con ese documento en la academia.",
        },
        values: {
          firstName: "Julia",
          lastName: "Detalle",
          birthDate: "2012-07-12",
          documentType: "dni",
          documentNumber: "30111222",
          documentFrontImageStorageKey: "",
          documentBackImageStorageKey: "",
        },
        duplicateDocumentDancerId: "dancer-archivado-1",
      },
    });

    expect(markup).toContain(
      'href="/administracion/bailarines/dancer-archivado-1"',
    );
    expect(markup).toContain("Ver la ficha del bailarín con ese documento");
  });

  test("keeps what was typed when a save is warned about a same-name match", () => {
    const markup = renderDetailView({
      loaderData: createLoaderData(),
      actionData: {
        status: "warning",
        warning: {
          kind: "dancer-name",
          matches: [{ id: "dancer-twin-1", label: "Ana Paz" }],
          scope: "admin",
        },
        values: {
          firstName: "Ana",
          lastName: "Paz",
          birthDate: "2012-07-12",
          documentType: "",
          documentNumber: "",
          documentFrontImageStorageKey: "",
          documentBackImageStorageKey: "",
        },
      },
    });

    // The confirmation is a portalled dialog, which static markup never
    // renders; DuplicateWarningPrompt's own test and the portal dancer
    // draft test cover it.
    expect(markup).toContain('name="firstName" value="Ana"');
  });
});

function renderDetailView(input: Partial<DetailRouteViewProps> = {}) {
  return renderToStaticMarkup(
    renderInDataRouter(
      "/administracion/bailarines/dancer-1",
      <DancerDetailRouteView
        loaderData={input.loaderData ?? createLoaderData()}
        actionData={input.actionData}
      />,
    ),
  );
}

function createLoaderData(
  overrides: Partial<DetailRouteViewProps["loaderData"]> = {},
): DetailRouteViewProps["loaderData"] {
  return {
    activeEventStartDate: "2026-09-25",
    backToList: "/administracion/bailarines",
    canEdit: true,
    dancer: {
      academy: {
        contactName: "Contacto Test",
        email: "academia@example.com",
        id: "academy-1",
        name: "Academia Test",
        phone: "1234-5678",
      },
      active: true,
      birthDate: "2012-07-12",
      choreographyNames: [],
      editConsequence: null,
      createdAt: new Date("2026-01-10T12:00:00.000Z"),
      documentBackImageStorageKey: "document-back",
      documentFrontImageStorageKey: "document-front",
      documentNumber: "12345678",
      documentType: "dni",
      firstName: "Julia",
      id: "dancer-1",
      identificationStatus: "unverified",
      identityVerifiedAt: null,
      inscriptions: [],
      lastName: "Detalle",
      participatedInAnyEvent: false,
      participationStatus: "not-participating",
      updatedAt: new Date("2026-01-10T12:00:00.000Z"),
    },
    documentImageUrls: {
      back: null,
      front: null,
    },
    isParticipatingInActiveEvent: false,
    merge: null,
    selectedEventId: null,
    ...overrides,
  };
}

async function openActionsMenu() {
  const button = findButton("Acciones", { exact: true });

  if (!button) {
    throw new Error("Expected the dancer actions button to be rendered.");
  }

  const pointerDown = new MouseEvent("pointerdown", {
    bubbles: true,
    button: 0,
    cancelable: true,
    ctrlKey: false,
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

async function clickMenuItem(label: string) {
  const item = Array.from(document.querySelectorAll('[role="menuitem"]')).find(
    (candidate) => candidate.textContent?.trim() === label,
  );

  if (!item) {
    throw new Error(`Expected menu item "${label}" to be rendered.`);
  }

  await act(async () => {
    item.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
    await Promise.resolve();
  });
}

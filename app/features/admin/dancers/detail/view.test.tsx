/** @vitest-environment jsdom */

import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { renderInDataRouter } from "@/lib/test-support/data-router";
import {
  clickReactDomButton,
  createReactDomTestRenderer,
  setInputValue,
  waitFor,
} from "@/lib/test-support/react-dom";
import { DancerDetailRouteView } from "@/routes/administracion.bailarines_.$dancerId";

type DetailRouteViewProps = Parameters<typeof DancerDetailRouteView>[0];

describe("DancerDetailRouteView", () => {
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

describe("DancerDetailRouteView tabs", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  // Radix unmounts an inactive panel, and an unmounted input is not submitted:
  // without `forceMount` a look at the inscriptions would post an empty
  // birthdate and document, and the save would be refused (#1274).
  test("saves the identification fields from the inscriptions tab", async () => {
    let submitted: FormData | null = null;

    // A form with no `action` posts to the document's URL, which a memory
    // router does not move: without this the save would leave the page.
    window.history.replaceState({}, "", "/administracion/bailarines/dancer-1");

    const router = createMemoryRouter(
      [
        {
          path: "/administracion/bailarines/dancer-1",
          action: async ({ request }) => {
            submitted = await request.formData();

            return null;
          },
          element: <DancerDetailRouteView loaderData={createLoaderData()} />,
        },
      ],
      { initialEntries: ["/administracion/bailarines/dancer-1"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);
    await act(async () => {
      setInputValue(
        document.querySelector<HTMLInputElement>('input[name="firstName"]')!,
        "Julieta",
      );
    });
    await selectTab("Inscripciones");
    await clickReactDomButton("Guardar");
    await waitFor(() => submitted !== null);

    expect(Object.fromEntries(submitted!)).toMatchObject({
      birthDate: "2012-07-12",
      documentNumber: "12345678",
      documentType: "dni",
      firstName: "Julieta",
      lastName: "Detalle",
    });
  });

  async function selectTab(label: string) {
    const trigger = Array.from(
      document.querySelectorAll('[data-slot="tabs-trigger"]'),
    ).find((candidate) => candidate.textContent === label);

    // Radix activates a trigger on `mousedown`, not on the click after it.
    await act(async () => {
      trigger!.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
      );
    });

    expect(trigger!.getAttribute("data-state")).toBe("active");
  }
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

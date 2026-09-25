import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";

import { PortalDancerDetailRouteView } from "@/features/portal/dancers/detail/view";

type DancerDetailViewProps = Parameters<typeof PortalDancerDetailRouteView>[0];

describe("PortalDancerDetailRouteView", () => {
  test("shows the same-name warning with the continue action and the ids", () => {
    const markup = renderDancerDetail({
      actionData: {
        status: "warning",
        warning: {
          kind: "dancer-name",
          matches: [{ id: "dancer_twin_1", label: "Ana Paz" }],
          scope: "portal",
        },
        values: {
          firstName: "Ana",
          lastName: "Paz",
          birthDate: "2014-01-01",
          documentType: "",
          documentNumber: "",
          documentFrontImageStorageKey: "",
          documentBackImageStorageKey: "",
        },
      },
    });

    expect(markup).toContain(
      "Ya existe un Bailarín con el mismo nombre y fecha de nacimiento en tu academia: Ana Paz. ¿Es la misma persona?",
    );
    expect(markup).toContain(
      'name="acknowledgedDuplicateIds" value="dancer_twin_1"',
    );
    expect(markup).toContain("Continuar de todos modos");
    expect(markup).toContain('name="firstName" value="Ana"');
  });

  test("shows missing document images in the incomplete alert", () => {
    const markup = renderDancerDetail({
      loaderData: dancerDetailLoaderData({
        dancer: dancerDetailRow({
          documentType: "dni",
          documentNumber: "12345678",
        }),
      }),
    });

    expect(markup).toContain(
      "Faltan completar frente del documento y dorso del documento para poder verificar la identidad del bailarín.",
    );
  });

  test("shows missing document data in the incomplete alert", () => {
    const markup = renderDancerDetail({
      loaderData: dancerDetailLoaderData({
        dancer: dancerDetailRow({
          documentFrontImageStorageKey: "dancers/front.jpg",
          documentBackImageStorageKey: "dancers/back.jpg",
        }),
        documentImageUrls: {
          front: "https://storage.example/front.jpg",
          back: "https://storage.example/back.jpg",
        },
      }),
    });

    expect(markup).toContain(
      "Faltan completar tipo de documento y número de documento para poder verificar la identidad del bailarín.",
    );
    // The images are loaded, so the alert must not enumerate them. Their field
    // labels carry the same words, hence the longer fragments.
    expect(markup).not.toContain("completar frente del documento");
    expect(markup).not.toContain("y dorso del documento para poder");
  });

  test("shows unverified alert when document data and images are complete", () => {
    const markup = renderDancerDetail({
      loaderData: dancerDetailLoaderData({
        dancer: dancerDetailRow({
          documentType: "dni",
          documentNumber: "12345678",
          documentFrontImageStorageKey: "dancers/front.jpg",
          documentBackImageStorageKey: "dancers/back.jpg",
        }),
        documentImageUrls: {
          front: "https://storage.example/front.jpg",
          back: "https://storage.example/back.jpg",
        },
      }),
    });

    expect(markup).toContain("La identidad del bailarín está sin verificar.");
    expect(markup).toContain('data-slot="alert"');
    expect(markup).toContain("https://storage.example/front.jpg");
    expect(markup).toContain("https://storage.example/back.jpg");
    expect(markup).not.toContain("Imagen cargada");
    expect(markup).not.toContain("Faltan completar");
  });

  test("preserves submitted values without rendering server field errors inline", () => {
    const markup = renderDancerDetail({
      actionData: {
        status: "error",
        message: "Revisá los campos marcados.",
        fieldErrors: {
          documentType: "Seleccioná el tipo de documento.",
          documentNumber: "Ingresá el número de documento.",
        },
        values: {
          firstName: "Ana",
          lastName: "Alvarez",
          birthDate: "2014-02-01",
          documentType: "",
          documentNumber: "",
          documentFrontImageStorageKey: "",
          documentBackImageStorageKey: "",
        },
      },
    });

    expect(markup).not.toContain("Seleccioná el tipo de documento.");
    expect(markup).not.toContain("Ingresá el número de documento.");
    expect(markup).toContain('name="firstName" value="Ana"');
    expect(markup).toContain('name="birthDate" value="2014-02-01"');
  });
});

function renderDancerDetail(input: Partial<DancerDetailViewProps> = {}) {
  const router = createMemoryRouter(
    [
      {
        path: "/portal/bailarines/:dancerId",
        action: async () => null,
        element: (
          <PortalDancerDetailRouteView
            loaderData={input.loaderData ?? dancerDetailLoaderData()}
            actionData={input.actionData}
            initialStatusDialogIntent={input.initialStatusDialogIntent}
          />
        ),
      },
    ],
    { initialEntries: ["/portal/bailarines/dancer_edit_1"] },
  );

  return renderToStaticMarkup(<RouterProvider router={router} />);
}

function dancerDetailLoaderData(
  overrides: Partial<DancerDetailViewProps["loaderData"]> = {},
) {
  return {
    activeEventStartDate: "2026-09-25",
    documentImageUrls: {
      front: null,
      back: null,
    },
    dancer: dancerDetailRow(),
    inscriptions: [],
    isParticipatingInActiveEvent: false,
    selectedEventId: "event_1",
    ...overrides,
  } satisfies DancerDetailViewProps["loaderData"];
}

function dancerDetailRow(
  overrides: Partial<DancerDetailViewProps["loaderData"]["dancer"]> = {},
) {
  return {
    id: "dancer_1",
    academyId: "academy_1",
    firstName: "Bailarina",
    lastName: "Prueba",
    active: true,
    birthDate: "2015-01-01",
    documentType: null,
    documentNumber: null,
    documentFrontImageStorageKey: null,
    documentBackImageStorageKey: null,
    identityVerifiedAt: null,
    createdAt: new Date("2026-01-01T12:00:00Z"),
    updatedAt: new Date("2026-01-02T12:00:00Z"),
    ...overrides,
  } satisfies DancerDetailViewProps["loaderData"]["dancer"];
}

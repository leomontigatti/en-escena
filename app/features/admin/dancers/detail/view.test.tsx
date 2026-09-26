import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { renderInDataRouter } from "@/lib/test-support/data-router";
import { DancerDetailRouteView } from "@/routes/administracion.bailarines_.$dancerId";

type DetailRouteViewProps = Parameters<typeof DancerDetailRouteView>[0];

describe("DancerDetailRouteView", () => {
  test("renders the readonly ficha for auditors without edit actions", () => {
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
    expect(markup).not.toContain("Acciones");
    expect(markup).not.toContain("Verificar");
  });

  test("renders edit controls and save/cancel actions in edit mode", () => {
    const markup = renderDetailView({
      loaderData: createLoaderData({ isEditing: true }),
    });

    expect(markup).toContain('name="firstName" value="Julia"');
    expect(markup).toContain('name="lastName" value="Detalle"');
    expect(markup).toContain('name="birthDate" value="2012-07-12"');
    expect(markup).toContain('name="documentNumber" value="12345678"');
    expect(markup).toContain("Cancelar");
    expect(markup).toContain("Guardar");
    expect(markup).not.toContain(">Editar<");
  });

  // The refusal itself lands on the field through an effect, which server
  // rendering never runs; the link to the match is what this markup shows.
  test("links to the dancer already holding the document", () => {
    const markup = renderDetailView({
      loaderData: createLoaderData({ isEditing: true }),
      actionData: {
        status: "error",
        message: "Revisá los datos del Bailarín.",
        fieldErrors: {
          documentNumber:
            "Ya existe un Bailarín archivado con ese documento en la academia.",
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

  test("shows the same-name warning with the continue action and the ids", () => {
    const markup = renderDetailView({
      loaderData: createLoaderData({ isEditing: true }),
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

    expect(markup).toContain(
      "Ya existe un Bailarín con el mismo nombre y fecha de nacimiento en la academia: Ana Paz. ¿Es la misma persona?",
    );
    expect(markup).toContain(
      'name="acknowledgedDuplicateIds" value="dancer-twin-1"',
    );
    expect(markup).toContain("Continuar de todos modos");
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
    cancelHref: "/administracion/bailarines/dancer-1",
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
    editHref: "/administracion/bailarines/dancer-1?modo=editar",
    isEditing: false,
    isParticipatingInActiveEvent: false,
    merge: null,
    selectedEventId: null,
    ...overrides,
  };
}

import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";

import { AdministracionBailarinDetalleRouteView } from "@/routes/administracion.bailarines_.$dancerId";

type DetailRouteViewProps = Parameters<
  typeof AdministracionBailarinDetalleRouteView
>[0];

describe("AdministracionBailarinDetalleRouteView", () => {
  test("renders the readonly ficha for auditors without edit actions", () => {
    const markup = renderDetailView({
      loaderData: createLoaderData({ canEdit: false }),
    });

    expect(markup).toContain("Detalle bailarín");
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
});

function renderDetailView(input: Partial<DetailRouteViewProps> = {}) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/administracion/bailarines/dancer-1"]}>
      <AdministracionBailarinDetalleRouteView
        loaderData={input.loaderData ?? createLoaderData()}
        actionData={input.actionData}
      />
    </MemoryRouter>,
  );
}

function createLoaderData(
  overrides: Partial<DetailRouteViewProps["loaderData"]> = {},
): DetailRouteViewProps["loaderData"] {
  return {
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
      correctionReasonRequired: false,
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
    selectedEventId: null,
    ...overrides,
  };
}

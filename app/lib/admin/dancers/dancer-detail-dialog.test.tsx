// @vitest-environment jsdom

import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, describe, expect, test } from "vitest";

import {
  clickReactDomButton,
  createReactDomTestRenderer,
} from "@/lib/test-support/react-dom";

type AdministracionBailarinDetalleRouteViewComponent =
  typeof import("@/routes/administracion.bailarines_.$dancerId").AdministracionBailarinDetalleRouteView;
type AdministracionBailarinDetalleRouteViewProps =
  Parameters<AdministracionBailarinDetalleRouteViewComponent>[0];

describe("AdministracionBailarinDetalleRouteView dialogs", () => {
  const renderer = createReactDomTestRenderer();
  let AdministracionBailarinDetalleRouteView: AdministracionBailarinDetalleRouteViewComponent;

  beforeAll(async () => {
    ({ AdministracionBailarinDetalleRouteView } =
      await import("@/routes/administracion.bailarines_.$dancerId"));
  }, 30_000);

  afterEach(renderer.cleanup);

  test("unmounts closed confirmation dialogs so another dialog can be closed normally", async () => {
    await renderer.renderAsync(
      <MemoryRouter initialEntries={["/administracion/bailarines/dancer-1"]}>
        <AdministracionBailarinDetalleRouteView
          loaderData={createLoaderData()}
        />
      </MemoryRouter>,
    );

    expect(document.body.textContent).not.toContain("¿Guardar cambios?");
    expect(document.body.textContent).not.toContain("¿Archivar bailarín?");
    expect(document.body.textContent).not.toContain("¿Verificar?");

    await clickReactDomButton("Verificar", { exact: true });

    expect(document.body.textContent).toContain("¿Verificar?");
    expect(document.body.textContent).not.toContain("¿Guardar cambios?");
    expect(document.body.textContent).not.toContain("¿Archivar bailarín?");

    await clickReactDomButton("Cancelar", { exact: true });

    expect(document.body.textContent).not.toContain("¿Verificar?");
    expect(document.body.textContent).not.toContain("¿Guardar cambios?");
    expect(document.body.textContent).not.toContain("¿Archivar bailarín?");
  });
});

function createLoaderData(): AdministracionBailarinDetalleRouteViewProps["loaderData"] {
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
  };
}

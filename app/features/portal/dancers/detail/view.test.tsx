import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";

import { PortalDancerDetailRouteView } from "@/features/portal/dancers/detail/view";

type DancerDetailViewProps = Parameters<typeof PortalDancerDetailRouteView>[0];

describe("PortalDancerDetailRouteView", () => {
  test("renders the editable ficha", () => {
    const markup = renderDancerDetail({
      loaderData: dancerDetailLoaderData({
        dancer: dancerDetailRow({
          id: "dancer_edit_1",
          firstName: "Ana",
          lastName: "Alvarez",
          birthDate: "2014-02-01",
          active: false,
        }),
      }),
    });

    expect(markup).toContain(">Ana Alvarez</h1>");
    expect(markup).not.toContain("Editar bailarín");
    expect(markup).not.toContain("Editar Bailarín");
    expect(markup).toContain('name="firstName" value="Ana"');
    expect(markup).toContain('name="lastName" value="Alvarez"');
    expect(markup).toContain("Acciones");
    expect(markup).toContain(
      "Este bailarín está archivado. Reactivalo para que vuelva a aparecer en las listas activas y en próximas selecciones de coreografías.",
    );
    expect(markup).toContain("Reactivar");
    expect(markup).toContain(
      "Faltan completar tipo de documento, número de documento, frente del documento y dorso del documento para poder verificar la identidad del bailarín.",
    );
    expect(markup).toContain("Nombre");
    expect(markup).toContain("Apellido");
    expect(markup).toContain("Fecha de nacimiento");
    expect(markup).toContain("Tipo de documento");
    expect(markup).toContain("Número de documento");
    expect(markup).toContain("Frente del documento");
    expect(markup).toContain("Dorso del documento");
    expect(markup).toContain('name="documentFrontImage"');
    expect(markup).toContain('name="documentBackImage"');
    expect(markup).toContain("JPG, PNG o WEBP - max 10 MB");
    expect(markup).toContain('name="documentType" value=""');
    expect(markup).toContain("Volver");
    expect(markup).toContain("Guardar");
    expect(markup).toContain('form="portal-bailarin-form"');
    expect(markup).toContain('href="/portal/bailarines"');
    expect(markup).toContain('aria-labelledby="bailarin-detail-alerts-title"');
    expect(markup).toContain('aria-labelledby="bailarin-detail-form-title"');
    expect(markup).not.toContain("Archivado");
    expect(markup).not.toContain("Activo");
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
    expect(markup).not.toContain("frente del documento");
    expect(markup).not.toContain("dorso del documento");
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

  test("renders verified identification fields as locked readonly inputs", () => {
    const markup = renderDancerDetail({
      loaderData: dancerDetailLoaderData({
        dancer: dancerDetailRow({
          birthDate: "2014-02-01",
          documentType: "dni",
          documentNumber: "12345678",
          documentFrontImageStorageKey: "dancers/front.jpg",
          documentBackImageStorageKey: "dancers/back.jpg",
          identityVerifiedAt: new Date("2026-06-16T12:00:00Z"),
        }),
      }),
    });

    expect(markup).toContain("Fecha de nacimiento");
    expect(markup).toContain('name="birthDate" value="2014-02-01"');
    expect(markup).toContain('value="1 de febrero de 2014"');
    expect(markup).toContain("Tipo de documento");
    expect(markup).toContain('name="documentType" value="dni"');
    expect(markup).toContain('value="DNI"');
    expect(markup).toContain("Número de documento");
    expect(markup).toContain('name="documentNumber" value="12345678"');
    expect(markup).toContain('disabled="" readOnly="" value="12345678"');
    expect(markup).toContain("Frente del documento");
    expect(markup).toContain("Dorso del documento");
    expect(markup).toContain(
      "La identidad del bailarín está verificada. Comunicate con nosotros si necesitás realizar algún cambio.",
    );
    expect(countOccurrences(markup, "Imagen cargada")).toBe(2);
    expect(countOccurrences(markup, "lucide-lock")).toBe(5);
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

  test("shows the reactivation confirmation", () => {
    const markup = renderDancerDetail({
      loaderData: dancerDetailLoaderData({
        dancer: dancerDetailRow({
          active: false,
        }),
      }),
      initialStatusDialogIntent: "reactivate-dancer",
    });

    expect(markup).toContain("Acciones");
    expect(markup).toContain("¿Reactivar bailarín?");
    expect(markup).toContain(
      "El bailarín volverá a aparecer en listas activas y en próximas selecciones de coreografías. Sus coreografías existentes no se modifican.",
    );
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
    documentImageUrls: {
      front: null,
      back: null,
    },
    dancer: dancerDetailRow(),
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

function countOccurrences(value: string, search: string) {
  return value.split(search).length - 1;
}

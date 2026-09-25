import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, test } from "vitest";

import { PortalDancersListRouteView } from "@/features/portal/dancers/list/view";
import { eventDocumentDownloadUrls } from "@/lib/events/event-documents.test-support";

type DancersListViewProps = Parameters<typeof PortalDancersListRouteView>[0];

type DancersListViewInput = {
  actionData?: DancersListViewProps["actionData"];
  loaderData?: Partial<DancersListViewProps["loaderData"]>;
};

describe("PortalDancersListRouteView", () => {
  test("shows ordered rows with document and state badges", () => {
    const markup = renderDancersList({
      loaderData: {
        dancers: [
          dancerListItem({
            id: "dancer_ana",
            firstName: "Ana",
            lastName: "Alvarez",
            birthDate: "2014-02-01",
            documentType: "dni",
            documentNumber: "12345678",
            verificationStatus: "incomplete",
          }),
          dancerListItem({
            id: "dancer_juan",
            firstName: "Juan Manuel",
            lastName: "Cruz de la Torre",
            birthDate: "2015-04-03",
          }),
          dancerListItem({
            id: "dancer_luz",
            firstName: "Luz",
            lastName: "Pendiente",
            birthDate: "2015-05-04",
            documentType: "dni",
            documentNumber: "87654321",
            verificationStatus: "unverified",
          }),
        ],
      },
    });

    expect(markup).toContain("Ana Alvarez");
    expect(markup).toContain("Juan Manuel Cruz de la Torre");
    expect(markup).toContain("DNI 12345678");
    expect(markup).toContain("Sin documento");
    expect(markup).toContain("No participando");
    expect(markup).toContain("Incompleto");
    expect(markup).toContain("Sin verificar");
    expect(markup).toContain('data-variant="info"');
    expect(markup).not.toContain("Fecha de nacimiento");
    expect(markup).not.toContain("01/02/2014");
    expect(markup).not.toContain("03/04/2015");
    expect(markup).toContain('href="/portal/bailarines/dancer_ana"');
    expect(markup.indexOf("Ana Alvarez")).toBeLessThan(
      markup.indexOf("Juan Manuel Cruz de la Torre"),
    );
  });

  test("hides the participation badge when there is no active event", () => {
    const markup = renderDancersList({
      loaderData: {
        dancers: [
          dancerListItem({
            id: "dancer_sin_evento",
            participationStatus: "no-event",
          }),
        ],
      },
    });

    expect(markup).not.toContain("No participando");
    expect(markup).not.toContain(">Participando<");
    expect(markup).not.toContain("Sin evento");
  });

  test("hides archived rows by default while keeping filters visible", () => {
    const markup = renderDancersList({
      loaderData: {
        dancers: [
          dancerListItem({
            id: "dancer_archived",
            firstName: "Ana",
            lastName: "Archivada",
            active: false,
          }),
          dancerListItem({
            id: "dancer_active",
            firstName: "Beto",
            lastName: "Activo",
            active: true,
          }),
        ],
      },
    });

    expect(markup).toContain("Filtros");
    expect(markup).toContain("1 de 2 registros");
    expect(markup).toContain('href="/portal/bailarines/dancer_active"');
    expect(markup).not.toContain('href="/portal/bailarines/dancer_archived"');
  });
});

function renderDancersList(input: DancersListViewInput = {}) {
  const router = createMemoryRouter(
    [
      {
        path: "/portal/bailarines",
        action: async () => null,
        element: (
          <PortalDancersListRouteView
            loaderData={{
              activeEventStartDate: "2026-09-25",
              dancers: [],
              documentDownloadUrls: eventDocumentDownloadUrls(),
              ...input.loaderData,
            }}
            actionData={input.actionData}
          />
        ),
      },
    ],
    { initialEntries: ["/portal/bailarines"] },
  );

  return renderToStaticMarkup(<RouterProvider router={router} />);
}

function dancerListItem(
  overrides: Partial<
    DancersListViewProps["loaderData"]["dancers"][number]
  > = {},
) {
  return {
    id: "dancer_1",
    firstName: "Bailarina",
    lastName: "Prueba",
    active: true,
    birthDate: "2015-01-01",
    documentType: null,
    documentNumber: null,
    verificationStatus: "incomplete" as const,
    participationStatus: "not-participating" as const,
    ...overrides,
  } satisfies DancersListViewProps["loaderData"]["dancers"][number];
}

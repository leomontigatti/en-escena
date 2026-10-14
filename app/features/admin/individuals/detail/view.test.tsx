import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { renderInDataRouter } from "@/lib/test-support/data-router";

import type { IndividualDetailLoaderData } from "./shared";
import { IndividualDetailRouteView } from "./view";

describe("IndividualDetailRouteView", () => {
  test("says who confirmed a linked individual's document and when", () => {
    const markup = renderRoute({
      confirmation: {
        confirmedAt: new Date("2026-10-14T15:00:00Z"),
        confirmedByName: "Laura Admin",
      },
      linkState: "linked",
    });

    expect(markup).toContain("Vínculo confirmado");
    expect(markup).toContain("Lo confirmó Laura Admin el 14/10/26.");
    expect(markup).toContain("Vinculado");
  });

  test("explains that a link cannot be confirmed without a photo", () => {
    const markup = renderRoute({
      documentPhotoStorageKey: null,
      documentPhotoUrl: null,
      linkState: "unlinked",
    });

    expect(markup).toContain("Sin foto del documento");
    expect(markup).toContain("Sin imagen");
  });

  test("lists the academy rows the document reaches, each linked to its detail", () => {
    const markup = renderRoute({
      reachedRows: [
        {
          academyId: "academy-1",
          academyName: "Estudio Sur",
          firstName: "Ana",
          id: "dancer-1",
          kind: "dancer",
          lastName: "Pérez",
          status: "archived",
        },
        {
          academyId: "academy-2",
          academyName: "Academia Norte",
          firstName: "Ana",
          id: "professor-1",
          kind: "professor",
          lastName: "Pérez",
          status: "active",
        },
      ],
    });

    expect(markup).toContain('href="/administracion/bailarines/dancer-1"');
    expect(markup).toContain('href="/administracion/profesores/professor-1"');
    expect(markup).toContain("Archivado");
  });

  test("offers the link actions to whoever writes, and not to the auditor", () => {
    expect(renderRoute({ canWrite: true })).toContain("Acciones");
    expect(renderRoute({ canWrite: false })).not.toContain("Acciones");
  });
});

function renderRoute(loaderData: Partial<IndividualDetailLoaderData> = {}) {
  return renderToStaticMarkup(
    renderInDataRouter(
      "/administracion/particulares/individual-1",
      createElement(IndividualDetailRouteView, {
        loaderData: {
          backToList: "/administracion/particulares",
          canWrite: true,
          confirmation: null,
          documentPhotoStorageKey: "individuals/individual-1/document.jpg",
          documentPhotoUrl: "https://storage.example/document.jpg",
          individual: {
            documentNumber: "30123456",
            documentType: "dni",
            email: "ana@example.com",
            firstName: "Ana",
            id: "individual-1",
            lastName: "Pérez",
            phone: "3511234567",
          },
          linkState: "pending",
          reachedRows: [],
          ...loaderData,
        },
      }),
    ),
  );
}

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { IndividualDetailRouteView } from "@/features/admin/individuals/detail/view";
import type { IndividualDetailLoaderData } from "@/features/admin/individuals/detail/shared";
import { renderInDataRouter } from "@/lib/test-support/data-router";

describe("IndividualDetailRouteView", () => {
  test("gives administration the link's actions beside its badge", () => {
    const markup = renderRoute({ canWrite: true });

    expect(markup).toContain("Sin verificar");
    expect(markup).toContain("Acciones");
    expect(markup).not.toContain("Filas de academia");
  });

  test("shows the auditor the data and the photo, and no control that writes", () => {
    const markup = renderRoute({ canWrite: false });

    expect(markup).toContain("Ana Acosta");
    expect(markup).toContain("Foto del documento");
    expect(markup).not.toContain("Acciones");
  });

  test("says who confirmed the link and when", () => {
    const markup = renderRoute({
      individual: {
        ...individual,
        confirmation: {
          confirmedAt: new Date("2026-10-14T15:00:00Z"),
          confirmedByName: "Laura Admin",
        },
        linkState: "linked",
      },
    });

    expect(markup).toContain("Vinculado");
    expect(markup).toContain("Lo confirmó Laura Admin el");
  });
});

const individual: IndividualDetailLoaderData["individual"] = {
  confirmation: null,
  documentNumber: "30123456",
  documentPhotoStorageKey: "individuals/ana.jpg",
  documentPhotoUrl: "/archivos/individuals/ana.jpg",
  documentType: "dni",
  email: "ana@example.com",
  firstName: "Ana",
  id: "individual-1",
  lastName: "Acosta",
  linkState: "pending",
  phone: "3511234567",
};

function renderRoute(loaderData: Partial<IndividualDetailLoaderData>) {
  return renderToStaticMarkup(
    renderInDataRouter(
      "/administracion/particulares/individual-1",
      createElement(IndividualDetailRouteView, {
        loaderData: {
          backToList: "/administracion/particulares",
          canWrite: true,
          individual,
          ...loaderData,
        },
      }),
    ),
  );
}

/** @vitest-environment jsdom */

import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { EventDocumentsSection } from "@/features/admin/events/detail/documents-card";
import type { EventDetailLoaderData } from "@/features/admin/events/detail/shared";
import { eventDocumentSummaries } from "@/lib/events/event-documents.test-support";
import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

describe("EventDocumentsSection", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(() => {
    renderer.cleanup();
  });

  test("asks for the three documents of the event", async () => {
    await renderCard(eventDocumentSummaries());

    expect(document.body.textContent).toContain("Contrato para profesores");
    expect(document.body.textContent).toContain("Autorización para menores");
    expect(document.body.textContent).toContain("Contrato para mayores");
    expect(document.body.textContent).toContain("Todavía no está cargado.");
    expect(getUploadForms()).toHaveLength(3);
  });

  // An administration re-uploading three PDFs per event cannot tell which ones
  // are already done without the date and the link.
  test("shows when a document was uploaded and how to open it", async () => {
    await renderCard(
      eventDocumentSummaries({
        professor_contract: {
          downloadUrl: "/almacenamiento?key=contrato",
          uploadedAt: new Date("2026-05-04T15:00:00Z"),
        },
      }),
    );

    expect(document.body.textContent).toContain("Cargado el 4/5/26");
    expect(
      document.querySelector('a[href="/almacenamiento?key=contrato"]'),
    ).not.toBeNull();
  });

  test("posts the upload as multipart to the document intent", async () => {
    await renderCard(eventDocumentSummaries());

    const [form] = getUploadForms();

    expect(form.getAttribute("enctype")).toBe("multipart/form-data");
    expect(form.getAttribute("method")?.toLowerCase()).toBe("post");
    expect(
      form.querySelector<HTMLInputElement>('input[name="intent"]')?.value,
    ).toBe("upload-document");
    expect(
      form.querySelector<HTMLInputElement>('input[name="kind"]')?.value,
    ).toBe("professor_contract");
    expect(
      form.querySelector<HTMLInputElement>('input[name="documentFile"]')
        ?.accept,
    ).toBe("application/pdf");
  });

  function getUploadForms() {
    return Array.from(
      document.querySelectorAll<HTMLFormElement>("form[enctype]"),
    );
  }

  async function renderCard(documents: EventDetailLoaderData["documents"]) {
    const router = createMemoryRouter(
      [
        {
          path: "/administracion/eventos/event_1",
          action: async () => null,
          element: <EventDocumentsSection documents={documents} />,
        },
      ],
      { initialEntries: ["/administracion/eventos/event_1"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);
  }
});

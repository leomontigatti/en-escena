/** @vitest-environment jsdom */

import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import {
  EventDocumentsFields,
  useEventDocumentsForm,
} from "@/features/admin/events/detail/documents-fields";
import {
  eventDocumentFileField,
  eventDocumentKeptField,
  eventDocumentsPresentField,
  keptEventDocumentValue,
  type EventDetailLoaderData,
} from "@/features/admin/events/detail/shared";
import { eventDocumentSummaries } from "@/lib/events/event-documents.test-support";
import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

describe("EventDocumentsFields", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(() => {
    renderer.cleanup();
  });

  test("asks for the three documents of the event", async () => {
    await renderFields(eventDocumentSummaries());

    expect(document.body.textContent).toContain("Contrato para profesores");
    expect(document.body.textContent).toContain("Autorización para menores");
    expect(document.body.textContent).toContain("Contrato para mayores");
    expect(document.body.textContent).toContain("Todavía no está cargado.");
  });

  // The whole point of folding the uploads into the event form: a document is a
  // field, so it may not bring a form or a button of its own.
  test("brings no form and no button of its own", async () => {
    await renderFields(eventDocumentSummaries());

    expect(document.querySelector("[data-documents] form")).toBeNull();
    expect(
      document.querySelector('[data-documents] button[type="submit"]'),
    ).toBeNull();
    expect(document.body.textContent).not.toContain("Reemplazar");
    expect(document.body.textContent).not.toContain("Cargar el");
  });

  test("posts one PDF input per document under the presence marker", async () => {
    await renderFields(eventDocumentSummaries());

    expect(
      document.querySelector<HTMLInputElement>(
        `input[name="${eventDocumentsPresentField}"]`,
      )?.value,
    ).toBe(keptEventDocumentValue);

    const fileInput = document.querySelector<HTMLInputElement>(
      `input[name="${eventDocumentFileField("professor_contract")}"]`,
    );

    expect(fileInput?.type).toBe("file");
    expect(fileInput?.accept).toBe("application/pdf");
  });

  // An administration re-uploading three PDFs per event cannot tell which ones
  // are already done without the date and the link.
  test("shows when a document was uploaded and how to open it", async () => {
    await renderFields(
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

  // The "kept" field is what the action reads to tell "leave it alone" from
  // "remove it", so an uploaded document has to submit it as kept.
  test("marks an uploaded document as kept", async () => {
    await renderFields(
      eventDocumentSummaries({
        professor_contract: {
          downloadUrl: null,
          uploadedAt: new Date("2026-05-04T15:00:00Z"),
        },
      }),
    );

    expect(readKept("professor_contract")).toBe(keptEventDocumentValue);
    expect(readKept("adult_contract")).toBe("");
  });

  // The compact variant renders no `helperText`, so the format and the ceiling
  // have to be stated by the row or they are stated nowhere.
  test("states the accepted format and the size ceiling", async () => {
    await renderFields(eventDocumentSummaries());

    expect(document.body.textContent).toContain("PDF - max 10 MB");
  });

  function readKept(kind: "adult_contract" | "professor_contract") {
    return document.querySelector<HTMLInputElement>(
      `input[name="${eventDocumentKeptField(kind)}"]`,
    )?.value;
  }

  async function renderFields(documents: EventDetailLoaderData["documents"]) {
    const router = createMemoryRouter(
      [
        {
          path: "/administracion/eventos/event_1",
          action: async () => null,
          element: <DocumentsHarness documents={documents} />,
        },
      ],
      { initialEntries: ["/administracion/eventos/event_1"] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);
  }
});

function DocumentsHarness({
  documents,
}: {
  documents: EventDetailLoaderData["documents"];
}) {
  const controller = useEventDocumentsForm(documents);

  return (
    <div data-documents>
      <EventDocumentsFields controller={controller} documents={documents} />
    </div>
  );
}

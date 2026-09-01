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

  // The field is the whole status: an uploaded document reads as the link that
  // opens it, so an administration can tell which of the three are done.
  test("turns an uploaded document into a link that opens it", async () => {
    await renderFields(uploadedProfessorContract());

    const link = document.querySelector<HTMLAnchorElement>(
      'a[href="/almacenamiento?key=contrato"]',
    );

    expect(link).not.toBeNull();
    expect(link?.textContent).toContain("Abrir documento");
  });

  // Replacing takes two deliberate steps. While the document is there the box
  // is a link and opens nothing else, so there is no picker to reach past it.
  test("offers no picker until the uploaded document is removed", async () => {
    await renderFields(uploadedProfessorContract());

    expect(getUploadBox("professor_contract")).toBeNull();
    expect(getRemoveButton("contrato para profesores")).not.toBeUndefined();
  });

  // Nothing to remove yet, so nothing to press: the button is the affordance
  // for a value the field does not have.
  test("offers no remove button while the document is missing", async () => {
    await renderFields(eventDocumentSummaries());

    expect(getRemoveButton("contrato para profesores")).toBeUndefined();
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
  // stand in for the empty value or they are stated nowhere.
  test("places the accepted format and the ceiling in the empty field", async () => {
    await renderFields(eventDocumentSummaries());

    expect(getUploadBox("professor_contract")?.textContent).toBe(
      "PDF - max 10 MB",
    );
  });

  function uploadedProfessorContract() {
    return eventDocumentSummaries({
      professor_contract: {
        downloadUrl: "/almacenamiento?key=contrato",
        uploadedAt: new Date("2026-05-04T15:00:00Z"),
      },
    });
  }

  /**
   * The clickable box, which is a `<label>` for the file input. Told apart from
   * the field's own caption, which carries the same `for` and is what makes a
   * bare `label[for]` lookup useless here.
   */
  function getUploadBox(kind: "adult_contract" | "professor_contract") {
    const fileInput = document.querySelector<HTMLInputElement>(
      `input[name="${eventDocumentFileField(kind)}"]`,
    );

    return document.querySelector(
      `label[for="${fileInput?.id}"]:not([data-slot="field-label"])`,
    );
  }

  function getRemoveButton(subjectLabel: string) {
    return Array.from(document.querySelectorAll("button")).find((button) =>
      button.textContent?.includes(`Quitar ${subjectLabel}`),
    );
  }

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

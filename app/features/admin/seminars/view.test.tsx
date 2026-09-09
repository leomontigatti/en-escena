/** @vitest-environment jsdom */

import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { SeminarCreateView } from "@/features/admin/seminars/create/view";
import { SeminarDetailView } from "@/features/admin/seminars/detail/view";
import { SeminarsListView } from "@/features/admin/seminars/list/view";
import {
  defaultSeminarFormValues,
  toSeminarFormValues,
} from "@/features/admin/seminars/shared";
import type { SeminarInscriptionRow } from "@/lib/seminars/inscriptions.server";
import type { SeminarListItem } from "@/lib/seminars/repository.server";
import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

const renderer = createReactDomTestRenderer();

afterEach(() => {
  renderer.cleanup();
});

function buildSeminar(
  overrides: Partial<SeminarListItem> = {},
): SeminarListItem {
  return {
    id: "seminar_1",
    eventId: "event_1",
    instructorName: "Abril Sosa",
    instructorPictureStorageKey: null,
    scheduledDate: "2026-10-10",
    startTime: "18:30",
    quota: 20,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    availablePlaces: 20,
    inscriptionCount: 0,
    ...overrides,
  };
}

async function renderAt(path: string, element: React.ReactElement) {
  const router = createMemoryRouter(
    [{ path, action: async () => null, element }],
    { initialEntries: [path] },
  );

  await renderer.renderAsync(<RouterProvider router={router} />);
}

describe("SeminarsListView", () => {
  test("reads the seminar with the schedule views' date and available-places wording", async () => {
    await renderAt(
      "/administracion/seminarios",
      <SeminarsListView
        loaderData={{
          selectedEventId: "event_1",
          seminars: [buildSeminar({ availablePlaces: 12 })],
        }}
      />,
    );

    expect(document.body.textContent).toContain("10 de octubre de 2026");
    expect(document.body.textContent).toContain("18:30");
    expect(document.body.textContent).toContain(" / 12 disponibles");
    expect(
      document.querySelector('a[href="/administracion/seminarios/seminar_1"]')
        ?.textContent,
    ).toBe("Abril Sosa");
  });

  test("marks a seminar with no places left as destructive", async () => {
    await renderAt(
      "/administracion/seminarios",
      <SeminarsListView
        loaderData={{
          selectedEventId: "event_1",
          seminars: [buildSeminar({ availablePlaces: 0 })],
        }}
      />,
    );

    const suffix = Array.from(document.querySelectorAll("span")).find(
      (element) => element.textContent === " / sin lugares",
    );

    expect(suffix?.className).toContain("text-destructive");
  });

  test("offers the empty state and the create action when the event has no seminars", async () => {
    await renderAt(
      "/administracion/seminarios",
      <SeminarsListView
        loaderData={{ selectedEventId: "event_1", seminars: [] }}
      />,
    );

    expect(document.body.textContent).toContain(
      "Todavía no hay seminarios creados.",
    );
    expect(
      document.querySelector('a[href="/administracion/seminarios/nuevo"]')
        ?.textContent,
    ).toContain("Nuevo seminario");
  });
});

function renderDetail(
  seminar: SeminarListItem,
  instructorPictureUrl = null,
  inscriptions: SeminarInscriptionRow[] = [],
) {
  return renderAt(
    "/administracion/seminarios/seminar_1",
    <SeminarDetailView
      loaderData={{
        inscriptions,
        instructorPictureUrl,
        selectedEventId: "event_1",
        seminar,
        values: toSeminarFormValues(seminar),
      }}
    />,
  );
}

describe("SeminarDetailView", () => {
  test("shows what is left of the quota inside the field and in its accessible name", async () => {
    await renderDetail(buildSeminar({ availablePlaces: 12 }));

    expect(document.body.textContent).toContain(" / 12 disponibles");
    expect(document.querySelector("#quota")?.getAttribute("aria-label")).toBe(
      "Cupo. Quedan 12 de 20 lugares.",
    );
    expect(
      document.querySelectorAll('[data-slot="field-description"]'),
    ).toHaveLength(0);
  });

  // The picture is a field of the seminar's own form, so it travels on the same
  // "Guardar" — which is what makes the body multipart — and spans both columns
  // through a wrapper, because the field forwards its class to the control.
  test("offers the instructor picture as a field of the seminar form", async () => {
    await renderDetail(buildSeminar());

    const fileInput = document.querySelector<HTMLInputElement>(
      'input[name="instructorPictureFile"]',
    );

    expect(fileInput?.getAttribute("accept")).toBe(
      "image/jpeg,image/png,image/webp",
    );
    expect(fileInput?.closest("form")?.getAttribute("enctype")).toBe(
      "multipart/form-data",
    );
    expect(fileInput?.closest(".sm\\:col-span-2")).not.toBeNull();
    expect(document.body.textContent).toContain("Foto del instructor");
    expect(document.body.textContent).toContain("JPG, PNG o WEBP - max 10 MB");
  });

  test("reads a stored picture as a link that opens it", async () => {
    await renderDetail(
      buildSeminar({
        instructorPictureStorageKey:
          "events/event_1/seminars/seminar_1/instructor.jpg",
      }),
      "https://example.test/signed/instructor" as never,
    );

    const link = document.querySelector<HTMLAnchorElement>(
      'a[href="https://example.test/signed/instructor"]',
    );

    expect(link?.textContent).toContain("Abrir foto");
    expect(
      document.querySelector<HTMLInputElement>(
        'input[name="instructorPictureKept"]',
      )?.value,
    ).toBe("kept");
  });
});

function buildInscription(
  overrides: Partial<SeminarInscriptionRow> = {},
): SeminarInscriptionRow {
  return {
    id: "inscription_1",
    fullName: "Abril Sosa",
    personKind: "dancer",
    academyName: "Academia Norte",
    ...overrides,
  };
}

function renderInscriptions(
  inscriptions: SeminarInscriptionRow[],
  initialRemovingInscriptionId: string | null = null,
) {
  const seminar = buildSeminar({ inscriptionCount: inscriptions.length });

  return renderAt(
    "/administracion/seminarios/seminar_1",
    <SeminarDetailView
      initialRemovingInscriptionId={initialRemovingInscriptionId}
      initialTab="inscriptos"
      loaderData={{
        inscriptions,
        instructorPictureUrl: null,
        selectedEventId: "event_1",
        seminar,
        values: toSeminarFormValues(seminar),
      }}
    />,
  );
}

describe("SeminarDetailView `Inscriptos`", () => {
  test("lists the person, the type and the academy, and offers no way to create one", async () => {
    await renderInscriptions([
      buildInscription(),
      buildInscription({
        id: "inscription_2",
        fullName: "Beto Luna",
        personKind: "professor",
        academyName: "Academia Sur",
      }),
    ]);

    const body = document.body.textContent ?? "";
    expect(body).toContain("Abril Sosa");
    expect(body).toContain("Bailarín");
    expect(body).toContain("Beto Luna");
    expect(body).toContain("Profesor");
    expect(body).toContain("Academia Norte");
    // The quota is not this tab's business, and administration never registers.
    expect(body).not.toContain("Inscribir");
    expect(body).not.toContain("disponibles");
  });

  test("reads the empty tab as a table with nobody in it", async () => {
    await renderInscriptions([]);

    expect(document.body.textContent).toContain(
      "Todavía no hay inscriptos en este seminario.",
    );
  });

  test("opens the removal confirmation from the person name", async () => {
    await renderInscriptions([buildInscription()], "inscription_1");

    const dialog = document.querySelector('[role="alertdialog"]');

    expect(dialog?.textContent).toContain("Abril Sosa");
    expect(dialog?.textContent).toContain(
      "Esta acción da de baja la inscripción del seminario y libera su lugar. No se puede deshacer.",
    );
    expect(
      dialog?.querySelector('input[name="intent"]')?.getAttribute("value"),
    ).toBe("delete-seminar-inscription");
    expect(
      dialog?.querySelector('input[name="id"]')?.getAttribute("value"),
    ).toBe("inscription_1");
  });
});

describe("SeminarDetailView delete dialog", () => {
  test("blocks the seminar delete while an inscription stands", async () => {
    await renderAt(
      "/administracion/seminarios/seminar_1",
      <SeminarDetailView
        initialDeleteDialogOpen
        loaderData={{
          inscriptions: [buildInscription()],
          instructorPictureUrl: null,
          selectedEventId: "event_1",
          seminar: buildSeminar({ inscriptionCount: 1, availablePlaces: 19 }),
          values: toSeminarFormValues(buildSeminar()),
        }}
      />,
    );

    const dialog = document.querySelector('[role="alertdialog"]');

    expect(dialog?.textContent).toContain(
      "No se puede borrar el seminario porque tiene inscripciones.",
    );
    expect(dialog?.querySelector("form")).toBeNull();
  });

  test("offers the destructive button once nobody is registered", async () => {
    await renderAt(
      "/administracion/seminarios/seminar_1",
      <SeminarDetailView
        initialDeleteDialogOpen
        loaderData={{
          inscriptions: [],
          instructorPictureUrl: null,
          selectedEventId: "event_1",
          seminar: buildSeminar(),
          values: toSeminarFormValues(buildSeminar()),
        }}
      />,
    );

    const dialog = document.querySelector('[role="alertdialog"]');

    expect(dialog?.querySelector("form")).not.toBeNull();
    expect(dialog?.textContent).not.toContain("tiene inscripciones");
  });
});

describe("SeminarCreateView", () => {
  test("leaves the quota bare, with no places suffix to report", async () => {
    await renderAt(
      "/administracion/seminarios/nuevo",
      <SeminarCreateView
        loaderData={{
          selectedEventId: "event_1",
          values: defaultSeminarFormValues(),
        }}
      />,
    );

    expect(document.body.textContent).not.toContain("disponibles");
    // The picture belongs to a seminar that exists, so there is nothing to
    // upload it against until the create page has redirected to the detail.
    expect(
      document.querySelector('input[name="instructorPictureFile"]'),
    ).toBeNull();
    expect(
      document.querySelector("#quota")?.getAttribute("aria-label"),
    ).toBeNull();
  });
});

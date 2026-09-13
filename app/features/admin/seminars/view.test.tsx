/** @vitest-environment jsdom */

import { act } from "react";
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
    kind: "regular",
    requiredDepositPercentage: 50,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    availablePlaces: 20,
    registeredCount: 0,
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
  hasCoveredInscription = false,
) {
  return renderAt(
    "/administracion/seminarios/seminar_1",
    <SeminarDetailView
      loaderData={{
        hasCoveredInscription,
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

  test("reads the kind and the seminar's own deposit rate as fields of its form", async () => {
    await renderDetail(
      buildSeminar({ kind: "special", requiredDepositPercentage: 40 }),
    );

    const body = document.body.textContent ?? "";

    expect(body).toContain("Tipo de seminario");
    expect(body).toContain("Exclusivo");
    expect(body).toContain("Seña (%)");
    expect(
      document.querySelector<HTMLInputElement>("#requiredDepositPercentage")
        ?.value,
    ).toBe("40");
  });

  // Both facts fix the deposit an inscription had to cover to take its place,
  // so once one covered it the refusal shows on sight rather than after the
  // save. Everything else on the form keeps editing.
  test("locks the kind and the deposit rate once an inscription is covered", async () => {
    await renderDetail(buildSeminar(), null, [], true);

    const kind = document.querySelector<HTMLInputElement>("#kind");
    const requiredDepositPercentage = document.querySelector<HTMLInputElement>(
      "#requiredDepositPercentage",
    );

    expect(kind?.readOnly).toBe(true);
    expect(kind?.value).toBe("Común");
    expect(requiredDepositPercentage?.readOnly).toBe(true);
    expect(
      document.querySelector<HTMLInputElement>('input[name="kind"]')?.value,
    ).toBe("regular");
    expect(
      document.querySelector<HTMLInputElement>("#instructorName")?.readOnly,
    ).toBe(false);
  });

  test("keeps `Guardar` disabled until the form is dirty", async () => {
    await renderDetail(buildSeminar());

    const save = Array.from(
      document.querySelectorAll<HTMLButtonElement>('button[type="submit"]'),
    ).find((button) => button.textContent?.includes("Guardar"));
    const instructorName =
      document.querySelector<HTMLInputElement>("#instructorName");

    expect(save?.disabled).toBe(true);

    await act(async () => {
      setInputValue(instructorName, "Nicolás Prado");
    });

    expect(save?.disabled).toBe(false);
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

async function renderInscriptions(inscriptions: SeminarInscriptionRow[]) {
  const seminar = buildSeminar({ registeredCount: inscriptions.length });

  await renderAt(
    "/administracion/seminarios/seminar_1",
    <SeminarDetailView
      loaderData={{
        hasCoveredInscription: false,
        inscriptions,
        instructorPictureUrl: null,
        selectedEventId: "event_1",
        seminar,
        values: toSeminarFormValues(seminar),
      }}
    />,
  );

  // The tab is reached the way an administrator reaches it: the panel is not
  // mounted until its trigger is pressed.
  await clickText('[role="tab"]', "Inscriptos");
}

/** Presses the first element matching `selector` whose text is `text`. */
async function clickText(selector: string, text: string) {
  const target = Array.from(
    document.querySelectorAll<HTMLElement>(selector),
  ).find((element) => element.textContent?.trim() === text);

  if (!target) {
    throw new Error(`Expected to find ${selector} reading "${text}".`);
  }

  await act(async () => {
    // Radix's tabs select on focus, buttons on click; pressing does both.
    target.focus();
    target.click();
  });
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
    await renderInscriptions([buildInscription()]);

    expect(document.querySelector('[role="alertdialog"]')).toBeNull();

    await clickText("button", "Abril Sosa");

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
          hasCoveredInscription: false,
          inscriptions: [buildInscription()],
          instructorPictureUrl: null,
          selectedEventId: "event_1",
          seminar: buildSeminar({ registeredCount: 1, availablePlaces: 19 }),
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
          hasCoveredInscription: false,
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

  test("offers a new seminar as `Común` with a deposit of half its price", async () => {
    await renderAt(
      "/administracion/seminarios/nuevo",
      <SeminarCreateView
        loaderData={{
          selectedEventId: "event_1",
          values: defaultSeminarFormValues(),
        }}
      />,
    );

    expect(document.querySelector("#kind")?.textContent).toContain("Común");
    expect(
      document.querySelector<HTMLInputElement>("#requiredDepositPercentage")
        ?.value,
    ).toBe("50");
  });
});

/**
 * React tracks the value it last rendered on the node, so a plain assignment is
 * swallowed as "no change": the setter of the prototype is what makes the input
 * event read as typing.
 */
function setInputValue(input: HTMLInputElement | null, value: string) {
  if (!input) {
    throw new Error("Expected the input to be rendered.");
  }

  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;

  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

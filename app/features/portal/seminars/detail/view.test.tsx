/** @vitest-environment jsdom */

import { act } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { PortalSeminarDetailRouteView } from "@/features/portal/seminars/detail/view";
import type {
  PortalSeminarDetailInscription,
  PortalSeminarDetailLoaderData,
  PortalSeminarDetailPersonOption,
  PortalSeminarDetailSeminar,
} from "@/features/portal/seminars/detail/shared";
import {
  createReactDomTestRenderer,
  getReactDomTexts,
} from "@/lib/test-support/react-dom";

const renderer = createReactDomTestRenderer();

afterEach(() => {
  renderer.cleanup();
});

type LoaderDataOverrides = {
  inscriptions?: PortalSeminarDetailInscription[];
  people?: PortalSeminarDetailPersonOption[];
  seminar?: Partial<PortalSeminarDetailSeminar>;
};

function buildLoaderData(
  overrides: LoaderDataOverrides = {},
): PortalSeminarDetailLoaderData {
  return {
    seminar: {
      id: "seminar_1",
      instructorName: "Abril Sosa",
      scheduledDate: "2026-10-10",
      startTime: "18:30",
      hasStarted: false,
      hasRegistrationPrices: true,
      isFull: false,
      startsBeforePaymentDeadline: false,
      requiredDepositPercentage: 40,
      ...overrides.seminar,
    },
    inscriptions: overrides.inscriptions ?? [],
    people: overrides.people ?? [
      {
        id: "dancer_1",
        kind: "dancer",
        fullName: "Ana Paz",
        priceAmount: 20000,
      },
      {
        id: "professor_1",
        kind: "professor",
        fullName: "Luz Suárez",
        priceAmount: 30000,
      },
    ],
  };
}

async function renderDetail(loaderData: PortalSeminarDetailLoaderData) {
  const router = createMemoryRouter(
    [
      {
        path: "/portal/seminarios/:seminarId",
        action: async () => null,
        element: <PortalSeminarDetailRouteView loaderData={loaderData} />,
      },
    ],
    { initialEntries: ["/portal/seminarios/seminar_1"] },
  );

  await renderer.renderAsync(<RouterProvider router={router} />);
}

function findByText(selector: string, text: string) {
  return Array.from(document.querySelectorAll(selector)).find(
    (element) => element.textContent?.trim() === text,
  );
}

describe("PortalSeminarDetailRouteView", () => {
  test("is headed by the instructor and the moment, with `Inscribir` as the page action", async () => {
    await renderDetail(buildLoaderData());

    const text = document.body.textContent ?? "";

    expect(document.querySelector("#seminar-title")?.textContent).toBe(
      "Abril Sosa",
    );
    expect(text).toContain("10 de octubre de 2026 · 18:30");
    expect(findByText("button", "Inscribir")).toBeDefined();
  });

  test("lists the academy's own inscriptions as a flat table of name, type and `Estado`, without amounts", async () => {
    await renderDetail(
      buildLoaderData({
        inscriptions: [
          {
            id: "inscription_1",
            fullName: "Ana Paz",
            personKind: "dancer",
            hasMoney: true,
            readOnly: false,
            status: { kind: "status", status: "depositMet" },
          },
          {
            id: "inscription_2",
            fullName: "Luz Suárez",
            personKind: "professor",
            hasMoney: false,
            readOnly: false,
            status: { kind: "reserved" },
          },
        ],
      }),
    );

    expect(getReactDomTexts("thead th")).toEqual(["Nombre", "Tipo", "Estado"]);
    expect(document.body.textContent).toContain("Señada");
    expect(document.body.textContent).toContain("Reservada");
    expect(document.body.textContent).toContain("Bailarín");
    expect(document.body.textContent).toContain("Profesor");
    expect(document.querySelector('[role="tablist"]')).toBeNull();
    expect(document.body.textContent).not.toContain("$");
    expect(document.body.textContent).not.toContain("Participando");
  });

  test("shows a linked individual's inscription as `Particular`, with no status and no removal", async () => {
    await renderDetail(
      buildLoaderData({
        inscriptions: [
          {
            id: "inscription_1",
            fullName: "Ana Paz",
            personKind: "individual",
            hasMoney: false,
            readOnly: true,
            status: null,
          },
        ],
      }),
    );

    expect(getReactDomTexts("tbody td")).toEqual([
      "Ana Paz",
      "Particular",
      "—",
    ]);
    expect(findByText("button", "Ana Paz")).toBeUndefined();
  });

  test("says nobody is registered yet in an empty state, not an empty table", async () => {
    await renderDetail(buildLoaderData());

    expect(document.body.textContent).toContain(
      "Todavía no inscribiste a nadie",
    );
    expect(document.body.textContent).toContain(
      "Usá Inscribir para sumar a alguien de tu plantel.",
    );
    expect(document.querySelector("table")).toBeNull();
  });

  test("tells a closed seminar's empty state that it takes no more registrations", async () => {
    await renderDetail(buildLoaderData({ seminar: { hasStarted: true } }));

    expect(document.body.textContent).toContain(
      "Este seminario ya no recibe inscripciones.",
    );
  });

  test("warns that a started seminar takes neither a registration nor a removal", async () => {
    await renderDetail(
      buildLoaderData({
        seminar: { hasStarted: true },
        inscriptions: [
          {
            id: "inscription_1",
            fullName: "Ana Paz",
            personKind: "dancer",
            hasMoney: false,
            readOnly: false,
            status: { kind: "reserved" },
          },
        ],
      }),
    );

    expect(document.body.textContent).toContain(
      "El seminario ya comenzó. Ya no se puede inscribir ni dar de baja.",
    );
    expect(findByText("button", "Inscribir")).toBeUndefined();
    expect(findByText("button", "Ana Paz")).toBeUndefined();
    expect(document.body.textContent).toContain("Ana Paz");
  });

  test("says the seminar is unpriced instead of offering the registration", async () => {
    await renderDetail(
      buildLoaderData({
        seminar: { hasRegistrationPrices: false },
      }),
    );

    expect(document.body.textContent).toContain(
      "Las inscripciones a este seminario todavía no están abiertas.",
    );
    expect(findByText("button", "Inscribir")).toBeUndefined();
  });

  test("notes a full seminar without closing anything", async () => {
    await renderDetail(
      buildLoaderData({
        seminar: { isFull: true },
      }),
    );

    expect(document.body.textContent).toContain(
      "Cupo completoPodés inscribir igual, pero la seña de una nueva inscripción no se cubre hasta que se libere un lugar.",
    );
    expect(findByText("button", "Inscribir")).toBeDefined();
  });

  test("keeps the full notice off a started seminar", async () => {
    await renderDetail(
      buildLoaderData({
        seminar: { hasStarted: true, isFull: true },
      }),
    );

    expect(document.body.textContent).not.toContain("Cupo completo");
  });

  test("confirms the removal of an unfunded row as a deletion", async () => {
    await renderDetail(
      buildLoaderData({
        inscriptions: [
          {
            id: "inscription_1",
            fullName: "Ana Paz",
            personKind: "dancer",
            hasMoney: false,
            readOnly: false,
            status: { kind: "reserved" },
          },
        ],
      }),
    );

    expect(document.querySelector('[role="alertdialog"]')).toBeNull();

    await act(async () => {
      (findByText("button", "Ana Paz") as HTMLButtonElement).click();
    });

    const dialog = document.querySelector('[role="alertdialog"]');

    expect(dialog?.textContent).toContain("Ana Paz");
    expect(dialog?.textContent).toContain("libera su lugar");
    expect(dialog?.textContent).toContain("Esta acción es irreversible.");
  });

  test("confirms a funded inscription as a withdrawal, without naming an amount", async () => {
    await renderDetail(
      buildLoaderData({
        inscriptions: [
          {
            id: "inscription_1",
            fullName: "Ana Paz",
            personKind: "dancer",
            hasMoney: true,
            readOnly: false,
            status: { kind: "reserved" },
          },
        ],
      }),
    );

    await act(async () => {
      (findByText("button", "Ana Paz") as HTMLButtonElement).click();
    });

    const dialog = document.querySelector('[role="alertdialog"]');

    expect(dialog?.textContent).not.toContain("Esta acción es irreversible.");
    expect(dialog?.textContent).toContain("queda retirada del seminario");
    expect(dialog?.textContent).toContain(
      "La inscripción conserva su seña y lo que tenga por encima vuelve al saldo disponible de tu academia. Si ya tenía la seña cubierta, su lugar se libera.",
    );
    expect(dialog?.textContent).toContain(
      "El retiro es definitivo: si volvés a inscribir a la persona, se crea una inscripción nueva, sin dinero.",
    );
    expect(dialog?.textContent).toContain("¿Retirar la inscripción?");
    expect(
      Array.from(dialog?.querySelectorAll("button") ?? []).map((button) =>
        button.textContent?.trim(),
      ),
    ).toEqual(["Cancelar", "Retirar"]);
    expect(dialog?.textContent).not.toContain("$");
  });

  test("opens the register dialog on the picker, with dancers and professors under their own headings and no price until someone is picked", async () => {
    await renderDetail(buildLoaderData());

    await act(async () => {
      (findByText("button", "Inscribir") as HTMLButtonElement).click();
    });

    const trigger = document.querySelector<HTMLElement>(
      '[data-slot="combobox-trigger"]',
    );
    const dialog = document.querySelector('[role="dialog"]');

    expect(document.body.textContent).toContain("Persona");
    expect(trigger).not.toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(dialog?.textContent).not.toContain("$");
    expect(dialog?.textContent).toContain(
      "Tenés 48 horas para enviar el pago del derecho de inscripción. Si no lo enviás en ese plazo, la inscripción pierde su lugar.",
    );

    await act(async () => {
      trigger?.click();
    });

    // The kind is said once per heading, so the options carry the name alone.
    expect(getReactDomTexts('[data-slot="combobox-label"]')).toEqual([
      "Bailarines",
      "Profesores",
    ]);
    expect(getReactDomTexts('[role="option"]')).toEqual([
      "Ana Paz",
      "Luz Suárez",
    ]);
  });

  test("quotes the picked person's own price, split at the seminar's rate, before saving", async () => {
    await renderDetail(buildLoaderData());

    await act(async () => {
      (findByText("button", "Inscribir") as HTMLButtonElement).click();
    });
    await act(async () => {
      document
        .querySelector<HTMLElement>('[data-slot="combobox-trigger"]')
        ?.click();
    });
    await act(async () => {
      (findByText('[role="option"]', "Luz Suárez") as HTMLElement).click();
    });

    const dialog = document.querySelector('[role="dialog"]');

    expect(dialog?.textContent).toContain("$ 30.000");
    expect(dialog?.textContent).toContain(
      "Derecho de inscripción $ 12.000 · Derecho de participación $ 18.000",
    );
  });

  test("gives a seminar starting within 48 hours until its start instead", async () => {
    await renderDetail(
      buildLoaderData({ seminar: { startsBeforePaymentDeadline: true } }),
    );

    await act(async () => {
      (findByText("button", "Inscribir") as HTMLButtonElement).click();
    });

    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      "Tenés hasta que empiece el seminario para enviar el pago del derecho de inscripción.",
    );
  });

  test("promises no deadline in a full seminar, where a registration reserves nothing", async () => {
    await renderDetail(buildLoaderData({ seminar: { isFull: true } }));

    await act(async () => {
      (findByText("button", "Inscribir") as HTMLButtonElement).click();
    });

    expect(
      document.querySelector('[role="dialog"]')?.textContent,
    ).not.toContain("para enviar el pago");
  });
});

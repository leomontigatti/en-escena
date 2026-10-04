import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, test } from "vitest";

import type { EventProgramRow } from "@/lib/presentations/event-program.server";

import type { PublicProgramLoaderData } from "./server";
import { PublicProgramView } from "./view";

describe("PublicProgramView", () => {
  test("renders the same not-published state with no event and with a hidden program", () => {
    const markup = renderView({ event: null, rows: [], schedules: [] });

    expect(markup).toContain("No hay programa publicado");
    expect(markup).toContain(
      "La organización todavía no publicó el programa del evento. Volvé a consultar más cerca de la fecha.",
    );
    // Nothing on the page tells the two cases apart.
    expect(markup).not.toContain("Programa</h2>");
    expect(markup).not.toContain("Imprimir");
  });

  test("names the event and its days, and gives the caveat its own alert", () => {
    const markup = renderView();

    expect(markup).toContain("Programa");
    expect(markup).toContain(
      "En Escena 2026, del 1 de mayo de 2026 al 3 de mayo de 2026.</p>",
    );
    // The caveat is a notice, not part of the dates: it left the subtitle.
    expect(markup).not.toContain(
      "El orden de las presentaciones puede cambiar hasta el día del evento.",
    );
    // Its own line on screen, and again under the printed heading.
    expect(countOccurrences(markup, programNotice)).toBe(2);
    // The alert is titled on screen only: paper keeps the one small line.
    expect(countOccurrences(markup, "Programa sujeto a cambios")).toBe(1);
    expect(markup).toContain("Imprimir");
  });

  describe("award ceremonies on screen", () => {
    const schedules: PublicProgramLoaderData["schedules"] = [
      {
        id: "schedule-1",
        name: "Bloque mañana",
        scheduledDate: "2026-05-01",
        startTime: "10:00",
        awardCeremonyDate: "2026-05-01",
        awardCeremonyTime: "13:30",
      },
      {
        id: "schedule-2",
        name: "Bloque tarde",
        scheduledDate: "2026-05-01",
        startTime: "16:00",
        awardCeremonyDate: null,
        awardCeremonyTime: null,
      },
      {
        id: "schedule-3",
        name: "Bloque noche",
        scheduledDate: "2026-05-01",
        startTime: "21:00",
        awardCeremonyDate: "2026-05-02",
        awardCeremonyTime: "00:15",
      },
      {
        id: "schedule-4",
        name: "Bloque domingo",
        scheduledDate: "2026-05-02",
        startTime: "10:00",
        awardCeremonyDate: null,
        awardCeremonyTime: null,
      },
    ];
    // One presentation per schedule: the loader lists only the schedules
    // somebody presents in.
    const rows = schedules.map((schedule, index) =>
      buildRow({
        choreographyId: `choreography-${index}`,
        orderNumber: index + 1,
        scheduleId: schedule.id,
        scheduledDate: schedule.scheduledDate,
      }),
    );

    // A day tab lists that day's ceremonies, each under its schedule's name;
    // one held after midnight names its own day.
    test("lists the ceremonies of the chosen day", () => {
      const markup = renderView(
        { rows, schedules },
        "/programa?dia=2026-05-01",
      );

      const text = readScreenText(markup);

      expect(text).toContain("Bloque mañana · Entrega de premios 13:30 hs");
      expect(text).toContain(
        "Bloque noche · Entrega de premios Sábado 2/5 00:15 hs",
      );
      expect(text).not.toContain("Bloque tarde");
    });

    test("shows no ceremonies on `Todos`", () => {
      const markup = renderView({ rows, schedules }, "/programa");

      expect(readScreenText(markup)).not.toContain("Entrega de premios");
    });

    test("shows no card on a day without ceremonies", () => {
      const markup = renderView(
        { rows, schedules },
        "/programa?dia=2026-05-02",
      );

      expect(readScreenText(markup)).not.toContain("Entrega de premios");
    });
  });

  test("points the top bar at the portal only when an academy is signed in", () => {
    expect(renderView({ hasAcademySession: true })).toContain("Ir al portal");
    expect(renderView({ hasAcademySession: true })).not.toContain("Ingresar");

    const anonymous = renderView({ hasAcademySession: false });

    expect(anonymous).toContain("Ingresar");
    expect(anonymous).toContain("/ingresar");
    expect(anonymous).not.toContain("Ir al portal");
  });

  test("prints one page run per schedule, each under its own heading", () => {
    const markup = renderView({
      rows: [
        buildRow({ choreographyId: "one", orderNumber: 1 }),
        buildRow({
          choreographyId: "two",
          orderNumber: 2,
          scheduleId: "schedule-2",
          scheduledDate: "2026-05-02",
        }),
      ],
      schedules: [
        {
          id: "schedule-1",
          name: "Sábado mañana",
          scheduledDate: "2026-05-01",
          startTime: "10:00",
          awardCeremonyDate: null,
          awardCeremonyTime: null,
        },
        {
          id: "schedule-2",
          name: "Domingo tarde",
          scheduledDate: "2026-05-02",
          startTime: "16:00",
          awardCeremonyDate: null,
          awardCeremonyTime: null,
        },
      ],
    });

    expect(markup).toContain(
      "En Escena 2026 · viernes 1 de mayo 10:00 hs · Sábado mañana",
    );
    expect(markup).toContain(
      "En Escena 2026 · sábado 2 de mayo 16:00 hs · Domingo tarde",
    );
    // The headings run once per schedule, and so do the print column headers.
    expect(countOccurrences(markup, "Categoría / Tipo de grupo</th>")).toBe(2);
    expect(countOccurrences(markup, "break-before-page")).toBe(1);
    expect(markup).toContain("break-inside-avoid");
    expect(markup).toContain("@page { size: A4 landscape; margin: 0; }");
    expect(countOccurrences(markup, "12mm")).toBeGreaterThanOrEqual(4);
  });

  // On paper the caveat sits under every page run's heading, and a schedule
  // with a ceremony closes with it after its last presentation.
  test("prints the caveat on every page run and the ceremony after its rows", () => {
    const markup = renderView({
      rows: [
        buildRow({ choreographyId: "one", name: "Primera", orderNumber: 1 }),
        buildRow({
          choreographyId: "two",
          name: "Segunda",
          orderNumber: 2,
          scheduleId: "schedule-2",
        }),
        buildRow({
          choreographyId: "three",
          name: "Tercera",
          orderNumber: 3,
          scheduleId: "schedule-3",
        }),
      ],
      schedules: [
        {
          id: "schedule-1",
          name: "Bloque mañana",
          scheduledDate: "2026-05-01",
          startTime: "10:00",
          awardCeremonyDate: "2026-05-01",
          awardCeremonyTime: "13:30",
        },
        {
          id: "schedule-2",
          name: "Bloque tarde",
          scheduledDate: "2026-05-01",
          startTime: "16:00",
          awardCeremonyDate: null,
          awardCeremonyTime: null,
        },
        {
          id: "schedule-3",
          name: "Bloque noche",
          scheduledDate: "2026-05-01",
          startTime: "21:00",
          awardCeremonyDate: "2026-05-02",
          awardCeremonyTime: "00:15",
        },
      ],
    });
    const printed = readText(markup.slice(markup.indexOf("print:block")));

    // Once on screen, once per page run.
    expect(countOccurrences(markup, programNotice)).toBe(4);
    expect(countOccurrences(printed, programNotice)).toBe(3);
    expect(countOccurrences(printed, "Entrega de premios")).toBe(2);
    expect(printed).toContain("Entrega de premios · 13:30 hs");
    expect(printed).toContain("Entrega de premios · sábado 2 de mayo 00:15 hs");
    // After the last row of its schedule, before the next page run.
    expect(printed.indexOf("Entrega de premios · 13:30 hs")).toBeGreaterThan(
      printed.indexOf("Primera"),
    );
    expect(printed.indexOf("Entrega de premios · 13:30 hs")).toBeLessThan(
      printed.indexOf("Bloque tarde"),
    );
    expect(printed.indexOf("Tercera")).toBeLessThan(
      printed.indexOf("Entrega de premios · sábado"),
    );
  });

  // A date that is a shape and not a day —`2026-13-40`— throws when formatted,
  // and on the only unauthenticated route in the product that would take the
  // whole page down rather than one heading.
  test("keeps printing when a schedule's date is not a day", () => {
    const markup = renderView({
      rows: [buildRow({ scheduledDate: "2026-13-40" })],
      schedules: [
        {
          id: "schedule-1",
          name: "Sábado mañana",
          scheduledDate: "2026-13-40",
          startTime: "10:00",
          awardCeremonyDate: null,
          awardCeremonyTime: null,
        },
      ],
    });

    expect(markup).toContain(
      "En Escena 2026 · 2026-13-40 10:00 hs · Sábado mañana",
    );
  });
});

const programNotice =
  "Los horarios son estimativos y el orden de las presentaciones puede cambiar hasta el día del evento.";

/** What a reader sees, without the markup around it. */
function readText(markup: string) {
  return markup.replace(/<[^>]+>/g, "");
}

/** The screen's text only: the printed program follows it in the markup. */
function readScreenText(markup: string) {
  return readText(markup.slice(0, markup.indexOf("print:block")));
}

function countOccurrences(markup: string, needle: string) {
  return markup.split(needle).length - 1;
}

function buildRow(overrides: Partial<EventProgramRow> = {}): EventProgramRow {
  return {
    academyName: "Academia Sur",
    academyProvince: null,
    categoryName: "Infantil",
    choreographyId: "choreography-1",
    choreographyNumber: 12,
    dancerNames: ["Ana Paz"],
    groupType: "solo",
    isBelowDeposit: false,
    levelLabel: "Amateur",
    modalityName: "Jazz",
    name: "Pieza",
    orderNumber: 1,
    scheduleId: "schedule-1",
    scheduledDate: "2026-05-01",
    submodalityName: null,
    ...overrides,
  };
}

function renderView(
  overrides: Partial<PublicProgramLoaderData> = {},
  url = "/programa",
) {
  const loaderData: PublicProgramLoaderData = {
    event: {
      endsOn: "2026-05-03",
      name: "En Escena 2026",
      startsOn: "2026-05-01",
    },
    hasAcademySession: false,
    rows: [buildRow()],
    schedules: [
      {
        id: "schedule-1",
        name: "Sábado mañana",
        scheduledDate: "2026-05-01",
        startTime: "10:00",
        awardCeremonyDate: null,
        awardCeremonyTime: null,
      },
    ],
    ...overrides,
  };

  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[url]}>
      <PublicProgramView loaderData={loaderData} />
    </MemoryRouter>,
  );
}

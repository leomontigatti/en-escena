/** @vitest-environment jsdom */

import { act } from "react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";

import { defaultClientDataTablePageSize } from "@/components/shared/data-table.shared";
import {
  createReactDomTestRenderer,
  setInputValue,
  updateReactDomForm,
} from "@/lib/test-support/react-dom";

import { ProgramList } from "./list";
import type { ProgramLive, ProgramLiveDay } from "./live-day";
import type { ProgramListRow } from "./shared";

describe("the program list everyone outside the administration reads", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);
  // Two tests fake the clock; this undoes it even when one of them fails.
  afterEach(() => {
    vi.useRealTimers();
  });

  let urlSearch = "";

  function SearchProbe() {
    urlSearch = useLocation().search;

    return null;
  }

  async function mount({
    entry = "/programa",
    live,
    onLivePoll,
    rows,
    showAcademy = true,
  }: {
    entry?: string;
    live?: ProgramLive;
    onLivePoll?: () => void;
    rows: ProgramListRow[];
    showAcademy?: boolean;
  }) {
    await renderer.renderAsync(
      <MemoryRouter initialEntries={[entry]}>
        <ProgramList
          live={live}
          onLivePoll={onLivePoll}
          rows={rows}
          showAcademy={showAcademy}
        />
        <SearchProbe />
      </MemoryRouter>,
    );
  }

  const twoDays = [
    buildRow({
      choreographyId: "one",
      name: "Primera",
      scheduledDate: "2026-05-01",
    }),
    buildRow({
      choreographyId: "two",
      name: "Segunda",
      orderNumber: 2,
      scheduledDate: "2026-05-02",
    }),
  ];

  // Radix activates a trigger on `mousedown`, not on the click after it.
  async function selectTab(index: number) {
    await act(async () => {
      document
        .querySelectorAll('[role="tab"]')
        [index]!.dispatchEvent(
          new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
        );
    });
  }

  // A link shared from a phone, or a reload, lands on the day it was read on.
  test("opens on the day the link names", async () => {
    await mount({ entry: "/programa?dia=2026-05-02", rows: twoDays });

    expect(document.body.textContent).not.toContain("Primera");
    expect(document.body.textContent).toContain("Segunda");
  });

  test("keeps the chosen day in the URL, and no day at all for the whole program", async () => {
    await mount({ rows: twoDays });

    await selectTab(2);
    expect(urlSearch).toBe("?dia=2026-05-02");
    expect(document.body.textContent).not.toContain("Primera");
    expect(document.body.textContent).toContain("Segunda");

    await selectTab(0);
    expect(urlSearch).toBe("");
    expect(document.body.textContent).toContain("Primera");
  });

  function searchInput() {
    const input = document.querySelector("input[placeholder^='Buscar por']");

    if (!(input instanceof HTMLInputElement)) {
      throw new Error("Expected the list's search box to be rendered.");
    }

    return input;
  }

  async function search(query: string) {
    await updateReactDomForm(() => {
      setInputValue(searchInput(), query);
    });
  }

  test("labels each day tab by its weekday and day/month, as the admin's do", async () => {
    await mount({ rows: twoDays });

    const labels = [...document.querySelectorAll('[role="tab"]')].map(
      (tab) => tab.textContent,
    );

    expect(labels).toEqual(["Todos", "Viernes 1/5", "Sábado 2/5"]);
  });

  // The academy column is searched only where it is shown.
  test("searches the numbers, the name and the academy and nothing else", async () => {
    const rows = [
      buildRow({
        academyName: "Academia Sur",
        categoryName: "Infantil",
        choreographyId: "one",
        choreographyNumber: 34,
        modalityName: "Jazz",
        name: "Primera",
        orderNumber: 1,
      }),
      buildRow({
        academyName: "Academia Norte",
        categoryName: "Juvenil",
        choreographyId: "two",
        choreographyNumber: 12,
        modalityName: "Urbano",
        name: "Segunda",
        orderNumber: 2,
      }),
    ];

    await mount({ rows });

    await search("Segunda");
    expect(document.body.textContent).not.toContain("Primera");
    expect(document.body.textContent).toContain("Segunda");

    await search("Academia Sur");
    expect(document.body.textContent).toContain("Primera");
    expect(document.body.textContent).not.toContain("Segunda");

    // The presentation's number, and the choreography's, matched whole.
    await search("1");
    expect(document.body.textContent).toContain("Primera");
    expect(document.body.textContent).not.toContain("Segunda");

    await search("00034");
    expect(document.body.textContent).toContain("Primera");
    expect(document.body.textContent).not.toContain("Segunda");

    await search("Urbano");
    expect(document.body.textContent).toContain(
      "No hay presentaciones que coincidan con la búsqueda.",
    );

    await search("Juvenil");
    expect(document.body.textContent).toContain(
      "No hay presentaciones que coincidan con la búsqueda.",
    );
  });

  test("leaves the academy out of the search where it is not shown", async () => {
    await mount({ rows: twoDays, showAcademy: false });

    await search("Academia Sur");
    expect(document.body.textContent).toContain(
      "No hay presentaciones que coincidan con la búsqueda.",
    );
  });

  test("pages a long program, and goes back to the first page on another day", async () => {
    const rows = Array.from(
      { length: defaultClientDataTablePageSize + 3 },
      (_row, index) =>
        buildRow({
          choreographyId: `choreography-${index + 1}`,
          name: index === 0 ? "Apertura" : `Pieza ${index + 1}`,
          orderNumber: index + 1,
          scheduledDate: index === 0 ? "2026-05-02" : "2026-05-01",
        }),
    );

    await mount({ entry: "/programa?pagina=2", rows });

    expect(document.body.textContent).not.toContain("Apertura");
    expect(document.body.textContent).toContain("Pieza 13");

    await selectTab(2);
    expect(urlSearch).toBe("?dia=2026-05-02");
    expect(document.body.textContent).toContain("Apertura");
  });

  // One line per row, so the program's rows are as tall as the admin's.
  test("names the solo's dancer and dashes every other group", async () => {
    await mount({
      rows: [
        buildRow({ choreographyId: "one", dancerNames: ["Ana Paz"] }),
        buildRow({
          choreographyId: "two",
          dancerNames: ["Bea Lagos", "Caro Vera"],
          groupType: "duo",
          orderNumber: 2,
        }),
      ],
    });

    const dancerCells = [...document.querySelectorAll("tbody tr")].map(
      (row) => row.querySelectorAll("td")[5]?.textContent,
    );

    expect(dancerCells).toEqual(["Ana Paz", "—"]);
  });

  describe("on the day being danced", () => {
    const liveDay: ProgramLiveDay = {
      date: "2026-05-01",
      isOver: false,
      evaluatedChoreographyIds: ["one"],
      startTime: "18:00",
    };
    const liveDayRows = [
      ...twoDays,
      buildRow({
        choreographyId: "three",
        name: "Tercera",
        orderNumber: 3,
        scheduledDate: "2026-05-01",
      }),
    ];

    // Business time is UTC-3 all year.
    function setBusinessNow(text: string) {
      vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
      vi.setSystemTime(new Date(`${text}-03:00`));
    }

    function tabLabels() {
      return [...document.querySelectorAll('[role="tab"]')].map(
        (tab) => tab.textContent,
      );
    }

    function evaluatedMarks() {
      return (
        (document.body.textContent ?? "").split("Ya se presentó").length - 1
      );
    }

    test("badges the day's tab and marks its evaluated rows, on that tab only", async () => {
      setBusinessNow("2026-05-01T19:00:00");
      await mount({
        entry: "/programa?dia=2026-05-01",
        live: { day: liveDay, loadedOn: liveDay.date },
        rows: liveDayRows,
      });

      expect(tabLabels()).toEqual([
        "Todos",
        "Viernes 1/5En vivo",
        "Sábado 2/5",
      ]);
      // The card's badge and the table's check, for the one evaluated row.
      expect(evaluatedMarks()).toBe(2);

      await selectTab(0);
      expect(evaluatedMarks()).toBe(0);
      await selectTab(2);
      expect(evaluatedMarks()).toBe(0);
    });

    function selectedTab() {
      return document.querySelector('[role="tab"][aria-selected="true"]')
        ?.textContent;
    }

    // The checks and the minute's poll live on that tab, so a reader who
    // never taps it would see neither.
    test("opens on the live day's tab, and names every tab chosen after it in the URL", async () => {
      setBusinessNow("2026-05-01T19:00:00");
      await mount({
        live: { day: liveDay, loadedOn: liveDay.date },
        rows: liveDayRows,
      });

      expect(selectedTab()).toBe("Viernes 1/5En vivo");
      expect(evaluatedMarks()).toBe(2);

      await selectTab(0);
      expect(urlSearch).toBe("?dia=todos");
      expect(selectedTab()).toBe("Todos");

      // Named too, or the link would open on `Todos` once the show is over.
      await selectTab(1);
      expect(urlSearch).toBe("?dia=2026-05-01");
    });

    test("opens on Todos before the show starts and once the day is over", async () => {
      setBusinessNow("2026-05-01T10:00:00");
      await mount({
        live: { day: liveDay, loadedOn: liveDay.date },
        rows: liveDayRows,
      });
      expect(selectedTab()).toBe("Todos");

      renderer.cleanup();
      setBusinessNow("2026-05-01T19:00:00");
      await mount({
        live: { day: { ...liveDay, isOver: true }, loadedOn: liveDay.date },
        rows: liveDayRows,
      });
      expect(selectedTab()).toBe("Todos");
    });

    // Opened while live, the page stays on the tab it was read on when the
    // day's last presentation is evaluated.
    test("keeps the tab it opened on when the badge goes off", async () => {
      setBusinessNow("2026-05-01T19:00:00");
      const onLivePoll = vi.fn();
      const live = { day: liveDay, loadedOn: liveDay.date };
      await mount({ live, onLivePoll, rows: liveDayRows });

      await mount({
        live: { ...live, day: { ...liveDay, isOver: true } },
        onLivePoll,
        rows: liveDayRows,
      });

      expect(selectedTab()).toBe("Viernes 1/5");
    });

    test("marks the rows before the show starts, with no badge yet", async () => {
      setBusinessNow("2026-05-01T10:00:00");
      await mount({
        entry: "/programa?dia=2026-05-01",
        live: { day: liveDay, loadedOn: liveDay.date },
        rows: liveDayRows,
      });

      expect(tabLabels()).toEqual(["Todos", "Viernes 1/5", "Sábado 2/5"]);
      expect(evaluatedMarks()).toBe(2);
    });

    test("polls every minute while live on its tab, and stops on another", async () => {
      setBusinessNow("2026-05-01T19:00:00");
      const onLivePoll = vi.fn();
      await mount({
        entry: "/programa?dia=2026-05-01",
        live: { day: liveDay, loadedOn: liveDay.date },
        onLivePoll,
        rows: liveDayRows,
      });

      await act(async () => {
        vi.advanceTimersByTime(60_000);
      });
      expect(onLivePoll).toHaveBeenCalledTimes(1);

      await selectTab(0);
      await act(async () => {
        vi.advanceTimersByTime(180_000);
      });
      expect(onLivePoll).toHaveBeenCalledTimes(1);
    });

    test("never polls once the day's last presentation is evaluated", async () => {
      setBusinessNow("2026-05-01T19:00:00");
      const onLivePoll = vi.fn();
      await mount({
        entry: "/programa?dia=2026-05-01",
        live: { day: { ...liveDay, isOver: true }, loadedOn: liveDay.date },
        onLivePoll,
        rows: liveDayRows,
      });

      await act(async () => {
        vi.advanceTimersByTime(180_000);
      });
      expect(onLivePoll).not.toHaveBeenCalled();
      expect(tabLabels()).not.toContain("Viernes 1/5En vivo");
    });
  });

  // Only the loader knows a day's evaluated rows, so a page left open across
  // 03:00 asks for them, or it would wait for a reload that never comes.
  test("asks for the new day's data once its judging day begins", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(new Date("2026-05-01T02:59:30-03:00"));
    const onLivePoll = vi.fn();
    await mount({
      live: { day: null, loadedOn: "2026-04-30" },
      onLivePoll,
      rows: twoDays,
    });

    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    expect(onLivePoll).toHaveBeenCalledTimes(1);
  });

  test("carries no state column on either surface", async () => {
    await mount({
      rows: [buildRow({ isBelowDeposit: true, orderNumber: null })],
      showAcademy: false,
    });

    expect(document.body.textContent).not.toContain("Estado");
    expect(document.body.textContent).not.toContain("Seña pendiente");
  });
});

function buildRow(overrides: Partial<ProgramListRow> = {}): ProgramListRow {
  return {
    academyName: "Academia Sur",
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
    scheduledDate: "2026-05-01",
    submodalityName: null,
    ...overrides,
  };
}

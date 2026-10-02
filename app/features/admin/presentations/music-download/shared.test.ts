import { describe, expect, test } from "vitest";

import { buildMusicDownloadHref, planMusicArchive } from "./shared";

const morning = { id: "s1", name: "Mañana", startTime: "10:00" };
const evening = { id: "s2", name: "Noche", startTime: "20:30" };

function row(
  orderNumber: number,
  overrides: Partial<
    Parameters<typeof planMusicArchive>[0]["rows"][number]
  > = {},
) {
  return {
    academyName: "Estudio Ritmo",
    musicStorageKey: `academies/a/choreographies/c${orderNumber}/music.mp3`,
    name: `Coreografía ${orderNumber}`,
    orderNumber,
    scheduleId: morning.id,
    ...overrides,
  };
}

describe("the day's music archive", () => {
  test("names each file by its padded number, choreography and academy", () => {
    const plan = planMusicArchive({
      day: "2026-10-10",
      eventName: "Gala Primavera",
      highestOrderNumber: 120,
      rows: [
        row(7, { musicStorageKey: "academies/a/choreographies/c7/music.wav" }),
        row(45),
      ],
      schedules: [morning],
    });

    expect(plan.fileName).toBe("audios-gala-primavera-2026-10-10.zip");
    expect(plan.files).toEqual([
      {
        path: "007 - Coreografía 7 - Estudio Ritmo.wav",
        storageKey: "academies/a/choreographies/c7/music.wav",
      },
      {
        path: "045 - Coreografía 45 - Estudio Ritmo.mp3",
        storageKey: "academies/a/choreographies/c45/music.mp3",
      },
    ]);
    expect(plan.missingList).toBeNull();
  });

  test("strips the characters a file system rejects and keeps the accents", () => {
    const plan = planMusicArchive({
      day: "2026-10-10",
      eventName: "Gala",
      highestOrderNumber: 9,
      rows: [
        row(3, {
          academyName: "  Danzas: Ñandú  ",
          name: 'Ángel/Demonio "versión*2"?',
        }),
      ],
      schedules: [morning],
    });

    expect(plan.files[0]?.path).toBe(
      "3 - ÁngelDemonio versión2 - Danzas Ñandú.mp3",
    );
  });

  test("trims a very long name", () => {
    const plan = planMusicArchive({
      day: "2026-10-10",
      eventName: "Gala",
      highestOrderNumber: 9,
      rows: [row(1, { name: "a".repeat(300) })],
      schedules: [morning],
    });

    expect(plan.files[0]?.path).toBe(
      `1 - ${"a".repeat(80)} - Estudio Ritmo.mp3`,
    );
  });

  test("puts each schedule in its own folder when the day has more than one", () => {
    const plan = planMusicArchive({
      day: "2026-10-10",
      eventName: "Gala",
      highestOrderNumber: 12,
      rows: [row(1), row(12, { scheduleId: evening.id })],
      schedules: [morning, evening],
    });

    expect(plan.files.map((file) => file.path)).toEqual([
      "10.00 - Mañana/01 - Coreografía 1 - Estudio Ritmo.mp3",
      "20.30 - Noche/12 - Coreografía 12 - Estudio Ritmo.mp3",
    ]);
  });

  test("lists the presentations without music, by schedule", () => {
    const plan = planMusicArchive({
      day: "2026-10-10",
      eventName: "Gala",
      highestOrderNumber: 12,
      rows: [
        row(1, { musicStorageKey: null }),
        row(2),
        row(12, { musicStorageKey: null, scheduleId: evening.id }),
      ],
      schedules: [morning, evening],
    });

    expect(plan.files.map((file) => file.path)).toEqual([
      "10.00 - Mañana/02 - Coreografía 2 - Estudio Ritmo.mp3",
    ]);
    expect(plan.missingList).toBe(
      [
        "Presentaciones sin audio cargado",
        "",
        "10.00 - Mañana",
        "N.º 1 - Coreografía 1 - Estudio Ritmo",
        "",
        "20.30 - Noche",
        "N.º 12 - Coreografía 12 - Estudio Ritmo",
        "",
      ].join("\r\n"),
    );
  });

  test("lists the missing ones without headings on a single-schedule day", () => {
    const plan = planMusicArchive({
      day: "2026-10-10",
      eventName: "Gala",
      highestOrderNumber: 3,
      rows: [row(3, { musicStorageKey: null })],
      schedules: [morning],
    });

    expect(plan.files).toEqual([]);
    expect(plan.missingList).toBe(
      [
        "Presentaciones sin audio cargado",
        "",
        "N.º 3 - Coreografía 3 - Estudio Ritmo",
        "",
      ].join("\r\n"),
    );
  });
});

test("the download address carries the day", () => {
  expect(buildMusicDownloadHref("2026-10-10")).toBe(
    "/administracion/presentacion/audios?dia=2026-10-10",
  );
});

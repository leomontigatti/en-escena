import { describe, expect, test } from "vitest";

import { seminarExportLabels, seminarSheetNames } from "./shared";

function seminar(
  id: string,
  instructorName: string,
  scheduledDate = "2026-05-02",
  startTime = "10:00",
) {
  return { id, instructorName, scheduledDate, startTime };
}

describe("naming a seminar in the export", () => {
  test("goes by the instructor alone while the name is unique", () => {
    const seminars = [
      seminar("a", "Julio Bocca"),
      seminar("b", "Alicia Alonso"),
    ];

    expect([...seminarExportLabels(seminars).values()]).toEqual([
      "Julio Bocca",
      "Alicia Alonso",
    ]);
    expect([...seminarSheetNames(seminars).values()]).toEqual([
      "Julio Bocca",
      "Alicia Alonso",
    ]);
  });

  test("adds the date and time to a name two seminars share, whatever its case", () => {
    const seminars = [
      seminar("a", "Julio Bocca", "2026-05-02", "10:00"),
      seminar("b", "julio bocca", "2026-05-03", "18:30"),
    ];

    expect([...seminarExportLabels(seminars).values()]).toEqual([
      "Julio Bocca · 02/05 10:00",
      "julio bocca · 03/05 18:30",
    ]);
    expect([...seminarSheetNames(seminars).values()]).toEqual([
      "Julio Bocca 02-05 10h00",
      "julio bocca 03-05 18h30",
    ]);
  });

  test("writes a sheet name a spreadsheet accepts", () => {
    const sheetNames = seminarSheetNames([
      seminar("a", "Ana: Jazz / Contemporáneo [nivel*?]"),
      seminar("b", "Un nombre de instructor demasiado largo para una hoja"),
      seminar("c", "Un nombre de instructor demasiado largo para otra hoja"),
      seminar("d", "/"),
      seminar("e", "Seminario"),
    ]);

    expect([...sheetNames.values()]).toEqual([
      "Ana Jazz Contemporáneo nivel",
      "Un nombre de instructor demasia",
      "Un nombre de instructor dem (2)",
      "Seminario",
      "Seminario (2)",
    ]);
  });
});

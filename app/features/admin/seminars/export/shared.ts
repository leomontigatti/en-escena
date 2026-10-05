import { slugify } from "@/lib/shared/slugify";

/**
 * What the auditor's seminar export and the dialog that starts it agree on:
 * where the download lives, the parameter the choice travels in, the choice
 * that takes every seminar, and how a seminar is named in the dialog, on its
 * sheet and in the file.
 *
 * A seminar is named by its instructor. The name is not unique (two seminars
 * of one instructor are allowed), so a name shared within the set gets its
 * date and time; a unique one goes bare.
 */

const seminarsExportPath = "/administracion/seminarios/exportar";

export const exportSeminarParam = "seminario";
/** The choice that exports every seminar, listed first in the dialog. */
export const exportAllSeminars = "todos";

/** What naming needs of a seminar. */
export type NamedSeminar = {
  id: string;
  instructorName: string;
  scheduledDate: string;
  startTime: string;
};

export function buildSeminarExportHref(seminar: string) {
  const params = new URLSearchParams({ [exportSeminarParam]: seminar });

  return `${seminarsExportPath}?${params.toString()}`;
}

/** The dialog's label of each seminar: `Instructor` or `Instructor · 02/05 10:00`. */
export function seminarExportLabels(
  seminars: readonly NamedSeminar[],
): Map<string, string> {
  return nameSeminars(
    seminars,
    (seminar) =>
      `${seminar.instructorName} · ${dayMonth(seminar.scheduledDate, "/")} ${seminar.startTime.slice(0, 5)}`,
  );
}

/** A spreadsheet refuses these in a sheet's name. */
const forbiddenSheetNameCharacters = /[:\\/?*[\]]/g;
/** And caps the name at this many characters. */
const sheetNameMaxLength = 31;

/**
 * Each seminar's sheet name: the same naming as the dialog's, written with
 * what a sheet name allows (`Instructor 02-05 10h00`), cut to the spreadsheet's
 * limit. Cutting can make two names equal again, so a repeat gets a counter.
 */
export function seminarSheetNames(
  seminars: readonly NamedSeminar[],
): Map<string, string> {
  const named = nameSeminars(
    seminars,
    (seminar) =>
      `${seminar.instructorName} ${dayMonth(seminar.scheduledDate, "-")} ${seminar.startTime.slice(0, 5).replace(":", "h")}`,
  );
  const taken = new Set<string>();
  const sheetNames = new Map<string, string>();

  for (const [id, name] of named) {
    // A name made only of refused characters would leave the sheet unnamed,
    // which the writer fills with a default that may repeat another's.
    const clean =
      name
        .replace(forbiddenSheetNameCharacters, " ")
        .replace(/\s+/g, " ")
        .trim() || "Seminario";
    let sheetName = clean.slice(0, sheetNameMaxLength).trim();

    for (let repeat = 2; taken.has(sheetName.toLowerCase()); repeat += 1) {
      const suffix = ` (${repeat})`;

      sheetName = `${clean.slice(0, sheetNameMaxLength - suffix.length).trim()}${suffix}`;
    }

    taken.add(sheetName.toLowerCase());
    sheetNames.set(id, sheetName);
  }

  return sheetNames;
}

/**
 * `seminarios-<event>-todos.xlsx`, or `seminarios-<event>-<seminar>.xlsx`
 * with the seminar named as in the dialog, which a sheet name's limit has not
 * cut.
 */
export function buildSeminarsExportFileName(
  eventName: string,
  seminarLabel: string | null,
) {
  return `seminarios-${slugify(eventName)}-${seminarLabel === null ? exportAllSeminars : slugify(seminarLabel) || "seminario"}.xlsx`;
}

function nameSeminars(
  seminars: readonly NamedSeminar[],
  disambiguated: (seminar: NamedSeminar) => string,
): Map<string, string> {
  const uses = new Map<string, number>();

  for (const seminar of seminars) {
    const key = seminar.instructorName.toLowerCase();

    uses.set(key, (uses.get(key) ?? 0) + 1);
  }

  return new Map(
    seminars.map((seminar) => [
      seminar.id,
      (uses.get(seminar.instructorName.toLowerCase()) ?? 0) > 1
        ? disambiguated(seminar)
        : seminar.instructorName,
    ]),
  );
}

/** `2026-05-02` as `02/05` or `02-05`. */
function dayMonth(date: string, separator: string) {
  const [, month, day] = date.split("-");

  return `${day}${separator}${month}`;
}

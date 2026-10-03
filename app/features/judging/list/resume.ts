import type { JudgeScoreStatus } from "@/lib/judging/judge-status";

/**
 * Where a judge coming back to the list left off. It counts from the last
 * presentation they opened rather than from the top, so a judge who scored out
 * of order is not sent back to a row they deliberately skipped — and when the
 * show has run past that point it wraps to the first pending one, which is what
 * is left to do.
 */
export function findResumePresentationId(
  rows: readonly { presentationId: string; status: JudgeScoreStatus }[],
  lastOpenedPresentationId: string | null,
): string | null {
  const isPending = (row: { status: JudgeScoreStatus }) =>
    row.status === "pending";
  const lastOpenedIndex = rows.findIndex(
    (row) => row.presentationId === lastOpenedPresentationId,
  );
  const next = rows.slice(lastOpenedIndex + 1).find(isPending);

  return (next ?? rows.find(isPending))?.presentationId ?? null;
}

/**
 * The row the list marks and scrolls to. The marker belongs to the show running
 * now, so a day that is not open, past or coming, has none.
 */
export function findResumeMarkerPresentationId(
  rows: readonly { presentationId: string; status: JudgeScoreStatus }[],
  lastOpenedPresentationId: string | null,
  isOpen: boolean,
): string | null {
  return isOpen
    ? findResumePresentationId(rows, lastOpenedPresentationId)
    : null;
}

/**
 * Where the last opened presentation is remembered. The session is the right
 * scope: it is the judge's place in today's show and means nothing tomorrow,
 * and it never leaves the device, so no other judge's work is implied by it.
 */
export const lastOpenedPresentationStorageKey =
  "en-escena:juzgamiento:ultima-presentacion";

export function rememberOpenedPresentation(presentationId: string) {
  window.sessionStorage.setItem(
    lastOpenedPresentationStorageKey,
    presentationId,
  );
}

export function readLastOpenedPresentationId(): string | null {
  return window.sessionStorage.getItem(lastOpenedPresentationStorageKey);
}

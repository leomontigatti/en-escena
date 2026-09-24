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

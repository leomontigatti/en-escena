/**
 * Where the wizard keeps its answers so a reload of the tab brings them back.
 * `sessionStorage`: it survives a reload, not closing the tab, so a shared
 * phone does not keep one academy's answers for the next. The key names the
 * academy and the event, so answers never cross into another of either.
 *
 * Storage can be unavailable (a private window, a full quota); the wizard then
 * simply does not survive a reload, which is how it behaved before.
 */
export function getAnswersStorageKey(input: {
  academyId: string;
  eventId: string;
}) {
  return `registro-coreografia:${input.academyId}:${input.eventId}`;
}

export function readStoredAnswers(key: string): unknown {
  try {
    const stored = window.sessionStorage.getItem(key);

    return stored === null ? null : JSON.parse(stored);
  } catch {
    return null;
  }
}

export function writeStoredAnswers(key: string, answers: unknown) {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(answers));
  } catch {
    // Unavailable storage only costs surviving a reload.
  }
}

export function clearStoredAnswers(key: string) {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Unavailable storage holds nothing to clear.
  }
}

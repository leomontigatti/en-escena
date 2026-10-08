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
  } catch (error) {
    // Unparseable answers are no answers, like unavailable storage.
    if (isStorageUnavailable(error) || error instanceof SyntaxError) {
      return null;
    }

    throw error;
  }
}

export function writeStoredAnswers(key: string, answers: unknown) {
  // Serialized outside the `try`: answers that cannot be are a bug, not
  // unavailable storage.
  const serialized = JSON.stringify(answers);

  try {
    window.sessionStorage.setItem(key, serialized);
  } catch (error) {
    // Unavailable storage only costs surviving a reload.
    if (!isStorageUnavailable(error)) {
      throw error;
    }
  }
}

export function clearStoredAnswers(key: string) {
  try {
    window.sessionStorage.removeItem(key);
  } catch (error) {
    // Unavailable storage holds nothing to clear.
    if (!isStorageUnavailable(error)) {
      throw error;
    }
  }
}

// What a private window (`SecurityError`) and a full quota
// (`QuotaExceededError`) throw.
function isStorageUnavailable(error: unknown) {
  return (
    error instanceof DOMException &&
    (error.name === "SecurityError" || error.name === "QuotaExceededError")
  );
}

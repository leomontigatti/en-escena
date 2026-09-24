/**
 * What the score form holds for the `Devolución`, between the take the judge
 * records and the multipart the action reads. The server understands three
 * words — keep, replace and remove (see the action's
 * `readFeedbackAudioSubmission`) — and this is what decides which one a form
 * posts, so a recorder that was opened and never used never deletes anything.
 *
 * It is also what tells the discard guard that a take was recorded or thrown
 * away, which no field state knows about.
 */

/** A take recorded in this form: the bytes to post, and a URL to play it from. */
export type RecordedTake = {
  blob: Blob;
  url: string;
};

export type FeedbackAudioFieldState = {
  /** Whether the stored take was deleted in this form. */
  isRemoved: boolean;
  /** What the server has stored, signed for playback; null when it has none. */
  storedUrl: string | null;
  take: RecordedTake | null;
};

export function initialFeedbackAudioField(
  storedUrl: string | null,
): FeedbackAudioFieldState {
  return { isRemoved: false, storedUrl, take: null };
}

export type FeedbackAudioFieldEvent =
  { take: RecordedTake; type: "recorded" } | { type: "deleted" };

export function reduceFeedbackAudioField(
  state: FeedbackAudioFieldState,
  event: FeedbackAudioFieldEvent,
): FeedbackAudioFieldState {
  switch (event.type) {
    case "recorded": {
      return { ...state, isRemoved: false, take: event.take };
    }
    case "deleted": {
      return { ...state, isRemoved: true, take: null };
    }
  }
}

/** What the row plays: the take just recorded, otherwise what is stored. */
export function feedbackAudioFieldUrl(state: FeedbackAudioFieldState) {
  if (state.take) {
    return state.take.url;
  }

  return state.isRemoved ? null : state.storedUrl;
}

export type FeedbackAudioFieldSubmission =
  { blob: Blob; intent: "replace" } | { intent: "keep" } | { intent: "remove" };

export function feedbackAudioFieldSubmission(
  state: FeedbackAudioFieldState,
): FeedbackAudioFieldSubmission {
  if (state.take) {
    return { blob: state.take.blob, intent: "replace" };
  }

  // Deleting a take that was never saved asks the server for nothing: there is
  // no stored object to remove, and `remove` would only be a slower `keep`.
  if (state.isRemoved && state.storedUrl !== null) {
    return { intent: "remove" };
  }

  return { intent: "keep" };
}

/** Whether there is a `Devolución` in the form that saving is what keeps. */
export function isFeedbackAudioFieldDirty(state: FeedbackAudioFieldState) {
  return feedbackAudioFieldSubmission(state).intent !== "keep";
}

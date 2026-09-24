/**
 * The clock behind the `Devolución` recorder: which phase a take is in and how
 * much of it has been recorded. Pauses split a take into stretches, so the
 * elapsed time is what was recorded before the current stretch plus whatever
 * that stretch has run for — the wall clock between the first tap and the last
 * would count the pauses too.
 *
 * It is a plain reducer over what the judge and the mic do, apart from
 * `MediaRecorder` itself, so the cap and the pause arithmetic can be read
 * without a browser. The recorder that drives it lives in
 * app/features/judging/score/feedback-recorder.tsx.
 */

/** A take stops itself here: three minutes is as long as a `Devolución` gets. */
export const maxRecordingMs = 180_000;

export type TakePhase = "idle" | "requesting" | "recording" | "paused";

export type TakeState = {
  phase: TakePhase;
  /** What was recorded before the current stretch. */
  recordedMs: number;
  /** When the current stretch started; null unless recording. */
  resumedAt: number | null;
};

export const idleTakeState: TakeState = {
  phase: "idle",
  recordedMs: 0,
  resumedAt: null,
};

export type TakeEvent =
  /** The mic was asked for, and has not answered yet. */
  | { type: "requested" }
  /** The mic answered and `MediaRecorder` is running. */
  | { at: number; type: "started" }
  | { at: number; type: "paused" }
  | { at: number; type: "resumed" }
  /** The mic refused, so there is nothing to record with. */
  | { type: "failed" }
  /** The take was stopped, at will or at the cap. */
  | { type: "finished" };

export function reduceTake(state: TakeState, event: TakeEvent): TakeState {
  switch (event.type) {
    case "requested": {
      return { ...idleTakeState, phase: "requesting" };
    }
    case "started": {
      return { phase: "recording", recordedMs: 0, resumedAt: event.at };
    }
    case "paused": {
      return {
        phase: "paused",
        recordedMs: takeElapsedMs(state, event.at),
        resumedAt: null,
      };
    }
    case "resumed": {
      return { ...state, phase: "recording", resumedAt: event.at };
    }
    case "failed":
    case "finished": {
      return idleTakeState;
    }
  }
}

/** How long the take runs for as of `now`, never past the cap. */
export function takeElapsedMs(state: TakeState, now: number) {
  const currentStretchMs =
    state.resumedAt === null ? 0 : Math.max(0, now - state.resumedAt);

  return Math.min(maxRecordingMs, state.recordedMs + currentStretchMs);
}

/** Whether the take has run its three minutes and must stop itself. */
export function hasFilledTake(state: TakeState, now: number) {
  return takeElapsedMs(state, now) >= maxRecordingMs;
}

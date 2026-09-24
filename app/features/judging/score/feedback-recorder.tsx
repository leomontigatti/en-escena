import { AlertCircleIcon, Check, Pause } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldLegend, FieldSet } from "@/components/ui/field";
import type { RecordedTake } from "@/lib/judging/feedback-audio-field";
import {
  hasFilledTake,
  idleTakeState,
  maxRecordingMs,
  reduceTake,
  takeElapsedMs,
  type TakeEvent,
  type TakeState,
} from "@/lib/judging/feedback-take";
import {
  emptyLevels,
  formatDuration,
  micLevel,
} from "@/lib/judging/feedback-waveform";

import { FeedbackPlayback } from "./feedback-playback";
import { MediaRow, MediaTime, Waveform } from "./feedback-waveform";

export const microphoneErrorMessage =
  "No se pudo usar el micrófono. Revisá el permiso del navegador y volvé a intentar.";

const tickMs = 100;

/** What a live take needs torn down: the recorder, the mic and the analyser. */
type Session = {
  analyser: AnalyserNode;
  audioContext: AudioContext;
  recorder: MediaRecorder;
  stream: MediaStream;
  timer: number;
};

/**
 * One take on the device mic with `MediaRecorder` (webm/opus, Chrome only):
 * start, pause and resume, stop at will or at the three-minute cap the
 * recorder enforces itself. The finished audio goes to `onRecorded`; the
 * phases and the elapsed time are app/lib/judging/feedback-take.ts.
 */
function useFeedbackTake(onRecorded: (take: RecordedTake) => void) {
  const [take, setTake] = useState<TakeState>(idleTakeState);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [levels, setLevels] = useState(emptyLevels);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<Session | null>(null);
  // The ticking interval reads the take outside a render, so it needs the
  // current one rather than the one its closure was created with.
  const takeRef = useRef<TakeState>(idleTakeState);

  useEffect(
    () => () => {
      const session = sessionRef.current;
      if (session) {
        // Unmounting mid-take drops it: nothing is left to hand the audio to.
        session.recorder.onstop = null;
        endSession(session);
      }
    },
    [],
  );

  function applyTakeEvent(event: TakeEvent) {
    takeRef.current = reduceTake(takeRef.current, event);
    setTake(takeRef.current);
  }

  function endSession(session: Session) {
    window.clearInterval(session.timer);
    if (session.recorder.state !== "inactive") {
      session.recorder.stop();
    }
    session.stream.getTracks().forEach((track) => track.stop());
    void session.audioContext.close();
    sessionRef.current = null;
  }

  async function startRecording() {
    setError(null);
    applyTakeEvent({ type: "requested" });

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError(microphoneErrorMessage);
      applyTakeEvent({ type: "failed" });
      return;
    }

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "";
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    const chunks: Blob[] = [];
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    audioContext.createMediaStreamSource(stream).connect(analyser);

    recorder.ondataavailable = (event) => {
      chunks.push(event.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder.mimeType });
      onRecorded({ blob, url: URL.createObjectURL(blob) });
      applyTakeEvent({ type: "finished" });
    };

    const session: Session = {
      analyser,
      audioContext,
      recorder,
      stream,
      timer: window.setInterval(() => {
        if (takeRef.current.phase !== "recording") {
          return;
        }
        const now = Date.now();
        setElapsedMs(takeElapsedMs(takeRef.current, now));
        setLevels((current) => [...current.slice(1), readMicLevel(analyser)]);
        if (hasFilledTake(takeRef.current, now)) {
          endSession(session);
        }
      }, tickMs),
    };

    recorder.start();
    sessionRef.current = session;
    setElapsedMs(0);
    setLevels(emptyLevels());
    applyTakeEvent({ at: Date.now(), type: "started" });
  }

  function togglePause() {
    const session = sessionRef.current;
    if (!session) {
      return;
    }

    if (takeRef.current.phase === "paused") {
      session.recorder.resume();
      applyTakeEvent({ at: Date.now(), type: "resumed" });
      return;
    }

    session.recorder.pause();
    applyTakeEvent({ at: Date.now(), type: "paused" });
  }

  function stopRecording() {
    if (sessionRef.current) {
      endSession(sessionRef.current);
    }
  }

  return {
    elapsedMs,
    error,
    levels,
    phase: take.phase,
    startRecording,
    stopRecording,
    togglePause,
  };
}

/** The mic's loudness right now, read off the analyser's waveform. */
function readMicLevel(analyser: AnalyserNode) {
  const samples = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(samples);

  return micLevel(samples);
}

/**
 * The `Devolución` in one row of the score form: record a take with a live
 * waveform, listen back to it, and delete it. The judge talks while they watch
 * the stage, so it never asks for more than a tap.
 */
export function FeedbackRecorder({
  audioUrl,
  disabled = false,
  error,
  onDelete,
  onRecorded,
}: {
  audioUrl: string | null;
  disabled?: boolean;
  /** What a save refused the take for, which the mic itself cannot report. */
  error?: string;
  onDelete: () => void;
  onRecorded: (take: RecordedTake) => void;
}) {
  const take = useFeedbackTake(onRecorded);
  const message = take.error ?? error;

  return (
    <FieldSet>
      <FieldLegend variant="label">
        Devolución{" "}
        <span className="font-normal text-muted-foreground">(opcional)</span>
      </FieldLegend>

      {audioUrl && take.phase === "idle" ? (
        <FeedbackPlayback
          audioUrl={audioUrl}
          disabled={disabled}
          onDelete={onDelete}
        />
      ) : (
        <TakeBar take={take} disabled={disabled} />
      )}

      {message ? (
        <Alert variant="destructive">
          <AlertCircleIcon aria-hidden="true" />
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}
    </FieldSet>
  );
}

/**
 * The recorder in one row like the browser's own audio player. Before the take
 * starts, the red dot where pause will be is what starts it.
 */
function TakeBar({
  disabled,
  take,
}: {
  disabled: boolean;
  take: ReturnType<typeof useFeedbackTake>;
}) {
  const { phase, stopRecording } = take;
  const isLive = phase === "recording" || phase === "paused";

  return (
    <MediaRow>
      <TakeControlButton take={take} disabled={disabled} />
      <MediaTime>
        {formatDuration(isLive ? take.elapsedMs : 0)} /{" "}
        {formatDuration(maxRecordingMs)}
      </MediaTime>
      <Waveform
        levels={isLive ? take.levels : emptyLevels()}
        activeRatio={phase === "recording" ? 1 : 0}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Terminar grabación"
        disabled={!isLive}
        onClick={stopRecording}
      >
        <Check aria-hidden="true" />
      </Button>
      {isLive ? (
        <span className="sr-only" aria-live="polite">
          {phase === "paused" ? "Grabación en pausa" : "Grabando"}
        </span>
      ) : null}
    </MediaRow>
  );
}

/** The red dot that starts or resumes a take, apart from playback's play. */
function RecordDot() {
  return (
    <span aria-hidden="true" className="size-3 rounded-full bg-destructive" />
  );
}

/**
 * Where pause lives while recording. Otherwise a red dot, never a play icon,
 * so it does not read as playback: it starts the take, or resumes it.
 */
function TakeControlButton({
  disabled,
  take,
}: {
  disabled: boolean;
  take: ReturnType<typeof useFeedbackTake>;
}) {
  const { phase, startRecording, togglePause } = take;

  if (phase === "recording") {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Pausar"
        onClick={togglePause}
      >
        <Pause aria-hidden="true" />
      </Button>
    );
  }

  if (phase === "paused") {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Reanudar"
        onClick={togglePause}
      >
        <RecordDot />
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label="Empezar a grabar"
      disabled={disabled || phase === "requesting"}
      onClick={() => void startRecording()}
    >
      {/* Stays a dot while the mic opens: pause appears once it is live. */}
      <RecordDot />
    </Button>
  );
}

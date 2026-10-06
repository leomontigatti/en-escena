import { Check, CircleAlert, Pause } from "lucide-react";
import { useEffect, useRef, useState, type ComponentProps } from "react";

import { MediaRow, MediaTime } from "@/components/shared/audio-playback";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldLegend, FieldSet } from "@/components/ui/field";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import { emptyLevels, micLevel } from "@/lib/judging/feedback-waveform";
import { formatDuration } from "@/lib/shared/format-duration";

import { FeedbackPlayback } from "./feedback-playback";
import { Waveform } from "./feedback-waveform";

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
    // Closing the analyser's context carries nothing back: it only rejects on a
    // context that is already closed, which is the state this asks for anyway.
    void session.audioContext.close();
    sessionRef.current = null;
  }

  async function startRecording() {
    setError(null);
    applyTakeEvent({ type: "requested" });

    // The mic permission, the recorder and the analyser fail the same way as
    // far as the judge is concerned — the take did not start — so they are
    // refused together, and `startRecording` never rejects.
    let stream: MediaStream;
    let recorder: MediaRecorder;
    let audioContext: AudioContext;
    let analyser: AnalyserNode;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "";
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      audioContext = new AudioContext();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      audioContext.createMediaStreamSource(stream).connect(analyser);
    } catch {
      setError(microphoneErrorMessage);
      applyTakeEvent({ type: "failed" });
      return;
    }

    const chunks: Blob[] = [];

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
  legendVariant = "label",
  onDelete,
  onRecorded,
}: {
  audioUrl: string | null;
  disabled?: boolean;
  /** `legend` on a sheet, where it heads a part like the criteria's. */
  legendVariant?: "label" | "legend";
  onDelete: () => void;
  onRecorded: (take: RecordedTake) => void;
}) {
  // Every take this component records is an object URL it owns, and nothing
  // else can free it: the field state is pure, and the stored URL it may hold
  // instead is the server's and must never be revoked. A judge re-records on a
  // tablet that stays open all day, so a dropped take has to be let go here.
  const createdUrlRef = useRef<string | null>(null);

  function revokeCreatedUrl() {
    if (createdUrlRef.current) {
      URL.revokeObjectURL(createdUrlRef.current);
      createdUrlRef.current = null;
    }
  }

  useEffect(
    () => () => {
      if (createdUrlRef.current) {
        URL.revokeObjectURL(createdUrlRef.current);
      }
    },
    [],
  );

  const take = useFeedbackTake((recorded) => {
    revokeCreatedUrl();
    createdUrlRef.current = recorded.url;
    onRecorded(recorded);
  });
  function handleDelete() {
    revokeCreatedUrl();
    onDelete();
  }

  return (
    // A fieldset is as wide as its content at least, and the waveform's bars
    // are wider than a phone: `min-w-0` lets the row shrink instead.
    <FieldSet className="min-w-0">
      <FieldLegend variant={legendVariant}>
        Devolución{" "}
        <span className="font-normal text-muted-foreground">(opcional)</span>
      </FieldLegend>

      {audioUrl && take.phase === "idle" ? (
        <FeedbackPlayback
          audioUrl={audioUrl}
          disabled={disabled}
          onDelete={handleDelete}
        />
      ) : (
        <TakeBar take={take} disabled={disabled} />
      )}

      {take.error ? (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>No se pudo usar el micrófono</AlertTitle>
          <AlertDescription>{take.error}</AlertDescription>
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
      <TakeButton
        label="Terminar grabación"
        disabled={!isLive}
        onClick={stopRecording}
      >
        <Check aria-hidden="true" />
      </TakeButton>
      {isLive ? (
        <span className="sr-only" aria-live="polite">
          {phase === "paused" ? "Grabación en pausa" : "Grabando"}
        </span>
      ) : null}
    </MediaRow>
  );
}

/**
 * An icon-only control of the take whose icon does not say what it does (the
 * check, the red dot), so its name shows as a tooltip on hover and focus.
 */
function TakeButton({
  label,
  ...buttonProps
}: Omit<
  ComponentProps<typeof Button>,
  "aria-label" | "size" | "type" | "variant"
> & {
  label: string;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={label}
            {...buttonProps}
          />
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
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
      <TakeButton label="Reanudar" onClick={togglePause}>
        <RecordDot />
      </TakeButton>
    );
  }

  return (
    <TakeButton
      label="Empezar a grabar"
      disabled={disabled || phase === "requesting"}
      // `startRecording` reports its own failure on screen and never rejects.
      onClick={() => void startRecording()}
    >
      {/* Stays a dot while the mic opens: pause appears once it is live. */}
      <RecordDot />
    </TakeButton>
  );
}

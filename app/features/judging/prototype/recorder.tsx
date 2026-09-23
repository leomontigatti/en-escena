// PROTOTYPE (#223) — throwaway, never merge. The `Devolución` recorder the
// judge scoring prototype shares between the dialog and the sheet.

import { AlertCircleIcon, Check, Pause } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldLegend, FieldSet } from "@/components/ui/field";

import { FeedbackPlayback } from "./playback";
import { emptyLevels, formatDuration, MediaRow, Waveform } from "./waveform";

const maxRecordingMs = 180_000;
const tickMs = 100;

type Phase = "idle" | "requesting" | "recording" | "paused";

/** What a live take needs torn down: the recorder, the mic and the analyser. */
type Session = {
  recorder: MediaRecorder;
  stream: MediaStream;
  audioContext: AudioContext;
  analyser: AnalyserNode;
  timer: number;
  /** Time recorded before the current stretch, which pauses split. */
  recordedMs: number;
  /** When the current stretch started; null while paused. */
  resumedAt: number | null;
};

function getRecordedMs(session: Session) {
  return (
    session.recordedMs +
    (session.resumedAt === null ? 0 : Date.now() - session.resumedAt)
  );
}

/** The mic's loudness right now, 0 to 1, from the analyser's waveform. */
function readLevel(analyser: AnalyserNode) {
  const samples = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(samples);

  let sumOfSquares = 0;
  for (const sample of samples) {
    const centered = (sample - 128) / 128;
    sumOfSquares += centered * centered;
  }

  // Speech sits low in RMS terms; scale it so a normal voice fills the bars.
  return Math.min(1, Math.sqrt(sumOfSquares / samples.length) * 4);
}

/**
 * One take on the device mic with `MediaRecorder` (webm/opus, Chrome only):
 * start, pause and resume, stop at will or at the cap. The finished audio goes
 * to `onRecorded`.
 */
function useFeedbackTake(onRecorded: (audioUrl: string) => void) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [levels, setLevels] = useState(emptyLevels);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<Session | null>(null);

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
    setPhase("requesting");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError(
        "No se pudo usar el micrófono. Revisá el permiso del navegador y volvé a intentar.",
      );
      setPhase("idle");
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
      onRecorded(URL.createObjectURL(blob));
      setPhase("idle");
    };

    const session: Session = {
      recorder,
      stream,
      audioContext,
      analyser,
      recordedMs: 0,
      resumedAt: Date.now(),
      timer: window.setInterval(() => {
        if (session.resumedAt === null) {
          return;
        }
        const recordedMs = getRecordedMs(session);
        setElapsedMs(Math.min(recordedMs, maxRecordingMs));
        setLevels((current) => [...current.slice(1), readLevel(analyser)]);
        if (recordedMs >= maxRecordingMs) {
          endSession(session);
        }
      }, tickMs),
    };

    recorder.start();
    sessionRef.current = session;
    setElapsedMs(0);
    setLevels(emptyLevels());
    setPhase("recording");
  }

  function togglePause() {
    const session = sessionRef.current;
    if (!session) {
      return;
    }

    if (session.resumedAt === null) {
      session.recorder.resume();
      session.resumedAt = Date.now();
      setPhase("recording");
      return;
    }

    session.recorder.pause();
    session.recordedMs = getRecordedMs(session);
    session.resumedAt = null;
    setPhase("paused");
  }

  function stopRecording() {
    if (sessionRef.current) {
      endSession(sessionRef.current);
    }
  }

  return {
    phase,
    elapsedMs,
    levels,
    error,
    startRecording,
    togglePause,
    stopRecording,
  };
}

/**
 * Records the `Devolución`: pause and resume with a live waveform, then
 * listen-back, re-record and delete.
 */
export function FeedbackRecorder({
  audioUrl,
  onAudioUrlChange,
  disabled = false,
}: {
  audioUrl: string | null;
  onAudioUrlChange: (audioUrl: string | null) => void;
  disabled?: boolean;
}) {
  const take = useFeedbackTake(onAudioUrlChange);
  const { phase } = take;

  return (
    <FieldSet>
      <FieldLegend variant="label">
        Devolución{" "}
        <span className="font-normal text-muted-foreground">(opcional)</span>
      </FieldLegend>

      {audioUrl && phase === "idle" ? (
        <FeedbackPlayback
          audioUrl={audioUrl}
          disabled={disabled}
          onDelete={() => onAudioUrlChange(null)}
        />
      ) : (
        <TakeBar take={take} disabled={disabled} />
      )}

      {take.error ? (
        <Alert variant="destructive">
          <AlertCircleIcon aria-hidden="true" />
          <AlertDescription>{take.error}</AlertDescription>
        </Alert>
      ) : null}
    </FieldSet>
  );
}

/**
 * The recorder in one row like the browser's own audio player. Before the
 * take starts, the red dot where pause will be is what starts it.
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
      <span className="text-sm whitespace-nowrap text-muted-foreground tabular-nums">
        {formatDuration(isLive ? take.elapsedMs : 0)} /{" "}
        {formatDuration(maxRecordingMs)}
      </span>
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

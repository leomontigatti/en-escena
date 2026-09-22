// PROTOTYPE (#223) — throwaway, never merge. The `Devolución` recorder every
// variant of the judge scoring prototype shares.

import { AlertCircleIcon, Mic, RotateCcw, Square, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldDescription, FieldLegend, FieldSet } from "@/components/ui/field";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";

const maxRecordingSeconds = 180;

function formatSeconds(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Records the `Devolución` from the device mic with `MediaRecorder`
 * (webm/opus, Chrome only), with listen-back, re-record and delete.
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
  const [phase, setPhase] = useState<"idle" | "requesting" | "recording">(
    "idle",
  );
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
      }
      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      }
    },
    [],
  );

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

    recorder.ondataavailable = (event) => {
      chunks.push(event.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      const blob = new Blob(chunks, { type: recorder.mimeType });
      onAudioUrlChange(URL.createObjectURL(blob));
      setPhase("idle");
    };

    recorder.start();
    recorderRef.current = recorder;
    setElapsedSeconds(0);
    setPhase("recording");

    const startedAt = Date.now();
    timerRef.current = window.setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAt) / 1000);
      setElapsedSeconds(Math.min(seconds, maxRecordingSeconds));
      if (seconds >= maxRecordingSeconds && recorder.state === "recording") {
        recorder.stop();
      }
    }, 250);
  }

  function stopRecording() {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
  }

  return (
    <FieldSet>
      <FieldLegend variant="label">Devolución</FieldLegend>
      <FieldDescription>
        Opcional. Hasta 3 minutos, con el micrófono del dispositivo.
      </FieldDescription>

      {phase === "recording" ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <Badge variant="destructive">Grabando</Badge>
            <span className="text-sm tabular-nums text-muted-foreground">
              {formatSeconds(elapsedSeconds)} de{" "}
              {formatSeconds(maxRecordingSeconds)}
            </span>
            <Button
              type="button"
              variant="outline"
              className="ml-auto"
              onClick={stopRecording}
            >
              <Square aria-hidden="true" data-icon="inline-start" />
              Detener
            </Button>
          </div>
          <Progress value={(elapsedSeconds / maxRecordingSeconds) * 100} />
        </div>
      ) : audioUrl ? (
        <div className="flex flex-col gap-3">
          {/* The browser's own player: listen-back needs nothing more. */}
          <audio controls src={audioUrl} className="w-full">
            <track kind="captions" />
          </audio>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              onClick={() => void startRecording()}
            >
              <RotateCcw aria-hidden="true" data-icon="inline-start" />
              Volver a grabar
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={disabled}
              onClick={() => onAudioUrlChange(null)}
            >
              <Trash2 aria-hidden="true" data-icon="inline-start" />
              Eliminar grabación
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button
            type="button"
            variant="outline"
            disabled={disabled || phase === "requesting"}
            onClick={() => void startRecording()}
          >
            {phase === "requesting" ? (
              <Spinner aria-hidden="true" data-icon />
            ) : (
              <Mic aria-hidden="true" data-icon="inline-start" />
            )}
            Grabar devolución
          </Button>
        </div>
      )}

      {error ? (
        <Alert variant="destructive">
          <AlertCircleIcon aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </FieldSet>
  );
}

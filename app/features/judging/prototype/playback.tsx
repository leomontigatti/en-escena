// PROTOTYPE (#223) — throwaway, never merge. Listen-back for the recorded
// `Devolución`, in the same row shape the recorder uses.

import { Pause, Play, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

import { emptyLevels, formatDuration, MediaRow, Waveform } from "./waveform";

/** The recording's peaks, one per bar, scaled so the loudest fills it. */
function summarizePeaks(buffer: AudioBuffer) {
  const samples = buffer.getChannelData(0);
  const peaks = emptyLevels();
  const bucketSize = Math.max(1, Math.floor(samples.length / peaks.length));
  for (let bar = 0; bar < peaks.length; bar += 1) {
    let peak = 0;
    for (let i = bar * bucketSize; i < (bar + 1) * bucketSize; i += 1) {
      peak = Math.max(peak, Math.abs(samples[i] ?? 0));
    }
    peaks[bar] = peak;
  }
  const loudest = Math.max(...peaks);

  return loudest > 0 ? peaks.map((peak) => peak / loudest) : peaks;
}

/**
 * Decodes the audio once for its waveform and duration. The duration comes
 * from the decoded buffer because a `MediaRecorder` webm has none in its
 * header, so `<audio>` can report it as `Infinity`.
 */
function useDecodedAudio(audioUrl: string) {
  const [decoded, setDecoded] = useState<{
    durationMs: number;
    levels: number[];
  } | null>(null);

  useEffect(() => {
    let isCurrent = true;
    const audioContext = new AudioContext();

    void fetch(audioUrl)
      .then((response) => response.arrayBuffer())
      .then((data) => audioContext.decodeAudioData(data))
      .then((buffer) => {
        if (isCurrent) {
          setDecoded({
            durationMs: buffer.duration * 1000,
            levels: summarizePeaks(buffer),
          });
        }
      })
      .catch(() => {
        // Undecodable audio still plays; it just shows a flat line.
      })
      .finally(() => void audioContext.close());

    return () => {
      isCurrent = false;
    };
  }, [audioUrl]);

  return decoded;
}

/** Tracks the element's position every frame while it plays, for a smooth bar. */
function usePlaybackPosition(
  audioRef: React.RefObject<HTMLAudioElement | null>,
) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);

  useEffect(() => {
    if (!isPlaying) {
      return;
    }
    let frame = requestAnimationFrame(function tick() {
      setPositionMs((audioRef.current?.currentTime ?? 0) * 1000);
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [audioRef, isPlaying]);

  return { isPlaying, setIsPlaying, positionMs, setPositionMs };
}

export function FeedbackPlayback({
  audioUrl,
  disabled,
  onDelete,
}: {
  audioUrl: string;
  disabled: boolean;
  onDelete: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const decoded = useDecodedAudio(audioUrl);
  const { isPlaying, setIsPlaying, positionMs, setPositionMs } =
    usePlaybackPosition(audioRef);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const durationMs = decoded?.durationMs ?? 0;

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }
    if (audio.paused) {
      void audio.play();
    } else {
      audio.pause();
    }
  }

  return (
    <MediaRow>
      <audio
        ref={audioRef}
        src={audioUrl}
        preload="auto"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          setPositionMs(0);
        }}
      >
        <track kind="captions" />
      </audio>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={isPlaying ? "Pausar" : "Escuchar"}
        onClick={togglePlay}
      >
        {isPlaying ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
      </Button>
      <span className="text-sm whitespace-nowrap text-muted-foreground tabular-nums">
        {formatDuration(positionMs)} / {formatDuration(durationMs)}
      </span>
      <Waveform
        levels={decoded?.levels ?? emptyLevels()}
        activeRatio={durationMs > 0 ? positionMs / durationMs : 0}
      />
      <Button
        type="button"
        variant="destructive"
        size="icon"
        aria-label="Eliminar grabación"
        disabled={disabled}
        onClick={() => setIsDeleteOpen(true)}
      >
        <Trash2 aria-hidden="true" />
      </Button>

      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar la grabación?</AlertDialogTitle>
            <AlertDialogDescription>
              La devolución que grabaste se pierde. Podés grabar otra después.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                audioRef.current?.pause();
                setIsDeleteOpen(false);
                onDelete();
              }}
            >
              <Trash2 aria-hidden="true" data-icon="inline-start" />
              Eliminar
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MediaRow>
  );
}

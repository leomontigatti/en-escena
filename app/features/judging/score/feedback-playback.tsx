import { Pause, Play, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

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
import {
  emptyLevels,
  formatDuration,
  summarizePeaks,
} from "@/lib/judging/feedback-waveform";

import { MediaRow, MediaTime, Waveform } from "./feedback-waveform";

export const deleteFeedbackAudioTitle = "¿Eliminar la grabación?";

export const playbackErrorMessage = "No se pudo reproducir la devolución.";

/**
 * Decodes the take once, for its waveform and its duration. The duration comes
 * from the decoded buffer because a `MediaRecorder` webm carries none in its
 * header, so the element reports it as `Infinity`.
 *
 * A browser without an `AudioContext` still plays the take; it only shows a
 * flat line and no duration, which is as far as this goes outside Chrome.
 */
function useDecodedAudio(audioUrl: string) {
  const [decoded, setDecoded] = useState<{
    durationMs: number;
    levels: number[];
  } | null>(null);

  useEffect(() => {
    if (typeof AudioContext === "undefined") {
      return;
    }

    let isCurrent = true;
    const audioContext = new AudioContext();

    void fetch(audioUrl)
      .then((response) => response.arrayBuffer())
      .then((data) => audioContext.decodeAudioData(data))
      .then((buffer) => {
        if (isCurrent) {
          setDecoded({
            durationMs: buffer.duration * 1000,
            levels: summarizePeaks(buffer.getChannelData(0)),
          });
        }
      })
      .catch(() => {
        // Undecodable audio still plays; it just shows a flat line.
      })
      // Closing the decoding context carries nothing back: it only rejects on a
      // context that is already closed, which is the state this asks for anyway.
      .finally(() => void audioContext.close());

    return () => {
      isCurrent = false;
    };
  }, [audioUrl]);

  return decoded;
}

/** Follows the element's position every frame while it plays, for a smooth bar. */
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

  return { isPlaying, positionMs, setIsPlaying, setPositionMs };
}

/**
 * Listening back to a `Devolución`, in the row the recorder uses. There is no
 * scrubber: the object is served without range requests, so a seek would ask
 * for something the server cannot give.
 */
export function FeedbackPlayback({
  audioUrl,
  disabled = false,
  onDelete,
}: {
  audioUrl: string;
  disabled?: boolean;
  /** Without it the row only plays: administration listens, never deletes. */
  onDelete?: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const decoded = useDecodedAudio(audioUrl);
  const { isPlaying, positionMs, setIsPlaying, setPositionMs } =
    usePlaybackPosition(audioRef);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const durationMs = decoded?.durationMs ?? 0;

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (audio.paused) {
      // `play()` rejects on an autoplay-policy block or a decode failure, and
      // the judge tapped `Escuchar` and would otherwise see nothing happen.
      audio.play().catch(() => toast.error(playbackErrorMessage));
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
      <MediaTime>
        {formatDuration(positionMs)} / {formatDuration(durationMs)}
      </MediaTime>
      <Waveform
        levels={decoded?.levels ?? emptyLevels()}
        activeRatio={durationMs > 0 ? positionMs / durationMs : 0}
      />
      {onDelete ? (
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
      ) : null}

      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent className="sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteFeedbackAudioTitle}</AlertDialogTitle>
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
                const audio = audioRef.current;
                if (audio && !audio.paused) {
                  audio.pause();
                }
                setIsDeleteOpen(false);
                onDelete?.();
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

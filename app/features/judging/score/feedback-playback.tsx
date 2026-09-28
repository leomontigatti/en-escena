import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { AudioPlayback } from "@/components/shared/audio-playback";
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
import { emptyLevels, summarizePeaks } from "@/lib/judging/feedback-waveform";

import { Waveform } from "./feedback-waveform";

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

/**
 * Listening back to a `Devolución`, in the row the recorder uses: the shared
 * player with the take's waveform for a bar, and a delete for the judge.
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
  const decoded = useDecodedAudio(audioUrl);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  return (
    <AudioPlayback
      audioUrl={audioUrl}
      durationMs={decoded?.durationMs}
      errorMessage={playbackErrorMessage}
      // The take is small, and loading it with the page means it still plays
      // after its short-lived link has expired.
      preload="auto"
      renderTrack={({ durationMs, positionMs }) => (
        <Waveform
          levels={decoded?.levels ?? emptyLevels()}
          activeRatio={durationMs > 0 ? positionMs / durationMs : 0}
        />
      )}
    >
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
                // Deleting unmounts the player, and a removed `<audio>` stops.
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
    </AudioPlayback>
  );
}

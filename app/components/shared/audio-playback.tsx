import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { formatDuration } from "@/lib/shared/format-duration";

/**
 * Where the player is, handed to a `renderTrack` that draws its own bar in
 * place of the seek slider.
 */
export type AudioPlaybackProgress = {
  durationMs: number;
  positionMs: number;
};

/** The element's length, or none while it has none to report (`Infinity`). */
function getElementDurationMs(audio: HTMLAudioElement | null) {
  const seconds = audio?.duration ?? Number.NaN;

  return Number.isFinite(seconds) ? seconds * 1000 : 0;
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
 * Listening to an audio file: play or pause, where it is out of how long, and
 * a slider to jump around it. Seeking asks the server for a byte range, which
 * the storage route answers (`serveFilesystemObject`).
 *
 * `durationMs` overrides the length the element reports, for audio that does
 * not carry one: a `MediaRecorder` webm reports `Infinity`, so the `Devolución`
 * passes the length it decoded. `children` sit at the end of the row.
 */
export function AudioPlayback({
  audioUrl,
  children,
  durationMs: knownDurationMs,
  errorMessage,
  preload = "metadata",
  renderTrack,
}: {
  audioUrl: string;
  children?: ReactNode;
  durationMs?: number;
  /** What the toast says when the browser refuses to play the file. */
  errorMessage: string;
  /** `metadata` by default: a song is too big to load with every page. */
  preload?: "auto" | "metadata";
  renderTrack?: (progress: AudioPlaybackProgress) => ReactNode;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const { isPlaying, positionMs, setIsPlaying, setPositionMs } =
    usePlaybackPosition(audioRef);
  const [elementDurationMs, setElementDurationMs] = useState(0);
  const durationMs = knownDurationMs ?? elementDurationMs;

  function readElementDuration() {
    setElementDurationMs(getElementDurationMs(audioRef.current));
  }

  // A server-rendered `<audio>` starts loading before React hydrates, so its
  // `loadedmetadata` may already have fired by the time anything listens.
  useEffect(() => {
    const audio = audioRef.current;

    if (audio && audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
      setElementDurationMs(getElementDurationMs(audio));
    }
  }, []);

  function seek(nextPositionMs: number) {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.currentTime = nextPositionMs / 1000;
    setPositionMs(nextPositionMs);
  }

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (audio.paused) {
      // `play()` rejects on an autoplay-policy block or a decode failure, and
      // the user tapped `Escuchar` and would otherwise see nothing happen.
      audio.play().catch(() => toast.error(errorMessage));
    } else {
      audio.pause();
    }
  }

  return (
    <MediaRow>
      <audio
        ref={audioRef}
        src={audioUrl}
        preload={preload}
        onLoadedMetadata={readElementDuration}
        onDurationChange={readElementDuration}
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
      {renderTrack ? (
        renderTrack({ durationMs, positionMs })
      ) : (
        <Slider
          aria-label="Posición"
          className="min-w-0 flex-1"
          disabled={durationMs === 0}
          max={durationMs}
          step={1000}
          value={[Math.min(positionMs, durationMs)]}
          onValueChange={([nextPositionMs]) => seek(nextPositionMs ?? 0)}
        />
      )}
      {children}
    </MediaRow>
  );
}

/** The pill a player sits in, like the browser's own audio player. */
export function MediaRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-full border py-1.5 pr-4 pl-2">
      {children}
    </div>
  );
}

/** The position or elapsed time, against what it is out of. */
export function MediaTime({ children }: { children: ReactNode }) {
  return (
    <span
      data-slot="audio-time"
      className="text-sm whitespace-nowrap text-muted-foreground tabular-nums"
    >
      {children}
    </span>
  );
}

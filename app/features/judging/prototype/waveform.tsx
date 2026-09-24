// PROTOTYPE (#223) — throwaway, never merge. The pieces the `Devolución`
// recorder and player share: the bar waveform and the time readout.

import type { ReactNode } from "react";

import { cn } from "@/lib/shared/utils";

const waveformBarCount = 48;

/** A flat line: what the waveform shows before there is any sound to draw. */
export function emptyLevels() {
  return Array.from({ length: waveformBarCount }, () => 0);
}

export function formatDuration(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Loudness as bars, 0 to 1 each. The bars left of `activeRatio` are lit: all
 * of them while recording, none while paused, the part already heard on
 * playback.
 */
export function Waveform({
  activeRatio,
  levels,
}: {
  activeRatio: number;
  levels: number[];
}) {
  return (
    <div
      aria-hidden="true"
      className="flex h-8 min-w-0 flex-1 items-center gap-0.5"
    >
      {levels.map((level, index) => (
        <span
          // The bars are positions, not items: they never reorder.
          key={index}
          className={cn(
            "min-w-0.5 flex-1 rounded-full",
            index < activeRatio * levels.length
              ? "bg-primary"
              : "bg-muted-foreground/50",
          )}
          style={{ height: `${Math.max(8, level * 100)}%` }}
        />
      ))}
    </div>
  );
}

/** The pill both rows sit in, like the browser's own audio player. */
export function MediaRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-full border py-1.5 pr-4 pl-2">
      {children}
    </div>
  );
}

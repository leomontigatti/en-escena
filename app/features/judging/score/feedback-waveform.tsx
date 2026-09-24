import type { ReactNode } from "react";

import { cn } from "@/lib/shared/utils";

/**
 * The two pieces the `Devolución` recorder and its playback share: the row
 * they both sit in, and the bars inside it. The arithmetic behind the bars is
 * in app/lib/judging/feedback-waveform.ts.
 */

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

/** The position or elapsed time, against what it is out of. */
export function MediaTime({ children }: { children: ReactNode }) {
  return (
    <span className="text-sm whitespace-nowrap text-muted-foreground tabular-nums">
      {children}
    </span>
  );
}

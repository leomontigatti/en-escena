import { cn } from "@/lib/shared/utils";

/**
 * The bars the `Devolución` recorder and its playback both draw. The arithmetic
 * behind them is in app/lib/judging/feedback-waveform.ts; the row they sit in
 * is the shared player's (app/components/shared/audio-playback.tsx).
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

/**
 * A position or a length of audio as a player shows it: minutes and seconds,
 * `3:00` for three minutes. Minutes do not roll over into hours; nothing played
 * here runs that long.
 */
export function formatDuration(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

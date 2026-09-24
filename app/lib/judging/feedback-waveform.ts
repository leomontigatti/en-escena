/**
 * What the `Devolución` recorder and its playback both draw: loudness as a row
 * of bars, and the time readout under them. Kept apart from the components so
 * the arithmetic — which needs neither an `AnalyserNode` nor an `AudioBuffer`,
 * only the numbers they hand over — can be read and tested without a browser.
 */

/** How many bars the row holds. The waveform is a shape, not a measurement. */
export const waveformBarCount = 48;

/** A flat line: what the waveform shows before there is any sound to draw. */
export function emptyLevels() {
  return Array.from({ length: waveformBarCount }, () => 0);
}

/**
 * The mic's loudness right now, 0 to 1, from the analyser's waveform samples.
 * Speech sits low in RMS terms, so it is scaled until a normal voice fills the
 * bars: this is feedback that the mic is hearing something, not a meter.
 */
export function micLevel(samples: Uint8Array) {
  let sumOfSquares = 0;
  for (const sample of samples) {
    const centered = (sample - 128) / 128;
    sumOfSquares += centered * centered;
  }

  return Math.min(1, Math.sqrt(sumOfSquares / samples.length) * 4);
}

/**
 * The recording's peaks, one per bar, scaled so the loudest bar fills the row.
 * A silent recording has no loudest bar, so it stays flat.
 */
export function summarizePeaks(samples: Float32Array) {
  const peaks = emptyLevels();
  const bucketSize = Math.max(1, Math.floor(samples.length / peaks.length));
  for (let bar = 0; bar < peaks.length; bar += 1) {
    let peak = 0;
    for (
      let index = bar * bucketSize;
      index < (bar + 1) * bucketSize;
      index += 1
    ) {
      peak = Math.max(peak, Math.abs(samples[index] ?? 0));
    }
    peaks[bar] = peak;
  }
  const loudest = Math.max(...peaks);

  return loudest > 0 ? peaks.map((peak) => peak / loudest) : peaks;
}

/** A position or a duration as the judge reads it, `3:00` at the cap. */
export function formatDuration(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

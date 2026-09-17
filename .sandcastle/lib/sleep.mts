// Synchronous sleep for the AFK runners' prefetch paths.
//
// The context prefetch and the CI wait are both straight-line synchronous code
// (`execFileSync` throughout), so neither can await a timer. `Atomics.wait` on a
// throwaway `SharedArrayBuffer` parks the thread for real instead of spinning,
// which a `while (Date.now() < end)` busy-loop would do.

/** Block the current thread for `ms` without a busy-loop. */
export function sleepSync(ms: number): void {
  if (ms <= 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Unwraps a seed step's result, or stops the seed naming the step. */
export function expectOk<Result extends { ok: boolean }>(
  result: Result,
  step: string,
): Extract<Result, { ok: true }> {
  if (!result.ok) {
    throw new Error(`Dev seed could not ${step}: ${JSON.stringify(result)}`);
  }

  return result as Extract<Result, { ok: true }>;
}

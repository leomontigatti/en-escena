/**
 * The stub every lock test writes its "this one was evaluated" through. The
 * seam now has a body (evaluation-lock.server.ts), so this is a convenience
 * rather than a necessity: reaching a real evaluation means a numbered
 * presentation, an assigned judge and a saved score, which is a lot of setup
 * for a test whose subject is the lock and not the scoring. A test that needs a
 * locked choreography replaces the module with this one and adds the id:
 *
 * ```ts
 * vi.mock("@/lib/presentations/evaluation-lock.server", async () =>
 *   (await import("@/lib/presentations/evaluation-lock.test-support"))
 *     .evaluationLockStub,
 * );
 * ```
 *
 * The set is module state, so a suite that mutates it clears it between tests.
 */
export const evaluatedChoreographyIds = new Set<string>();

export const evaluationLockStub = {
  findEvaluatedChoreographyIds: async (choreographyIds: string[]) =>
    new Set(choreographyIds.filter((id) => evaluatedChoreographyIds.has(id))),
  hasEvaluatedPresentation: async (choreographyId: string) =>
    evaluatedChoreographyIds.has(choreographyId),
};

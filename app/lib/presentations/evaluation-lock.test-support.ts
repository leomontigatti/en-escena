/**
 * The stub every lock test writes its "this one was evaluated" through. The
 * seam answers `false` for everything until the judging effort gives it a body
 * (evaluation-lock.server.ts), so a test that needs a locked choreography
 * replaces the module with this one and adds the id:
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

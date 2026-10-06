import { eq } from "drizzle-orm";

import { db } from "@/db";
import { choreographies, presentations } from "@/db/schema";
import {
  assertPortalChoreographyFound,
  portalOwnedChoreographyWhere,
} from "@/lib/choreographies/choreography-access.server";
import { hasEvaluatedPresentation } from "@/lib/presentations/evaluation-lock.server";

export type UpdateChoreographyProfessionalEvaluationResult =
  { ok: true } | { ok: false; message: string };

/**
 * `Evaluar como profesional`, as the academy sets it after registration. It
 * closes with the music: a withdrawn choreography is not taking part, and an
 * evaluated one was judged under the answer it had. An unchanged answer is no
 * change, so a locked choreography still saves its music.
 *
 * The guard and the write share one transaction. The choreography row is
 * locked against administration's form, which writes the same column under the
 * same lock, and the choreography's presentations against a judge's save,
 * which locks the presentation it scores: a score that lands first is seen
 * here, and one that lands after was given under the new answer.
 */
export async function updateChoreographyProfessionalEvaluation(input: {
  academyId: string;
  choreographyId: string;
  eventId: string;
  professionalEvaluation: boolean;
}): Promise<UpdateChoreographyProfessionalEvaluationResult> {
  return await db.transaction(async (tx) => {
    const [choreography] = await tx
      .select({
        professionalEvaluation: choreographies.professionalEvaluation,
        withdrawnAt: choreographies.withdrawnAt,
      })
      .from(choreographies)
      .where(portalOwnedChoreographyWhere(input))
      .for("update");

    const found = assertPortalChoreographyFound(choreography);

    if (found.professionalEvaluation === input.professionalEvaluation) {
      return { ok: true };
    }

    if (found.withdrawnAt) {
      return {
        ok: false,
        message:
          "No podés cambiar cómo se evalúa porque la coreografía está retirada.",
      };
    }

    await tx
      .select({ id: presentations.id })
      .from(presentations)
      .where(eq(presentations.choreographyId, input.choreographyId))
      .for("update");

    if (await hasEvaluatedPresentation(input.choreographyId, tx)) {
      return {
        ok: false,
        message:
          "No podés cambiar cómo se evalúa porque la coreografía ya fue evaluada.",
      };
    }

    await tx
      .update(choreographies)
      .set({
        professionalEvaluation: input.professionalEvaluation,
        updatedAt: new Date(),
      })
      .where(eq(choreographies.id, input.choreographyId));

    return { ok: true };
  });
}

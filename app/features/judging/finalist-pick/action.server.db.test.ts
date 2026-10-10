import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { user } from "@/db/schema";
import {
  createAccessRequestCookie,
  createAccessUser,
} from "@/lib/auth/access-auth.test-support";
import { readJudgeFinalistPicks } from "@/lib/grand-final/finalist-pick.server";
import { seedEligibilityFixture } from "@/lib/grand-final/grand-final.test-support";
import { judgingDate } from "@/lib/judging/judging-day";
import { expectThrownResponse } from "@/lib/test-support/http";
import { action } from "@/routes/juzgamiento";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";

installDatabaseTestHooks();

async function signIn(role: "auditor" | "judge") {
  const signUp = await createAccessUser({
    email: `${crypto.randomUUID()}@example.com`,
    name: "Juana Juez",
    password: "password-segura",
  });

  await db
    .update(user)
    .set({ emailVerified: true, internalUsername: "persona", role })
    .where(eq(user.id, signUp.response.user.id));

  return {
    cookie: createAccessRequestCookie(signUp.headers),
    userId: signUp.response.user.id,
  };
}

function pickRequest(
  cookie: string,
  fields: Record<string, string>,
): Parameters<typeof action>[0] {
  const body = new FormData();

  body.set("intent", "save-finalist-pick");

  for (const [name, value] of Object.entries(fields)) {
    body.set(name, value);
  }

  return {
    request: new Request("http://localhost/juzgamiento", {
      body,
      headers: { cookie },
      method: "POST",
    }),
    params: {},
    context: {},
  } as Parameters<typeof action>[0];
}

/**
 * Jazz dances today, with one academy eligible in it and one that is not. The
 * judge given is put on one of its presentations, which makes them one of the
 * event's judges; with none, nobody is.
 */
async function seedJazzToday(judgeId?: string) {
  const fixture = await seedEligibilityFixture();
  const jazz = await fixture.addModality("Jazz");
  const eligible = await fixture.addAcademy("Academia Pirueta");
  const ineligible = await fixture.addAcademy("Academia Vecina");

  const choreographyId = await fixture.register({
    academy: eligible,
    modality: jazz,
    category: "Infantil",
  });
  await fixture.register({
    academy: eligible,
    modality: jazz,
    category: "Mayores",
  });
  await fixture.register({
    academy: ineligible,
    modality: jazz,
    category: "Infantil",
  });
  await fixture.danceOn(jazz, judgingDate());

  if (judgeId) {
    await fixture.assignJudge(judgeId, choreographyId);
  }

  return { eligible, ineligible, jazz };
}

describe("the `/juzgamiento` action, saving a finalist pick", () => {
  test("saves the signed-in judge's pick and stays", async () => {
    const judge = await signIn("judge");
    const { eligible, jazz } = await seedJazzToday(judge.userId);

    await expect(
      action(
        pickRequest(judge.cookie, { academyId: eligible, modalityId: jazz }),
      ),
    ).resolves.toEqual({
      intent: "save-finalist-pick",
      message: "Guardaste la elección de finalista.",
      status: "success",
    });
    await expect(
      readJudgeFinalistPicks({
        judgeId: judge.userId,
        scheduledDate: judgingDate(),
      }),
    ).resolves.toMatchObject([{ academyId: eligible }]);
  });

  test("answers a refusal with what to fix", async () => {
    const judge = await signIn("judge");
    const { ineligible, jazz } = await seedJazzToday(judge.userId);

    await expect(
      action(
        pickRequest(judge.cookie, { academyId: ineligible, modalityId: jazz }),
      ),
    ).resolves.toEqual({
      intent: "save-finalist-pick",
      message:
        "Esa academia no cumple los requisitos de la Gran final en esta modalidad. Elegí otra.",
      status: "error",
    });
  });

  test("answers 404 for a modality outside the active event", async () => {
    const judge = await signIn("judge");
    const { eligible } = await seedJazzToday();

    await expectThrownResponse(
      action(
        pickRequest(judge.cookie, {
          academyId: eligible,
          modalityId: crypto.randomUUID(),
        }),
      ),
      404,
    );
  });

  test("answers 404 to a judge with no presentation in the event", async () => {
    const judge = await signIn("judge");
    const { eligible, jazz } = await seedJazzToday();

    await expectThrownResponse(
      action(
        pickRequest(judge.cookie, { academyId: eligible, modalityId: jazz }),
      ),
      404,
    );
  });

  test("refuses a user who is not a judge", async () => {
    const auditor = await signIn("auditor");
    const { eligible, jazz } = await seedJazzToday();

    await expectThrownResponse(
      action(
        pickRequest(auditor.cookie, { academyId: eligible, modalityId: jazz }),
      ),
      403,
    );
  });
});

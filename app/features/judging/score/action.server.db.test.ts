import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { presentations, schedules, scores, user } from "@/db/schema";
import {
  createAccessRequestCookie,
  createAccessUser,
} from "@/lib/auth/access-auth.test-support";
import { seedJudgingFixture } from "@/lib/judging/judging.test-support";
import { judgingDate } from "@/lib/judging/judging-day";
import { scoreValueMessage } from "@/lib/judging/score-value";
import { expectThrownResponse } from "@/lib/test-support/http";
import { action } from "@/routes/juzgamiento";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";

installDatabaseTestHooks();

async function signIn(role: "auditor" | "judge", name: string) {
  const email = `${crypto.randomUUID()}@example.com`;
  const signUp = await createAccessUser({
    email,
    name,
    password: "password-segura",
  });

  await db
    .update(user)
    .set({ emailVerified: true, internalUsername: "persona", name, role })
    .where(eq(user.id, signUp.response.user.id));

  return {
    cookie: createAccessRequestCookie(signUp.headers),
    userId: signUp.response.user.id,
  };
}

function scoreRequest(
  cookie: string,
  fields: Record<string, string>,
  audio?: Blob,
): Parameters<typeof action>[0] {
  const body = new FormData();

  for (const [name, value] of Object.entries(fields)) {
    body.set(name, value);
  }

  if (audio) {
    body.set("audio", audio, "devolucion.webm");
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

async function seedOpenPresentation() {
  const fixture = await seedJudgingFixture();
  const presentation = await fixture.addPresentation({
    name: "Primera",
    orderNumber: 1,
  });

  await db
    .update(schedules)
    .set({ scheduledDate: judgingDate() })
    .where(eq(schedules.id, fixture.catalog.schedule.id));

  return { fixture, presentation };
}

async function readDisqualifiedAt(presentationId: string) {
  const [row] = await db
    .select({ disqualifiedAt: presentations.disqualifiedAt })
    .from(presentations)
    .where(eq(presentations.id, presentationId));

  return row.disqualifiedAt;
}

describe("the `/juzgamiento` action", () => {
  test("saves the signed-in judge's score", async () => {
    const judge = await signIn("judge", "Juana Juez");
    const { fixture, presentation } = await seedOpenPresentation();
    const assignment = await fixture.assignJudge(
      presentation.presentationId,
      judge.userId,
    );

    const result = await action(
      scoreRequest(judge.cookie, {
        intent: "save-score",
        presentationId: presentation.presentationId,
        value: "90.5",
      }),
    );

    expect(result).toMatchObject({ status: "success" });
    expect(
      await db
        .select({ value: scores.value })
        .from(scores)
        .where(eq(scores.judgeAssignmentId, assignment.judgeAssignmentId)),
    ).toEqual([{ value: "90.5" }]);
  });

  test("refuses a judge who is not assigned to the presentation", async () => {
    const judge = await signIn("judge", "Juana Juez");
    const { presentation } = await seedOpenPresentation();

    await expectThrownResponse(
      action(
        scoreRequest(judge.cookie, {
          intent: "save-score",
          presentationId: presentation.presentationId,
          value: "90.5",
        }),
      ),
      403,
    );
  });

  test("refuses a user who is not a judge", async () => {
    const auditor = await signIn("auditor", "Ariel Auditor");
    const { presentation } = await seedOpenPresentation();

    await expectThrownResponse(
      action(
        scoreRequest(auditor.cookie, {
          intent: "save-score",
          presentationId: presentation.presentationId,
          value: "90.5",
        }),
      ),
      403,
    );
  });

  test("answers with an error once the judging day has closed", async () => {
    const judge = await signIn("judge", "Juana Juez");
    const { fixture, presentation } = await seedOpenPresentation();

    await fixture.assignJudge(presentation.presentationId, judge.userId);
    await db
      .update(schedules)
      .set({ scheduledDate: "2020-01-01" })
      .where(eq(schedules.id, fixture.catalog.schedule.id));

    const result = await action(
      scoreRequest(judge.cookie, {
        intent: "save-score",
        presentationId: presentation.presentationId,
        value: "90.5",
      }),
    );

    expect(result).toMatchObject({ status: "error" });
  });

  test("answers with the field error for a value that is not a half step", async () => {
    const judge = await signIn("judge", "Juana Juez");
    const { fixture, presentation } = await seedOpenPresentation();

    await fixture.assignJudge(presentation.presentationId, judge.userId);

    const result = await action(
      scoreRequest(judge.cookie, {
        intent: "save-score",
        presentationId: presentation.presentationId,
        value: "90.2",
      }),
    );

    expect(result).toMatchObject({
      fieldErrors: { value: scoreValueMessage() },
      status: "error",
      values: { presentationId: presentation.presentationId, value: "90.2" },
    });
  });

  // The take rides along with the score as multipart, so a file the policy
  // refuses has to come back as the judge's own copy rather than a crash.
  test("answers with the feedback audio copy for a take the policy refuses", async () => {
    const judge = await signIn("judge", "Juana Juez");
    const { fixture, presentation } = await seedOpenPresentation();
    const assignment = await fixture.assignJudge(
      presentation.presentationId,
      judge.userId,
    );

    const result = await action(
      scoreRequest(
        judge.cookie,
        {
          audioIntent: "replace",
          intent: "save-score",
          presentationId: presentation.presentationId,
          value: "90.5",
        },
        new Blob(["audio"], { type: "audio/mpeg" }),
      ),
    );

    expect(result).toMatchObject({
      fieldErrors: { audio: "El audio de la devolución debe ser WEBM." },
      status: "error",
    });
    expect(
      await db
        .select()
        .from(scores)
        .where(eq(scores.judgeAssignmentId, assignment.judgeAssignmentId)),
    ).toEqual([]);
  });
});

describe("the `/juzgamiento` action's disqualification intents", () => {
  test("disqualifies the presentation for the whole panel", async () => {
    const judge = await signIn("judge", "Juana Juez");
    const { fixture, presentation } = await seedOpenPresentation();

    await fixture.assignJudge(presentation.presentationId, judge.userId);

    const result = await action(
      scoreRequest(judge.cookie, {
        intent: "disqualify",
        presentationId: presentation.presentationId,
      }),
    );

    expect(result).toMatchObject({ status: "success" });
    expect(
      await readDisqualifiedAt(presentation.presentationId),
    ).not.toBeNull();
  });

  test("reinstates the presentation with no confirmation to ask for", async () => {
    const judge = await signIn("judge", "Juana Juez");
    const { fixture, presentation } = await seedOpenPresentation();

    await fixture.assignJudge(presentation.presentationId, judge.userId);
    await db
      .update(presentations)
      .set({ disqualifiedAt: new Date() })
      .where(eq(presentations.id, presentation.presentationId));

    const result = await action(
      scoreRequest(judge.cookie, {
        intent: "reinstate",
        presentationId: presentation.presentationId,
      }),
    );

    expect(result).toMatchObject({ status: "success" });
    expect(await readDisqualifiedAt(presentation.presentationId)).toBeNull();
  });

  test.each(["disqualify", "reinstate"])(
    "refuses a judge who is not assigned to the presentation with `%s`",
    async (intent) => {
      const judge = await signIn("judge", "Juana Juez");
      const { presentation } = await seedOpenPresentation();

      await expectThrownResponse(
        action(
          scoreRequest(judge.cookie, {
            intent,
            presentationId: presentation.presentationId,
          }),
        ),
        403,
      );
    },
  );

  test.each(["disqualify", "reinstate"])(
    "answers with an error once the judging day has closed for `%s`",
    async (intent) => {
      const judge = await signIn("judge", "Juana Juez");
      const { fixture, presentation } = await seedOpenPresentation();

      await fixture.assignJudge(presentation.presentationId, judge.userId);
      await db
        .update(schedules)
        .set({ scheduledDate: "2020-01-01" })
        .where(eq(schedules.id, fixture.catalog.schedule.id));

      const result = await action(
        scoreRequest(judge.cookie, {
          intent,
          presentationId: presentation.presentationId,
        }),
      );

      expect(result).toMatchObject({ status: "error" });
    },
  );
});

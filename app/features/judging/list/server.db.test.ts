import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { schedules, user } from "@/db/schema";
import {
  createAccessRequestCookie,
  createAccessUser,
} from "@/lib/auth/access-auth.test-support";
import { seedJudgingFixture } from "@/lib/judging/judging.test-support";
import { judgingDate } from "@/lib/judging/judging-day";
import { expectThrownResponse } from "@/lib/test-support/http";
import { loader } from "@/routes/juzgamiento";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";

import { loadJudgePanelRouteData } from "./server";

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
    request: new Request("http://localhost/juzgamiento", {
      headers: { cookie: createAccessRequestCookie(signUp.headers) },
    }),
    userId: signUp.response.user.id,
  };
}

describe("the `/juzgamiento` route", () => {
  test("refuses a user who is not a judge", async () => {
    const auditor = await signIn("auditor", "Ariel Auditor");

    await expectThrownResponse(
      loader({
        request: auditor.request,
        params: {},
        context: {},
        url: new URL("http://localhost/juzgamiento"),
        pattern: "/juzgamiento",
      }),
      403,
    );
  });

  test("hands the signed-in judge today's presentations", async () => {
    const judge = await signIn("judge", "Juana Juez");
    const fixture = await seedJudgingFixture();
    const presentation = await fixture.addPresentation({
      name: "Primera",
      orderNumber: 1,
    });

    await fixture.assignJudge(presentation.presentationId, judge.userId);
    await db
      .update(schedules)
      .set({ scheduledDate: judgingDate() })
      .where(eq(schedules.id, fixture.catalog.schedule.id));

    const data = await loadJudgePanelRouteData(judge.request);

    expect(data.account.name).toBe("Juana Juez");
    expect(data.presentations).toMatchObject([
      { name: "Primera", orderNumber: 1, status: "pendiente" },
    ]);
  });
});

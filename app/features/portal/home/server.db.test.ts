import { describe, expect, test } from "vitest";

import { createAcademyUser } from "@/lib/admin/finances/finances.test-support";
import {
  closeCurrentVotingRound,
  seedFinalistsFixture,
} from "@/lib/grand-final/voting.test-support";
import { openVotingRound } from "@/lib/grand-final/voting-round.server";

import { loadPortalHome } from "./server";

import { installDatabaseTestHooks } from "../../../../tests/db/harness";

installDatabaseTestHooks();

/** An academy with a session, signed in on the portal home. */
async function signInAcademy(name: string) {
  const { academy, cookie } = await createAcademyUser({
    academyName: name,
    email: `${crypto.randomUUID()}@example.com`,
  });

  return {
    academyId: academy.id,
    loadHome: () =>
      loadPortalHome(
        new Request("http://localhost/portal", { headers: { cookie } }),
      ),
  };
}

const voteUrl = expect.stringMatching(/^https?:\/\/[^/]+\/votar$/);

describe("the portal home's vote URL", () => {
  test("is given to a finalist of the open round, and only while it is open", async () => {
    const fixture = await seedFinalistsFixture();
    const finalist = await signInAcademy("Alas");
    await fixture.pick(finalist.academyId);
    await fixture.setBanners(finalist.academyId, 2);

    await expect(finalist.loadHome()).resolves.toMatchObject({
      grandFinal: { voteUrl: null },
    });

    await openVotingRound({ eventId: fixture.eventId });

    await expect(finalist.loadHome()).resolves.toMatchObject({
      grandFinal: { voteUrl },
    });

    await closeCurrentVotingRound(fixture.eventId);

    await expect(finalist.loadHome()).resolves.toMatchObject({
      grandFinal: { voteUrl: null },
    });
  });

  test("is not given to an academy the open round did not copy, picked or not", async () => {
    const fixture = await seedFinalistsFixture();
    await fixture.addFinalist("Ritmo Sur");
    const outsider = await signInAcademy("Sin elegir");
    await openVotingRound({ eventId: fixture.eventId });
    const late = await signInAcademy("Elegida tarde");
    await fixture.pick(late.academyId);

    for (const academy of [outsider, late]) {
      await expect(academy.loadHome()).resolves.toMatchObject({
        grandFinal: { voteUrl: null },
      });
    }
  });
});

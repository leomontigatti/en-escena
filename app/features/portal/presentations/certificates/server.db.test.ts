import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { presentations } from "@/db/schema";
import {
  createDancer,
  createSelectedPriceInscriptionForTest,
} from "@/features/portal/choreographies/test-support/db";
import { activateEvent } from "@/lib/events/management.server";
import { seedJudgingFixture } from "@/lib/judging/judging.test-support";
import { publishResults } from "@/lib/judging/results.server";
import { countPdfPages } from "@/lib/certificates/certificates.test-support";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";
import { loadPortalCertificates } from "./server";

installDatabaseTestHooks();

type JudgingFixture = Awaited<ReturnType<typeof seedJudgingFixture>>;

/** A published silver with its seeded Ana Paz and a second dancer, Zoe. */
async function seedPublishedChoreography() {
  const fixture = await seedJudgingFixture();
  await activateEvent(fixture.event.id);
  const presentation = await fixture.addPresentation({
    name: "Río Arriba",
    orderNumber: 1,
  });
  const zoe = await createDancer(fixture.academy.academy.id, {
    firstName: "Zoe",
    lastName: "Albornoz",
  });
  await createSelectedPriceInscriptionForTest({
    academyId: fixture.academy.academy.id,
    choreographyId: presentation.choreographyId,
    dancerId: zoe.id,
  });
  await fixture.scorePresentation(presentation.presentationId, "85.0");
  await publishResults(fixture.event.id);

  return { fixture, presentation, zoe };
}

async function loadCertificates(
  fixture: JudgingFixture,
  choreographyId: string,
  query = "",
) {
  return await loadPortalCertificates({
    params: { choreographyId },
    request: new Request(
      `http://localhost/portal/presentaciones/${choreographyId}/certificados${query}`,
      { headers: { cookie: fixture.academy.cookie } },
    ),
  });
}

describe("an academy's certificates", () => {
  test("opens every dancer's certificate in one PDF, a page each", async () => {
    const { fixture, presentation } = await seedPublishedChoreography();

    const response = await loadCertificates(
      fixture,
      presentation.choreographyId,
    );

    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Content-Disposition")).toBe(
      'inline; filename="certificados-rio-arriba.pdf"',
    );
    expect(countPdfPages(new Uint8Array(await response.arrayBuffer()))).toBe(2);
  });

  test("opens one dancer's certificate alone", async () => {
    const { fixture, presentation, zoe } = await seedPublishedChoreography();

    const response = await loadCertificates(
      fixture,
      presentation.choreographyId,
      `?bailarin=${zoe.id}`,
    );

    expect(response.headers.get("Content-Disposition")).toBe(
      'inline; filename="certificado-zoe-albornoz-rio-arriba.pdf"',
    );
    expect(countPdfPages(new Uint8Array(await response.arrayBuffer()))).toBe(1);
  });

  test("answers not found for a dancer the choreography does not issue one to", async () => {
    const { fixture, presentation } = await seedPublishedChoreography();
    const outsider = await createDancer(fixture.academy.academy.id, {
      firstName: "Luis",
      lastName: "Ferro",
    });

    await expect(
      loadCertificates(
        fixture,
        presentation.choreographyId,
        `?bailarin=${outsider.id}`,
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  test("answers not found for another academy's choreography", async () => {
    const { presentation } = await seedPublishedChoreography();
    const stranger = await seedJudgingFixture({ active: false });

    await expect(
      loadCertificates(stranger, presentation.choreographyId),
    ).rejects.toMatchObject({ status: 404 });
  });

  test("answers not found for a disqualified presentation", async () => {
    const { fixture, presentation } = await seedPublishedChoreography();
    await db
      .update(presentations)
      .set({ disqualifiedAt: new Date() })
      .where(eq(presentations.id, presentation.presentationId));

    await expect(
      loadCertificates(fixture, presentation.choreographyId),
    ).rejects.toMatchObject({ status: 404 });
  });
});

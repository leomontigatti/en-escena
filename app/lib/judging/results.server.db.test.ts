import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { events, presentations, scores } from "@/db/schema";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

import { seedJudgingFixture } from "./judging.test-support";
import {
  hideResults,
  isPresentationResultPublished,
  publishResults,
  readResultsPublication,
} from "./results.server";

installDatabaseTestHooks();

type JudgingFixture = Awaited<ReturnType<typeof seedJudgingFixture>>;

async function addScoredPresentation(
  fixture: JudgingFixture,
  input: { annulled?: boolean; name: string; orderNumber: number },
) {
  const presentation = await fixture.addPresentation({
    name: input.name,
    orderNumber: input.orderNumber,
    submodalityId: null,
  });
  const judge = await fixture.assignJudge(presentation.presentationId);

  await db.insert(scores).values({
    annulled: input.annulled ?? false,
    judgeAssignmentId: judge.judgeAssignmentId,
    value: "70.0",
  });

  return presentation;
}

async function readPublishedStamp(presentationId: string) {
  const [row] = await db
    .select({ resultPublishedAt: presentations.resultPublishedAt })
    .from(presentations)
    .where(eq(presentations.id, presentationId));

  return row.resultPublishedAt;
}

describe("publishing an event's results", () => {
  test("stamps the evaluated presentations and leaves the rest alone", async () => {
    const fixture = await seedJudgingFixture();
    const scored = await addScoredPresentation(fixture, {
      name: "Con puntaje",
      orderNumber: 1,
    });
    const annulled = await addScoredPresentation(fixture, {
      annulled: true,
      name: "Anulada",
      orderNumber: 2,
    });
    const disqualified = await fixture.addPresentation({
      name: "Descalificada",
      orderNumber: 3,
    });
    await db
      .update(presentations)
      .set({ disqualifiedAt: new Date() })
      .where(eq(presentations.id, disqualified.presentationId));
    const pending = await fixture.addPresentation({
      name: "Sin evaluar",
      orderNumber: 4,
    });

    const publishedCount = await publishResults(fixture.event.id);

    expect(publishedCount).toBe(3);
    expect(await readPublishedStamp(scored.presentationId)).toBeInstanceOf(
      Date,
    );
    expect(await readPublishedStamp(annulled.presentationId)).toBeInstanceOf(
      Date,
    );
    expect(
      await readPublishedStamp(disqualified.presentationId),
    ).toBeInstanceOf(Date);
    expect(await readPublishedStamp(pending.presentationId)).toBeNull();
  });

  test("succeeds on an event with nothing evaluated and reads as zero", async () => {
    const fixture = await seedJudgingFixture();
    await fixture.addPresentation({ name: "Sin evaluar", orderNumber: 1 });

    expect(await publishResults(fixture.event.id)).toBe(0);
    expect(await readResultsPublication(fixture.event.id)).toMatchObject({
      pendingCount: 0,
      publishedCount: 0,
    });
  });

  test("stamps the event itself, so a later update keeps the first stamps", async () => {
    const fixture = await seedJudgingFixture();
    const first = await addScoredPresentation(fixture, {
      name: "Primera",
      orderNumber: 1,
    });

    expect(await publishResults(fixture.event.id)).toBe(1);

    const firstStamp = await readPublishedStamp(first.presentationId);
    const [event] = await db
      .select({ resultsPublishedAt: events.resultsPublishedAt })
      .from(events)
      .where(eq(events.id, fixture.event.id));

    expect(event.resultsPublishedAt).toBeInstanceOf(Date);

    const second = await addScoredPresentation(fixture, {
      name: "Segunda",
      orderNumber: 2,
    });

    expect(await publishResults(fixture.event.id)).toBe(2);
    expect(await readPublishedStamp(first.presentationId)).toEqual(firstStamp);
    expect(await readPublishedStamp(second.presentationId)).toBeInstanceOf(
      Date,
    );
  });
});

describe("hiding an event's results", () => {
  test("clears the event's stamp and every presentation's", async () => {
    const fixture = await seedJudgingFixture();
    const scored = await addScoredPresentation(fixture, {
      name: "Primera",
      orderNumber: 1,
    });
    await publishResults(fixture.event.id);

    await hideResults(fixture.event.id);

    const [event] = await db
      .select({ resultsPublishedAt: events.resultsPublishedAt })
      .from(events)
      .where(eq(events.id, fixture.event.id));

    expect(event.resultsPublishedAt).toBeNull();
    expect(await readPublishedStamp(scored.presentationId)).toBeNull();
  });

  test("publishing again takes what is evaluated at that moment", async () => {
    const fixture = await seedJudgingFixture();
    await addScoredPresentation(fixture, { name: "Primera", orderNumber: 1 });
    await publishResults(fixture.event.id);
    await hideResults(fixture.event.id);
    const later = await addScoredPresentation(fixture, {
      name: "Segunda",
      orderNumber: 2,
    });

    expect(await publishResults(fixture.event.id)).toBe(2);
    expect(await readPublishedStamp(later.presentationId)).toBeInstanceOf(Date);
  });
});

describe("reading an event's publication", () => {
  test("reads zero on an event nobody published", async () => {
    const fixture = await seedJudgingFixture();
    await addScoredPresentation(fixture, { name: "Primera", orderNumber: 1 });

    expect(await readResultsPublication(fixture.event.id)).toEqual({
      pendingCount: 1,
      publishedAt: null,
      publishedCount: 0,
    });
  });

  test("counts what is published and what is evaluated since", async () => {
    const fixture = await seedJudgingFixture();
    await addScoredPresentation(fixture, { name: "Primera", orderNumber: 1 });
    await publishResults(fixture.event.id);
    await addScoredPresentation(fixture, { name: "Segunda", orderNumber: 2 });
    await fixture.addPresentation({ name: "Sin evaluar", orderNumber: 3 });

    expect(await readResultsPublication(fixture.event.id)).toMatchObject({
      pendingCount: 1,
      publishedCount: 1,
    });
    expect(
      (await readResultsPublication(fixture.event.id)).publishedAt,
    ).toBeInstanceOf(Date);
  });
});

describe("whether one presentation's result is published", () => {
  test("is true only inside a published event's snapshot", async () => {
    const fixture = await seedJudgingFixture();
    const scored = await addScoredPresentation(fixture, {
      name: "Primera",
      orderNumber: 1,
    });
    const pending = await fixture.addPresentation({
      name: "Sin evaluar",
      orderNumber: 2,
    });
    await publishResults(fixture.event.id);

    expect(await isPresentationResultPublished(scored.choreographyId)).toBe(
      true,
    );
    expect(await isPresentationResultPublished(pending.choreographyId)).toBe(
      false,
    );

    await hideResults(fixture.event.id);

    expect(await isPresentationResultPublished(scored.choreographyId)).toBe(
      false,
    );
  });

  test("is false with the event hidden while the presentation keeps its stamp", async () => {
    const fixture = await seedJudgingFixture();
    const scored = await addScoredPresentation(fixture, {
      name: "Primera",
      orderNumber: 1,
    });
    await publishResults(fixture.event.id);
    await db
      .update(events)
      .set({ resultsPublishedAt: null })
      .where(eq(events.id, fixture.event.id));

    expect(await isPresentationResultPublished(scored.choreographyId)).toBe(
      false,
    );
  });

  test("is false for a choreography with no presentation at all", async () => {
    expect(await isPresentationResultPublished(crypto.randomUUID())).toBe(
      false,
    );
  });
});

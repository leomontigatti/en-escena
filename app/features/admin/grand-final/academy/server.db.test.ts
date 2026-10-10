import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  createSignedInAdminRequest as createSignedInRequest,
  expectThrownResponse,
} from "@/lib/admin/test-support/db";
import { setAcademyFinalistPicks } from "@/lib/grand-final/finalist-pick.server";
import { seedEligibilityFixture } from "@/lib/grand-final/grand-final.test-support";
import { readGrandFinalPicks } from "@/lib/grand-final/picks-overview.server";
import {
  openVotingRound,
  readCurrentVotingRound,
} from "@/lib/grand-final/voting-round.server";
import { createFilesystemObjectStorageAdapter } from "@/lib/storage/filesystem-client.server";
import {
  createFilesystemGrandFinalBannerStorage,
  createGrandFinalBannerStorage,
  type GrandFinalBannerStorage,
} from "@/lib/storage/grand-final-banners.server";
import { pngFile } from "@/lib/test-support/images";

import {
  handleAcademyGrandFinalAction,
  loadAcademyGrandFinalRouteData,
} from "./server";
import {
  bannerFieldNames,
  judgeIdsFieldName,
  judgeIdsPostedFieldName,
  saveAcademyGrandFinalIntent,
} from "./shared";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

// The real filesystem store over a temporary volume, handed to the route's
// loader and action: the key layout, the shape rule and the order of writes
// stay real.
let baseDir = "";
let storage: GrandFinalBannerStorage;

beforeEach(async () => {
  baseDir = await mkdtemp(join(tmpdir(), "en-escena-banners-"));
  storage = createFilesystemGrandFinalBannerStorage({
    baseDir,
    now: () => 1_000_000,
    secret: "volume-signing-secret",
  });
});

afterEach(async () => {
  await rm(baseDir, { force: true, recursive: true });
});

/**
 * "Academia Vecina" eligible in Jazz and picked by a judge: a finalist. Each
 * academy comes as its page in Jazz.
 */
async function seedFinalist() {
  const fixture = await seedEligibilityFixture();
  const jazz = await fixture.addModality("Jazz");
  const vecina = await fixture.addAcademy("Academia Vecina");
  const pirueta = await fixture.addAcademy("Academia Pirueta");
  let firstChoreographyId = "";

  for (const academy of [vecina, pirueta]) {
    const choreographyId = await fixture.register({
      academy,
      category: "Infantil",
      modality: jazz,
    });
    await fixture.register({ academy, category: "Mayores", modality: jazz });
    firstChoreographyId ||= choreographyId;
  }

  const judgeId = await fixture.addJudge();
  await fixture.assignJudge(judgeId, firstChoreographyId);
  await setAcademyFinalistPicks({
    academyId: vecina,
    picks: [{ judgeIds: [judgeId], modalityId: jazz }],
  });

  const outsider = await fixture.addAcademy("Academia Ajena");
  const tap = await fixture.addModality("Tap");
  const inJazz = (academyId: string) => ({ academyId, modalityId: jazz });

  return {
    choreographyId: firstChoreographyId,
    eventId: fixture.eventId,
    fixture,
    jazz,
    judgeId,
    outsider: inJazz(outsider),
    pirueta: inJazz(pirueta),
    tap,
    vecina: inJazz(vecina),
  };
}

type Page = { academyId: string; modalityId: string };

const pageUrl = ({ academyId, modalityId }: Page) =>
  `http://localhost/administracion/gran-final/${academyId}/${modalityId}`;

/** What the form posts for each banner: a new file, its stored key, or "". */
type BannerField = File | string;

/** A save with no `judgeIds` posts no judges field, and leaves the picks alone. */
async function save(
  page: Page,
  banners: { first?: BannerField; second?: BannerField },
  role: "admin" | "auditor" = "admin",
  judgeIds?: string[],
) {
  const body = new FormData();
  body.set("intent", saveAcademyGrandFinalIntent);

  if (judgeIds) {
    body.set(judgeIdsPostedFieldName, "1");

    for (const judgeId of judgeIds) {
      body.append(judgeIdsFieldName, judgeId);
    }
  }

  for (const slot of ["first", "second"] as const) {
    const value = banners[slot];

    if (value instanceof File) {
      body.set(bannerFieldNames[slot].file, value);
    } else if (value !== undefined) {
      body.set(bannerFieldNames[slot].storageKey, value);
    }
  }

  const { request } = await createSignedInRequest({
    body,
    email: `${role}.${crypto.randomUUID()}@example.com`,
    requestUrl: pageUrl(page),
    role,
  });

  return await handleAcademyGrandFinalAction(request, page, storage);
}

async function load(page: Page, role: "admin" | "auditor" = "admin") {
  const { request } = await createSignedInRequest({
    email: `${role}.${crypto.randomUUID()}@example.com`,
    requestUrl: pageUrl(page),
    role,
  });

  return await loadAcademyGrandFinalRouteData(request, page, storage);
}

async function storedObjects(eventId: string, academyId: string) {
  try {
    return (
      await readdir(
        join(
          baseDir,
          "en-escena-grand-final-banners",
          "events",
          eventId,
          "grand-final",
          academyId,
        ),
      )
    ).sort();
  } catch {
    return [];
  }
}

const wide = (name = "banner.png") => pngFile(name, 1920, 1080);

describe("the finalist banner form", () => {
  test("stores both pictures and shows them back, and the list counts them", async () => {
    const { eventId, vecina } = await seedFinalist();

    await expect(
      save(vecina, { first: wide(), second: wide() }),
    ).resolves.toEqual({
      message: "Guardaste los cambios.",
      status: "success",
    });

    const page = await load(vecina);

    expect(page.academyName).toBe("Academia Vecina");
    expect(page.bannerUrls.first).toMatch(
      /^\/almacenamiento\?bucket=en-escena-grand-final-banners&/,
    );
    expect(page.bannerUrls.second).toMatch(
      /^\/almacenamiento\?bucket=en-escena-grand-final-banners&/,
    );
    expect(await storedObjects(eventId, vecina.academyId)).toEqual(
      [page.values.firstBannerStorageKey, page.values.secondBannerStorageKey]
        .map((key) => key.split("/").at(-1))
        .sort(),
    );

    const { modalities } = await readGrandFinalPicks(eventId);

    expect(
      modalities[0].academies.find((row) => row.academyId === vecina.academyId)
        ?.bannerCount,
    ).toBe(2);
  });

  test("replaces one picture, keeps the other, and deletes the replaced object", async () => {
    const { eventId, vecina } = await seedFinalist();
    await save(vecina, { first: wide(), second: wide() });
    const before = (await load(vecina)).values;

    await save(vecina, {
      first: before.firstBannerStorageKey,
      second: wide("new.png"),
    });

    const after = (await load(vecina)).values;

    expect(after.firstBannerStorageKey).toBe(before.firstBannerStorageKey);
    expect(after.secondBannerStorageKey).not.toBe(
      before.secondBannerStorageKey,
    );
    expect(await storedObjects(eventId, vecina.academyId)).toHaveLength(2);
  });

  // The open round copied the keys and the vote page still shows them.
  test("keeps a replaced picture's object while a voting round names it", async () => {
    const { eventId, vecina } = await seedFinalist();
    await save(vecina, { first: wide(), second: wide() });
    await openVotingRound({ eventId });
    const opened = await readCurrentVotingRound(eventId);

    await save(vecina, { first: wide("new.png"), second: "" });

    const names = await storedObjects(eventId, vecina.academyId);
    expect(names).toHaveLength(3);
    for (const key of Object.values(opened?.finalists[0]?.keys ?? {})) {
      expect(names).toContain(key.split("/").at(-1));
    }
  });

  test("refuses a picture that is not 16:9, naming the rule, and changes nothing", async () => {
    const { eventId, vecina } = await seedFinalist();
    await save(vecina, { first: wide(), second: "" });
    const before = (await load(vecina)).values;

    await expect(
      save(vecina, {
        first: wide("replacement.png"),
        second: pngFile("square.png", 1600, 1600),
      }),
    ).resolves.toMatchObject({
      data: {
        message:
          "El Banner 2 tiene que ser horizontal 16:9, como 1920 × 1080; el elegido mide 1600 × 1600.",
        status: "error",
      },
      init: { status: 422 },
    });
    // The first picture was accepted and uploaded before the second was
    // refused; the save as a whole is refused, so it goes too.
    expect((await load(vecina)).values).toEqual(before);
    expect(await storedObjects(eventId, vecina.academyId)).toHaveLength(1);
  });

  test("refuses a 16:9 picture narrower than the minimum, naming the width", async () => {
    const { vecina } = await seedFinalist();

    await expect(
      save(vecina, { first: pngFile("small.png", 1024, 576) }),
    ).resolves.toMatchObject({
      data: {
        message:
          "El Banner 1 tiene que medir al menos 1280 px de ancho; el elegido mide 1024 px.",
      },
    });
  });

  test("removes a banner whose stored key comes back empty", async () => {
    const { eventId, vecina } = await seedFinalist();
    await save(vecina, { first: wide(), second: wide() });
    const before = (await load(vecina)).values;

    await save(vecina, { first: "", second: before.secondBannerStorageKey });

    expect((await load(vecina)).values).toMatchObject({
      firstBannerStorageKey: "",
      secondBannerStorageKey: before.secondBannerStorageKey,
    });
    expect(await storedObjects(eventId, vecina.academyId)).toHaveLength(1);
  });

  test("opens the page of an eligible academy no judge picked, with the event's judges", async () => {
    const { jazz, judgeId, pirueta } = await seedFinalist();

    await expect(load(pirueta)).resolves.toMatchObject({
      academyName: "Academia Pirueta",
      eligible: true,
      finalist: false,
      judges: [{ id: judgeId }],
      modalityId: jazz,
      modalityName: "Jazz",
      values: { judgeIds: [] },
    });
  });

  test("picks the academy for the judges chosen, moving a judge's pick off another academy", async () => {
    const { judgeId, pirueta, vecina } = await seedFinalist();

    await expect(save(pirueta, {}, "admin", [judgeId])).resolves.toEqual({
      message: "Guardaste los cambios.",
      status: "success",
    });

    await expect(load(pirueta)).resolves.toMatchObject({
      finalist: true,
      values: { judgeIds: [judgeId] },
    });
    await expect(load(vecina)).resolves.toMatchObject({
      finalist: false,
      values: { judgeIds: [] },
    });
  });

  test("stores no picture when a pick in the same save is refused", async () => {
    const { eventId, judgeId, vecina } = await seedFinalist();

    await expect(
      save(vecina, { first: wide() }, "admin", [judgeId, crypto.randomUUID()]),
    ).resolves.toMatchObject({ init: { status: 404 } });

    expect(await storedObjects(eventId, vecina.academyId)).toEqual([]);
    await expect(load(vecina)).resolves.toMatchObject({
      values: { firstBannerStorageKey: "", judgeIds: [judgeId] },
    });
  });

  test("names the academy a judge's pick would leave", async () => {
    const { judgeId, pirueta } = await seedFinalist();

    await expect(load(pirueta)).resolves.toMatchObject({
      otherPicks: { [judgeId]: "Academia Vecina" },
    });
  });

  test("refuses a picture for an academy no judge picked", async () => {
    const { pirueta } = await seedFinalist();

    await expect(save(pirueta, { first: wide() })).resolves.toMatchObject({
      init: { status: 404 },
    });
  });

  test("has no page for an academy that qualifies nowhere and was picked nowhere", async () => {
    const { outsider } = await seedFinalist();

    await expectThrownResponse(load(outsider), 404);
  });

  test("has no page in a modality whose list does not hold the academy", async () => {
    const { tap, vecina } = await seedFinalist();

    await expectThrownResponse(load({ ...vecina, modalityId: tap }), 404);
  });

  test("leaves the picks alone when the save posts no judges field", async () => {
    const { judgeId, vecina } = await seedFinalist();

    await save(vecina, { first: wide() });

    await expect(load(vecina)).resolves.toMatchObject({
      values: { judgeIds: [judgeId] },
    });
  });

  test("saves an academy's first pick with the empty banner keys the form posts", async () => {
    const { judgeId, pirueta } = await seedFinalist();

    await expect(
      save(pirueta, { first: "", second: "" }, "admin", [judgeId]),
    ).resolves.toEqual({
      message: "Guardaste los cambios.",
      status: "success",
    });

    await expect(load(pirueta)).resolves.toMatchObject({
      finalist: true,
      values: { judgeIds: [judgeId] },
    });
  });

  test("refuses a save to a modality whose list does not hold the academy, writing nothing", async () => {
    const { eventId, tap, vecina } = await seedFinalist();
    await save(vecina, { first: wide() });

    await expectThrownResponse(
      save({ ...vecina, modalityId: tap }, { first: "" }),
      404,
    );

    expect(await storedObjects(eventId, vecina.academyId)).toHaveLength(1);
  });

  test("goes back to the list when the save takes the academy off the modality's list", async () => {
    const { fixture, vecina } = await seedFinalist();
    await fixture.withdrawAll(vecina.academyId);

    const response = await save(vecina, {}, "admin", []).then(
      () => null,
      (thrown: unknown) => thrown,
    );

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).headers.get("location")).toBe(
      "/administracion/gran-final",
    );
  });

  test("takes every judge away when the judges field comes back empty", async () => {
    const { vecina } = await seedFinalist();

    await save(vecina, {}, "admin", []);

    await expect(load(vecina)).resolves.toMatchObject({
      finalist: false,
      values: { judgeIds: [] },
    });
  });

  test("turns the auditor away from the form and from the save", async () => {
    const { vecina } = await seedFinalist();

    await expectThrownResponse(load(vecina, "auditor"), 403);
    await expectThrownResponse(save(vecina, { first: wide() }, "auditor"), 403);
  });

  // Two saves of the same academy at once. Y starts from (A, B) and is still
  // uploading its second banner when X replaces A with C and deletes A. Y must
  // keep C, not write back the A its form saw and X already deleted.
  test("applies a save to the banners as they stand when it writes, not as they were when it began", async () => {
    const { eventId, vecina } = await seedFinalist();
    await save(vecina, { first: wide(), second: wide() });
    const before = (await load(vecina)).values;
    const adapter = createFilesystemObjectStorageAdapter({
      baseDir,
      secret: "volume-signing-secret",
    });
    let resumeY = () => {};
    let yIsUploading = () => {};
    const yUploadStarted = new Promise<void>((resolve) => {
      yIsUploading = resolve;
    });
    const slowVolume = createGrandFinalBannerStorage({
      ...adapter,
      upload: async (upload) => {
        yIsUploading();
        await new Promise<void>((resolve) => {
          resumeY = resolve;
        });
        await adapter.upload(upload);
      },
    });
    const bodyY = new FormData();
    bodyY.set("intent", saveAcademyGrandFinalIntent);
    bodyY.set(bannerFieldNames.first.storageKey, before.firstBannerStorageKey);
    bodyY.set(bannerFieldNames.second.file, wide("y.png"));
    const { request: requestY } = await createSignedInRequest({
      body: bodyY,
      email: `admin.${crypto.randomUUID()}@example.com`,
      requestUrl: pageUrl(vecina),
      role: "admin",
    });

    const saveY = handleAcademyGrandFinalAction(requestY, vecina, slowVolume);
    await yUploadStarted;
    await save(vecina, {
      first: wide("x.png"),
      second: before.secondBannerStorageKey,
    });
    const afterX = (await load(vecina)).values;
    resumeY();
    await saveY;

    const final = (await load(vecina)).values;

    expect(final.firstBannerStorageKey).toBe(afterX.firstBannerStorageKey);
    expect(await storedObjects(eventId, vecina.academyId)).toEqual(
      [final.firstBannerStorageKey, final.secondBannerStorageKey]
        .map((key) => key.split("/").at(-1))
        .sort(),
    );
  });

  test("keeps the banners it began with when a judge it keeps moves to another academy while its picture uploads", async () => {
    const { eventId, fixture, jazz, judgeId, pirueta, vecina } =
      await seedFinalist();
    await save(vecina, { first: wide(), second: wide() });
    const before = (await load(vecina)).values;
    // Vecina stops qualifying, so the judge who still picks it can only be
    // kept, never added back.
    await fixture.withdrawAll(vecina.academyId);
    const adapter = createFilesystemObjectStorageAdapter({
      baseDir,
      secret: "volume-signing-secret",
    });
    const volumeWhileJudgeMoves = createGrandFinalBannerStorage({
      ...adapter,
      upload: async (upload) => {
        await setAcademyFinalistPicks({
          academyId: pirueta.academyId,
          picks: [{ judgeIds: [judgeId], modalityId: jazz }],
        });
        await adapter.upload(upload);
      },
    });
    const body = new FormData();
    body.set("intent", saveAcademyGrandFinalIntent);
    body.set(judgeIdsPostedFieldName, "1");
    body.append(judgeIdsFieldName, judgeId);
    body.set(bannerFieldNames.first.file, wide("new.png"));
    body.set(bannerFieldNames.second.storageKey, before.secondBannerStorageKey);
    const { request } = await createSignedInRequest({
      body,
      email: `admin.${crypto.randomUUID()}@example.com`,
      requestUrl: pageUrl(vecina),
      role: "admin",
    });

    await expect(
      handleAcademyGrandFinalAction(request, vecina, volumeWhileJudgeMoves),
    ).resolves.toMatchObject({
      data: { status: "error" },
      init: { status: 409 },
    });

    expect(await storedObjects(eventId, vecina.academyId)).toEqual(
      [before.firstBannerStorageKey, before.secondBannerStorageKey]
        .map((key) => key.split("/").at(-1))
        .sort(),
    );
  });

  test("adds no judge, and keeps its banners, when the academy stops qualifying while its picture uploads", async () => {
    const { choreographyId, eventId, fixture, judgeId, vecina } =
      await seedFinalist();
    await save(vecina, { first: wide(), second: wide() });
    const before = (await load(vecina)).values;
    const addedJudgeId = await fixture.addJudge("Otro Juez");
    await fixture.assignJudge(addedJudgeId, choreographyId);
    const adapter = createFilesystemObjectStorageAdapter({
      baseDir,
      secret: "volume-signing-secret",
    });
    const volumeWhileWithdrawn = createGrandFinalBannerStorage({
      ...adapter,
      upload: async (upload) => {
        await fixture.withdrawAll(vecina.academyId);
        await adapter.upload(upload);
      },
    });
    const body = new FormData();
    body.set("intent", saveAcademyGrandFinalIntent);
    body.set(judgeIdsPostedFieldName, "1");
    body.append(judgeIdsFieldName, judgeId);
    body.append(judgeIdsFieldName, addedJudgeId);
    body.set(bannerFieldNames.first.file, wide("new.png"));
    body.set(bannerFieldNames.second.storageKey, before.secondBannerStorageKey);
    const { request } = await createSignedInRequest({
      body,
      email: `admin.${crypto.randomUUID()}@example.com`,
      requestUrl: pageUrl(vecina),
      role: "admin",
    });

    await expect(
      handleAcademyGrandFinalAction(request, vecina, volumeWhileWithdrawn),
    ).resolves.toMatchObject({
      data: { status: "error" },
      init: { status: 409 },
    });

    await expect(load(vecina)).resolves.toMatchObject({
      values: {
        firstBannerStorageKey: before.firstBannerStorageKey,
        judgeIds: [judgeId],
      },
    });
    expect(await storedObjects(eventId, vecina.academyId)).toEqual(
      [before.firstBannerStorageKey, before.secondBannerStorageKey]
        .map((key) => key.split("/").at(-1))
        .sort(),
    );
  });

  test("still reports the refusal when removing what it uploaded fails", async () => {
    const { vecina } = await seedFinalist();
    const adapter = createFilesystemObjectStorageAdapter({
      baseDir,
      secret: "volume-signing-secret",
    });
    const brokenCleanup = createGrandFinalBannerStorage({
      ...adapter,
      remove: async () => {
        throw new Error("EIO: cleanup failed");
      },
    });
    const body = new FormData();
    body.set("intent", saveAcademyGrandFinalIntent);
    body.set(bannerFieldNames.first.file, wide());
    body.set(bannerFieldNames.second.file, pngFile("square.png", 1600, 1600));
    const { request } = await createSignedInRequest({
      body,
      email: `admin.${crypto.randomUUID()}@example.com`,
      requestUrl: pageUrl(vecina),
      role: "admin",
    });

    await expect(
      handleAcademyGrandFinalAction(request, vecina, brokenCleanup),
    ).resolves.toMatchObject({ init: { status: 422 } });
  });

  test("removes what it uploaded when a later upload throws, and keeps the row", async () => {
    const { eventId, vecina } = await seedFinalist();
    const adapter = createFilesystemObjectStorageAdapter({
      baseDir,
      secret: "volume-signing-secret",
    });
    const fullVolume = createGrandFinalBannerStorage({
      ...adapter,
      upload: async (upload) => {
        if (upload.key.includes("/second-")) {
          throw new Error("ENOSPC: no space left on device");
        }

        await adapter.upload(upload);
      },
    });
    const body = new FormData();
    body.set("intent", saveAcademyGrandFinalIntent);
    body.set(bannerFieldNames.first.file, wide());
    body.set(bannerFieldNames.second.file, wide());
    const { request } = await createSignedInRequest({
      body,
      email: `admin.${crypto.randomUUID()}@example.com`,
      requestUrl: pageUrl(vecina),
      role: "admin",
    });

    await expect(
      handleAcademyGrandFinalAction(request, vecina, fullVolume),
    ).rejects.toThrow("ENOSPC");
    expect(await storedObjects(eventId, vecina.academyId)).toEqual([]);
    expect((await load(vecina)).values).toMatchObject({
      firstBannerStorageKey: "",
      secondBannerStorageKey: "",
    });
  });
});

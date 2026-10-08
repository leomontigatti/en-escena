import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  createSignedInAdminRequest as createSignedInRequest,
  expectThrownResponse,
} from "@/lib/admin/test-support/db";
import { setFinalistPick } from "@/lib/grand-final/finalist-pick.server";
import { seedEligibilityFixture } from "@/lib/grand-final/grand-final.test-support";
import { readGrandFinalPicks } from "@/lib/grand-final/picks-overview.server";
import { createFilesystemObjectStorageAdapter } from "@/lib/storage/filesystem-client.server";
import {
  createFilesystemGrandFinalBannerStorage,
  createGrandFinalBannerStorage,
  type GrandFinalBannerStorage,
} from "@/lib/storage/grand-final-banners.server";
import { pngFile } from "@/lib/test-support/images";

import {
  handleFinalistBannersAction,
  loadFinalistBannersRouteData,
} from "./server";
import { bannerFieldNames, saveFinalistBannersIntent } from "./shared";

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

/** "Academia Vecina" eligible in Jazz and picked by a judge: a finalist. */
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
  await setFinalistPick({ academyId: vecina, judgeId, modalityId: jazz });

  return { eventId: fixture.eventId, pirueta, vecina };
}

const pageUrl = (academyId: string) =>
  `http://localhost/administracion/gran-final/${academyId}`;

/** What the form posts for each banner: a new file, its stored key, or "". */
type BannerField = File | string;

async function save(
  academyId: string,
  banners: { first?: BannerField; second?: BannerField },
  role: "admin" | "auditor" = "admin",
) {
  const body = new FormData();
  body.set("intent", saveFinalistBannersIntent);

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
    requestUrl: pageUrl(academyId),
    role,
  });

  return await handleFinalistBannersAction(request, academyId, storage);
}

async function load(academyId: string, role: "admin" | "auditor" = "admin") {
  const { request } = await createSignedInRequest({
    email: `${role}.${crypto.randomUUID()}@example.com`,
    requestUrl: pageUrl(academyId),
    role,
  });

  return await loadFinalistBannersRouteData(request, academyId, storage);
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
      message: "Guardaste los banners.",
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
    expect(await storedObjects(eventId, vecina)).toEqual(
      [page.values.firstBannerStorageKey, page.values.secondBannerStorageKey]
        .map((key) => key.split("/").at(-1))
        .sort(),
    );

    const { modalities } = await readGrandFinalPicks(eventId);

    expect(
      modalities[0].academies.find((row) => row.academyId === vecina)
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
    expect(await storedObjects(eventId, vecina)).toHaveLength(2);
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
    expect(await storedObjects(eventId, vecina)).toHaveLength(1);
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

    expect((await load(vecina)).values).toEqual({
      firstBannerStorageKey: "",
      secondBannerStorageKey: before.secondBannerStorageKey,
    });
    expect(await storedObjects(eventId, vecina)).toHaveLength(1);
  });

  test("has no form for an academy no judge picked", async () => {
    const { pirueta } = await seedFinalist();

    await expectThrownResponse(load(pirueta), 404);
    await expect(save(pirueta, { first: wide() })).resolves.toMatchObject({
      init: { status: 404 },
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
    bodyY.set("intent", saveFinalistBannersIntent);
    bodyY.set(bannerFieldNames.first.storageKey, before.firstBannerStorageKey);
    bodyY.set(bannerFieldNames.second.file, wide("y.png"));
    const { request: requestY } = await createSignedInRequest({
      body: bodyY,
      email: `admin.${crypto.randomUUID()}@example.com`,
      requestUrl: pageUrl(vecina),
      role: "admin",
    });

    const saveY = handleFinalistBannersAction(requestY, vecina, slowVolume);
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
    expect(await storedObjects(eventId, vecina)).toEqual(
      [final.firstBannerStorageKey, final.secondBannerStorageKey]
        .map((key) => key.split("/").at(-1))
        .sort(),
    );
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
    body.set("intent", saveFinalistBannersIntent);
    body.set(bannerFieldNames.first.file, wide());
    body.set(bannerFieldNames.second.file, wide());
    const { request } = await createSignedInRequest({
      body,
      email: `admin.${crypto.randomUUID()}@example.com`,
      requestUrl: pageUrl(vecina),
      role: "admin",
    });

    await expect(
      handleFinalistBannersAction(request, vecina, fullVolume),
    ).rejects.toThrow("ENOSPC");
    expect(await storedObjects(eventId, vecina)).toEqual([]);
    expect((await load(vecina)).values).toEqual({
      firstBannerStorageKey: "",
      secondBannerStorageKey: "",
    });
  });
});

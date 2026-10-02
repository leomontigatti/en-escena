import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import yauzl from "yauzl";

import { db } from "@/db";
import { academies, choreographies, schedules } from "@/db/schema";
import {
  createSignedInAdminRequest,
  expectThrownResponse,
} from "@/lib/admin/test-support/db";
import { seedJudgingFixture } from "@/lib/judging/judging.test-support";
import { getAssetKindPolicy } from "@/lib/storage/asset-kinds";
import { fsUpload } from "@/lib/storage/filesystem-client.server";

import { loadMusicDownload } from "./server";
import { buildMusicDownloadHref } from "./shared";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

const musicBucket = getAssetKindPolicy("choreographyMusic").bucket;
let baseDir: string;

beforeEach(async () => {
  baseDir = await mkdtemp(join(tmpdir(), "en-escena-music-download-"));
});

afterEach(async () => {
  await rm(baseDir, { force: true, recursive: true });
});

async function signedInRequest(
  day: string,
  role: "academy" | "admin" | "auditor" = "admin",
) {
  const { request } = await createSignedInAdminRequest({
    email: `${crypto.randomUUID()}@example.com`,
    requestUrl: `http://localhost${buildMusicDownloadHref(day)}`,
    role,
  });

  return request;
}

async function addPresentationWithMusic(
  fixture: Awaited<ReturnType<typeof seedJudgingFixture>>,
  input: {
    content?: string;
    name: string;
    orderNumber: number;
    scheduledDate: string;
  },
) {
  const added = await fixture.addPresentation(input);

  if (input.content !== undefined) {
    const storageKey = `academies/a/choreographies/${added.choreographyId}/music.mp3`;

    await fsUpload({
      baseDir,
      bucket: musicBucket,
      file: new Blob([input.content]),
      key: storageKey,
    });
    await db
      .update(choreographies)
      .set({ musicStorageKey: storageKey })
      .where(eq(choreographies.id, added.choreographyId));
  }

  const [row] = await db
    .select({
      academyName: academies.name,
      scheduleId: choreographies.scheduleId,
    })
    .from(choreographies)
    .innerJoin(academies, eq(choreographies.academyId, academies.id))
    .where(eq(choreographies.id, added.choreographyId));

  return { ...added, ...row };
}

async function readZip(response: Response) {
  const bytes = Buffer.from(await response.arrayBuffer());

  return await new Promise<Map<string, string>>((resolve, reject) => {
    yauzl.fromBuffer(bytes, { lazyEntries: true }, (error, zip) => {
      if (error) {
        reject(error);
        return;
      }

      const entries = new Map<string, string>();

      zip.on("entry", (entry: yauzl.Entry) => {
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError) {
            reject(streamError);
            return;
          }

          const chunks: Buffer[] = [];

          stream.on("data", (chunk: Buffer) => chunks.push(chunk));
          stream.on("end", () => {
            entries.set(entry.fileName, Buffer.concat(chunks).toString());
            zip.readEntry();
          });
        });
      });
      zip.on("end", () => resolve(entries));
      zip.on("error", reject);
      zip.readEntry();
    });
  });
}

describe("the day's music download", () => {
  test("zips the day's music in running order and lists what is missing", async () => {
    const fixture = await seedJudgingFixture();
    const first = await addPresentationWithMusic(fixture, {
      content: "primera",
      name: "Primera",
      orderNumber: 1,
      scheduledDate: "2026-05-01",
    });
    const withoutMusic = await addPresentationWithMusic(fixture, {
      name: "Sin música",
      orderNumber: 2,
      scheduledDate: "2026-05-01",
    });
    const lostFile = await addPresentationWithMusic(fixture, {
      name: "Perdida",
      orderNumber: 3,
      scheduledDate: "2026-05-01",
    });
    await db
      .update(choreographies)
      .set({ musicStorageKey: "academies/a/choreographies/x/music.mp3" })
      .where(eq(choreographies.id, lostFile.choreographyId));
    await addPresentationWithMusic(fixture, {
      content: "otro día",
      name: "Otro día",
      orderNumber: 10,
      scheduledDate: "2026-05-02",
    });
    // Every presentation of the day lands on one schedule, so no folders.
    await db
      .update(choreographies)
      .set({ scheduleId: first.scheduleId })
      .where(eq(choreographies.id, withoutMusic.choreographyId));
    await db
      .update(choreographies)
      .set({ scheduleId: first.scheduleId })
      .where(eq(choreographies.id, lostFile.choreographyId));

    const response = await loadMusicDownload(
      await signedInRequest("2026-05-01"),
      { baseDir },
    );

    expect(response.headers.get("Content-Type")).toBe("application/zip");
    expect(response.headers.get("Content-Disposition")).toMatch(
      /^attachment; filename="audios-[a-z0-9-]+-2026-05-01\.zip"$/,
    );

    const entries = await readZip(response);

    expect([...entries.keys()]).toEqual([
      `01 - Primera - ${first.academyName}.mp3`,
      "FALTANTES.txt",
    ]);
    expect(entries.get(`01 - Primera - ${first.academyName}.mp3`)).toBe(
      "primera",
    );
    expect(entries.get("FALTANTES.txt")).toBe(
      [
        "Presentaciones sin audio cargado",
        "",
        `N.º 2 - Sin música - ${first.academyName}`,
        `N.º 3 - Perdida - ${first.academyName}`,
        "",
      ].join("\r\n"),
    );
  });

  test("folds each schedule of the day into its own folder", async () => {
    const fixture = await seedJudgingFixture();
    const morning = await addPresentationWithMusic(fixture, {
      content: "a",
      name: "Mañana",
      orderNumber: 1,
      scheduledDate: "2026-05-01",
    });
    const evening = await addPresentationWithMusic(fixture, {
      content: "b",
      name: "Noche",
      orderNumber: 2,
      scheduledDate: "2026-05-01",
    });
    await db
      .update(schedules)
      .set({ name: "Turno mañana", startTime: "10:00" })
      .where(eq(schedules.id, morning.scheduleId));
    await db
      .update(schedules)
      .set({ name: "Turno noche", startTime: "20:30" })
      .where(eq(schedules.id, evening.scheduleId));

    const entries = await readZip(
      await loadMusicDownload(await signedInRequest("2026-05-01"), {
        baseDir,
      }),
    );

    expect([...entries.keys()]).toEqual([
      `10.00 - Turno mañana/1 - Mañana - ${morning.academyName}.mp3`,
      `20.30 - Turno noche/2 - Noche - ${evening.academyName}.mp3`,
    ]);
  });

  test("answers not found when the day has no music at all", async () => {
    const fixture = await seedJudgingFixture();
    await addPresentationWithMusic(fixture, {
      name: "Sin música",
      orderNumber: 1,
      scheduledDate: "2026-05-01",
    });

    await expectThrownResponse(
      loadMusicDownload(await signedInRequest("2026-05-01"), { baseDir }),
      404,
    );
  });

  test("answers not found for a day with no presentation", async () => {
    const fixture = await seedJudgingFixture();
    await addPresentationWithMusic(fixture, {
      content: "a",
      name: "Una",
      orderNumber: 1,
      scheduledDate: "2026-05-01",
    });

    await expectThrownResponse(
      loadMusicDownload(await signedInRequest("2026-05-09"), { baseDir }),
      404,
    );
  });

  test("is the administration's alone", async () => {
    const fixture = await seedJudgingFixture();
    await addPresentationWithMusic(fixture, {
      content: "a",
      name: "Una",
      orderNumber: 1,
      scheduledDate: "2026-05-01",
    });

    await expectThrownResponse(
      loadMusicDownload(await signedInRequest("2026-05-01", "auditor"), {
        baseDir,
      }),
      403,
    );
  });
});

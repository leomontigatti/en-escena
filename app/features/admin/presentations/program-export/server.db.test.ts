import { eq, inArray } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import yauzl from "yauzl";

import { db } from "@/db";
import {
  academies,
  choreographies,
  choreographyDancers,
  dancers,
} from "@/db/schema";
import {
  createSignedInAdminRequest,
  expectThrownResponse,
} from "@/lib/admin/test-support/db";
import { seedJudgingFixture } from "@/lib/judging/judging.test-support";

import {
  buildExportHref,
  exportAllDays,
} from "@/features/admin/day-export/shared";

import { loadProgramExport } from "./server";
import { programExportPath } from "./shared";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

async function signedInRequest(
  day: string,
  role: "admin" | "auditor" = "admin",
) {
  const { request } = await createSignedInAdminRequest({
    email: `${crypto.randomUUID()}@example.com`,
    requestUrl: `http://localhost${buildExportHref(programExportPath, day)}`,
    role,
  });

  return request;
}

type Fixture = Awaited<ReturnType<typeof seedJudgingFixture>>;

/** A presentation whose one dancer is called `dancerName`. */
async function addPresentation(
  fixture: Fixture,
  input: {
    dancerName: string;
    groupType?: "solo" | "duo" | "trio" | "grupal";
    name: string;
    orderNumber: number;
    scheduledDate: string;
  },
) {
  const added = await fixture.addPresentation(input);
  const [firstName, lastName] = input.dancerName.split(" ");

  await db
    .update(choreographies)
    .set({ groupType: input.groupType ?? "solo" })
    .where(eq(choreographies.id, added.choreographyId));
  await db
    .update(dancers)
    .set({ firstName, lastName })
    .where(
      inArray(
        dancers.id,
        db
          .select({ id: choreographyDancers.dancerId })
          .from(choreographyDancers)
          .where(eq(choreographyDancers.choreographyId, added.choreographyId)),
      ),
    );

  return added;
}

/** Every text the workbook holds: a spreadsheet keeps them in one table. */
async function readWorkbookStrings(response: Response) {
  const bytes = Buffer.from(await response.arrayBuffer());
  const xml = await new Promise<string>((resolve, reject) => {
    yauzl.fromBuffer(bytes, { lazyEntries: true }, (error, zip) => {
      if (error) {
        reject(error);
        return;
      }

      zip.on("entry", (entry: yauzl.Entry) => {
        if (entry.fileName !== "xl/sharedStrings.xml") {
          zip.readEntry();
          return;
        }

        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError) {
            reject(streamError);
            return;
          }

          const chunks: Buffer[] = [];

          stream.on("data", (chunk: Buffer) => chunks.push(chunk));
          stream.on("end", () => resolve(Buffer.concat(chunks).toString()));
        });
      });
      zip.on("end", () => reject(new Error("No shared strings")));
      zip.on("error", reject);
      zip.readEntry();
    });
  });

  return [...xml.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map((match) => match[1]);
}

describe("the program export", () => {
  test("exports every day's presentations when asked for all of them", async () => {
    const fixture = await seedJudgingFixture();
    await addPresentation(fixture, {
      dancerName: "Ana Pérez",
      name: "Primera",
      orderNumber: 1,
      scheduledDate: "2026-05-01",
    });
    await addPresentation(fixture, {
      dancerName: "Bruno Gómez",
      name: "Otro día",
      orderNumber: 2,
      scheduledDate: "2026-05-02",
    });

    const response = await loadProgramExport(
      await signedInRequest(exportAllDays),
    );

    expect(response.headers.get("Content-Type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(response.headers.get("Content-Disposition")).toMatch(
      /^attachment; filename="programa-[a-z0-9-]+-todos\.xlsx"$/,
    );

    const strings = await readWorkbookStrings(response);

    expect(strings).toContain("Coreografía");
    expect(strings).toContain("Primera");
    expect(strings).toContain("Otro día");
  });

  test("exports only the chosen day", async () => {
    const fixture = await seedJudgingFixture();
    await addPresentation(fixture, {
      dancerName: "Ana Pérez",
      name: "Primera",
      orderNumber: 1,
      scheduledDate: "2026-05-01",
    });
    await addPresentation(fixture, {
      dancerName: "Bruno Gómez",
      name: "Otro día",
      orderNumber: 2,
      scheduledDate: "2026-05-02",
    });

    const response = await loadProgramExport(
      await signedInRequest("2026-05-01"),
    );

    expect(response.headers.get("Content-Disposition")).toMatch(
      /-2026-05-01\.xlsx"$/,
    );

    const strings = await readWorkbookStrings(response);

    expect(strings).toContain("Primera");
    expect(strings).not.toContain("Otro día");
  });

  test("names the dancers up to a trio, and the academy's province", async () => {
    const fixture = await seedJudgingFixture();
    const trio = await addPresentation(fixture, {
      dancerName: "Carla Díaz",
      groupType: "trio",
      name: "Trío",
      orderNumber: 1,
      scheduledDate: "2026-05-01",
    });
    await addPresentation(fixture, {
      dancerName: "Dario Ruiz",
      groupType: "grupal",
      name: "Grupal",
      orderNumber: 2,
      scheduledDate: "2026-05-01",
    });
    const [{ academyId }] = await db
      .select({ academyId: choreographies.academyId })
      .from(choreographies)
      .where(eq(choreographies.id, trio.choreographyId));
    await db
      .update(academies)
      .set({ province: "entre_rios" })
      .where(eq(academies.id, academyId));

    const strings = await readWorkbookStrings(
      await loadProgramExport(await signedInRequest(exportAllDays)),
    );

    expect(strings).toContain("Carla Díaz");
    expect(strings).not.toContain("Dario Ruiz");
    // The province by its label, never by its stored value.
    expect(strings).toContain("Entre Ríos");
    expect(strings).not.toContain("entre_rios");
  });

  test("answers not found for a day with no presentation", async () => {
    const fixture = await seedJudgingFixture();
    await addPresentation(fixture, {
      dancerName: "Ana Pérez",
      name: "Primera",
      orderNumber: 1,
      scheduledDate: "2026-05-01",
    });

    await expectThrownResponse(
      loadProgramExport(await signedInRequest("2026-05-09")),
      404,
    );
  });

  test("is the administration's alone", async () => {
    const fixture = await seedJudgingFixture();
    await addPresentation(fixture, {
      dancerName: "Ana Pérez",
      name: "Primera",
      orderNumber: 1,
      scheduledDate: "2026-05-01",
    });

    await expectThrownResponse(
      loadProgramExport(await signedInRequest(exportAllDays, "auditor")),
      403,
    );
  });
});

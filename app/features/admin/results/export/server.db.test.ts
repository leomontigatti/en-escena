import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";
import yauzl from "yauzl";

import { db } from "@/db";
import { presentations, scores } from "@/db/schema";
import {
  buildExportHref,
  exportAllDays,
} from "@/features/admin/day-export/shared";
import {
  createSignedInAdminRequest,
  expectThrownResponse,
} from "@/lib/admin/test-support/db";
import { seedJudgingFixture } from "@/lib/judging/judging.test-support";

import { loadResultsExport } from "./server";
import { resultsExportPath } from "./shared";

import { installDatabaseTestHooks } from "../../../../../tests/db/harness";

installDatabaseTestHooks();

async function signedInRequest(
  day: string,
  role: "admin" | "auditor" = "admin",
) {
  const { request } = await createSignedInAdminRequest({
    email: `${crypto.randomUUID()}@example.com`,
    requestUrl: `http://localhost${buildExportHref(resultsExportPath, day)}`,
    role,
  });

  return request;
}

type Fixture = Awaited<ReturnType<typeof seedJudgingFixture>>;

async function addScored(
  fixture: Fixture,
  input: { name: string; orderNumber: number; scheduledDate: string },
  value: string,
) {
  const added = await fixture.addPresentation(input);
  const { judgeAssignmentId } = await fixture.assignJudge(added.presentationId);

  await db.insert(scores).values({ judgeAssignmentId, value });

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

describe("the results export", () => {
  test("exports what has a result, and leaves out what has none", async () => {
    const fixture = await seedJudgingFixture();
    await addScored(
      fixture,
      { name: "Evaluada", orderNumber: 1, scheduledDate: "2026-05-01" },
      "95",
    );
    await fixture.addPresentation({
      name: "Sin evaluar",
      orderNumber: 2,
      scheduledDate: "2026-05-01",
    });
    const disqualified = await addScored(
      fixture,
      { name: "Descalificada", orderNumber: 3, scheduledDate: "2026-05-01" },
      "90",
    );
    await db
      .update(presentations)
      .set({ disqualifiedAt: new Date() })
      .where(eq(presentations.id, disqualified.presentationId));

    const response = await loadResultsExport(
      await signedInRequest(exportAllDays),
    );

    expect(response.headers.get("Content-Disposition")).toMatch(
      /^attachment; filename="resultados-[a-z0-9-]+-todos\.xlsx"$/,
    );

    const strings = await readWorkbookStrings(response);

    expect(strings).toContain("Premio");
    expect(strings).toContain("Evaluada");
    expect(strings).not.toContain("Sin evaluar");
    expect(strings).not.toContain("Descalificada");
  });

  test("exports only the chosen day", async () => {
    const fixture = await seedJudgingFixture();
    await addScored(
      fixture,
      { name: "Primera", orderNumber: 1, scheduledDate: "2026-05-01" },
      "95",
    );
    await addScored(
      fixture,
      { name: "Otro día", orderNumber: 2, scheduledDate: "2026-05-02" },
      "95",
    );

    const strings = await readWorkbookStrings(
      await loadResultsExport(await signedInRequest("2026-05-01")),
    );

    expect(strings).toContain("Primera");
    expect(strings).not.toContain("Otro día");
  });

  test("answers not found for a day with no result", async () => {
    const fixture = await seedJudgingFixture();
    await fixture.addPresentation({
      name: "Sin evaluar",
      orderNumber: 1,
      scheduledDate: "2026-05-01",
    });

    await expectThrownResponse(
      loadResultsExport(await signedInRequest("2026-05-01")),
      404,
    );
  });

  test("is the administration's alone", async () => {
    const fixture = await seedJudgingFixture();
    await addScored(
      fixture,
      { name: "Evaluada", orderNumber: 1, scheduledDate: "2026-05-01" },
      "95",
    );

    await expectThrownResponse(
      loadResultsExport(await signedInRequest(exportAllDays, "auditor")),
      403,
    );
  });
});

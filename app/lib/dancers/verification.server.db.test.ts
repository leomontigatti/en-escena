import { inArray, sql } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { dancers } from "@/db/schema";
import { createDancer } from "@/features/portal/choreographies/test-support/db";
import { createAcademyRecord } from "@/features/portal/test-support/db";
import {
  dancerVerificationStatusCodes,
  deriveDancerVerificationStatus,
} from "@/lib/dancers/verification";
import { buildDancerVerificationStatusSql } from "@/lib/dancers/verification.server";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

describe("buildDancerVerificationStatusSql", () => {
  test("partitions the dancers exactly as the derivation classifies them", async () => {
    const rows = await seedEveryVerificationCombination();
    const ids = rows.map((row) => row.id);
    const selectedByCode = new Map<string, string[]>();

    for (const code of dancerVerificationStatusCodes) {
      const selected = await db
        .select({ id: dancers.id })
        .from(dancers)
        .where(
          sql`${inArray(dancers.id, ids)} and ${buildDancerVerificationStatusSql(code)}`,
        );

      selectedByCode.set(code, selected.map((row) => row.id).sort());
    }

    for (const code of dancerVerificationStatusCodes) {
      expect(selectedByCode.get(code)).toEqual(
        rows
          .filter((row) => deriveDancerVerificationStatus(row).code === code)
          .map((row) => row.id)
          .sort(),
      );
    }

    // Exhaustive and disjoint: every row lands in exactly one state.
    expect([...selectedByCode.values()].flat().sort()).toEqual([...ids].sort());
  });
});

/**
 * Every combination of the fields the status reads: each text field missing as
 * null, missing as an empty string, or present; the type missing or present;
 * verified or not. Each row gets its own academy, since the empty-number rows
 * would otherwise collide on the academy's unique document number.
 */
async function seedEveryVerificationCombination() {
  const textStates = ["null", "empty", "present"] as const;
  const combinations = [];

  for (const documentType of [null, "dni"] as const) {
    for (const documentNumber of textStates) {
      for (const front of textStates) {
        for (const back of textStates) {
          for (const identityVerifiedAt of [
            null,
            new Date("2026-03-01T12:00:00Z"),
          ]) {
            combinations.push({
              documentType,
              documentNumber,
              front,
              back,
              identityVerifiedAt,
            });
          }
        }
      }
    }
  }

  return await Promise.all(
    combinations.map(async (combination, index) => {
      const academy = await createAcademyRecord({
        academyName: `Academia ${index}`,
        email: `verificacion.${index}.${crypto.randomUUID()}@example.com`,
      });

      return await createDancer(academy.id, {
        documentType: combination.documentType,
        documentNumber: toText(combination.documentNumber, `${index}`),
        documentFrontImageStorageKey: toText(combination.front, "front.jpg"),
        documentBackImageStorageKey: toText(combination.back, "back.jpg"),
        identityVerifiedAt: combination.identityVerifiedAt,
      });
    }),
  );
}

function toText(state: "null" | "empty" | "present", value: string) {
  switch (state) {
    case "null":
      return null;
    case "empty":
      return "";
    case "present":
      return value;
  }
}

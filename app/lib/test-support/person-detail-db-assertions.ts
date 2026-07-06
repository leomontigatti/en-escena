import { eq } from "drizzle-orm";
import { expect } from "vitest";

import { db } from "@/db";
import { dancers, professors } from "@/db/schema";

type PersistedDancer = {
  active?: boolean;
  birthDate?: string;
  documentBackImageStorageKey?: string | null;
  documentFrontImageStorageKey?: string | null;
  documentNumber?: string | null;
  documentType?: string | null;
  firstName?: string;
  identityVerifiedAt?: Date | null;
  lastName?: string;
};

type PersistedProfessor = {
  active?: boolean;
  documentNumber?: string | null;
  documentType?: string | null;
  firstName?: string;
  lastName?: string;
};

export function expectPersonDetailRedirect(
  response: Response,
  location: string,
) {
  expect(response.headers.get("location")).toBe(location);
}

export async function expectPersistedDancer(
  dancerId: string,
  expected: PersistedDancer,
) {
  await expect(
    db.query.dancers.findFirst({
      where: eq(dancers.id, dancerId),
    }),
  ).resolves.toMatchObject(expected);
}

export async function expectPersistedProfessor(
  professorId: string,
  expected: PersistedProfessor,
) {
  await expect(
    db.query.professors.findFirst({
      where: eq(professors.id, professorId),
    }),
  ).resolves.toMatchObject(expected);
}

import { db } from "@/db";
import { administrativeAuditEntries } from "@/db/schema";

type AuditExecutor =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ChoreographyBirthDateCorrectionAuditSnapshot = {
  sourceDancer: {
    id: string;
    firstName: string;
    lastName: string;
  };
  category: {
    id: string;
    name: string;
  } | null;
  categoryCalculationMode: "oldest" | "group_tolerance" | "group_average";
  categoryAgeBasis: number | null;
  experienceLevel: {
    id: string;
    name: string;
  } | null;
  dancerCompetitiveAge: number;
};

export async function createAdministrativeChoreographyAuditEntry(input: {
  choreographyId: string;
  eventId: string;
  adminUserId: string;
  reason: string | null;
  beforeValues: ChoreographyBirthDateCorrectionAuditSnapshot;
  afterValues: ChoreographyBirthDateCorrectionAuditSnapshot;
  executor?: AuditExecutor;
}) {
  const executor = input.executor ?? db;

  await executor.insert(administrativeAuditEntries).values({
    entityType: "choreography",
    entityId: input.choreographyId,
    eventId: input.eventId,
    adminUserId: input.adminUserId,
    action: "update",
    reason: input.reason,
    beforeValues: input.beforeValues,
    afterValues: input.afterValues,
  });
}

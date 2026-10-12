import { sql, type SQL } from "drizzle-orm";

import { dancers } from "@/db/schema";
import type { DancerVerificationStatusCode } from "@/lib/dancers/verification";

/**
 * `deriveDancerVerificationStatus` as a condition over the dancers table, for
 * the list filter. The only place the document-completeness rule is written in
 * SQL; `verification.server.db.test.ts` holds it to the derivation. Empty text
 * counts as missing, as it does there.
 */
export function buildDancerVerificationStatusSql(
  code: DancerVerificationStatusCode,
): SQL<boolean> {
  const documentComplete = sql`(
    ${dancers.documentType} is not null
    and coalesce(${dancers.documentNumber}, '') <> ''
    and coalesce(${dancers.documentFrontImageStorageKey}, '') <> ''
    and coalesce(${dancers.documentBackImageStorageKey}, '') <> ''
  )`;

  switch (code) {
    case "incomplete":
      return sql<boolean>`not ${documentComplete}`;
    case "unverified":
      return sql<boolean>`(${documentComplete} and ${dancers.identityVerifiedAt} is null)`;
    case "verified":
      return sql<boolean>`(${documentComplete} and ${dancers.identityVerifiedAt} is not null)`;
  }
}

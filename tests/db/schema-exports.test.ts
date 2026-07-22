import { describe, expect, test } from "vitest";

import * as schema from "@/db/schema";

const schemaExportNames = [
  "account",
  "accessSession",
  "academies",
  "administrativeAuditAction",
  "administrativeAuditEntries",
  "administrativeAuditEntityType",
  "categories",
  "categoryModalities",
  "allocationType",
  "categoryCalculationMode",
  "choreographyDancers",
  "choreographyProfessors",
  "choreographies",
  "comprobanteInscriptions",
  "comprobanteIssuerIvaCondition",
  "comprobantes",
  "createTable",
  "dancers",
  "documentType",
  "events",
  "eventFinancialSequences",
  "experienceLevel",
  "paymentMethod",
  "groupType",
  "internalUserInvitations",
  "modalities",
  "prices",
  "professors",
  "payments",
  "paymentAllocations",
  "scheduleCapacities",
  "scheduleModalities",
  "schedules",
  "submodalities",
  "user",
  "userRole",
  "verification",
] as const;

describe("schema export surface", () => {
  test("re-exports the full schema from the main entry point", () => {
    expect(Object.keys(schema).sort()).toEqual([...schemaExportNames].sort());
  });
});

import { describe, expect, test } from "vitest";

import * as schema from "@/db/schema";

const schemaExportNames = [
  "accessCredential",
  "accessSession",
  "academies",
  "administrativeAuditAction",
  "administrativeAuditEntries",
  "administrativeAuditEntityType",
  "categories",
  "categoryModalities",
  "invoiceType",
  "categoryCalculationMode",
  "choreographyDancers",
  "choreographyProfessors",
  "choreographies",
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
  "academyEventChoreographyInvoices",
  "academyEventInvoiceImputations",
  "academyEventPayments",
  "scheduleCapacities",
  "scheduleModalities",
  "schedules",
  "submodalities",
  "user",
  "userRole",
] as const;

describe("schema export surface", () => {
  test("re-exports the full schema from the main entry point", () => {
    expect(Object.keys(schema).sort()).toEqual([...schemaExportNames].sort());
  });
});

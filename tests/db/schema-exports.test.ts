import { describe, expect, test } from "vitest";

import * as schema from "@/db/schema";

const schemaExportNames = [
  "account",
  "accessSession",
  "academies",
  "categories",
  "categoryModalities",
  "categoryCalculationMode",
  "choreographyDancers",
  "choreographyProfessors",
  "choreographies",
  "comprobanteInscriptions",
  "comprobanteIssuerIvaCondition",
  "comprobantes",
  "criterionKind",
  "createTable",
  "dancers",
  "documentType",
  "eventDocumentKind",
  "eventDocuments",
  "events",
  "eventSequences",
  "experienceLevel",
  "paymentMethod",
  "groupType",
  "internalUserInvitations",
  "judgeAssignments",
  "modalities",
  "prices",
  "professors",
  "payments",
  "presentations",
  "paymentAllocations",
  "scoreCriterionValues",
  "scores",
  "scheduleCapacities",
  "scheduleCategories",
  "scheduleModalities",
  "schedules",
  "seminarInscriptions",
  "seminarKind",
  "seminarPrices",
  "seminars",
  "submodalities",
  "submodalityCriteria",
  "user",
  "userRole",
  "uuidPrimaryKey",
  "verification",
] as const;

describe("schema export surface", () => {
  test("re-exports the full schema from the main entry point", () => {
    expect(Object.keys(schema).sort()).toEqual([...schemaExportNames].sort());
  });
});

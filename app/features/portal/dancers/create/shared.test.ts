import { describe, expect, test } from "vitest";

import { expectSharedBirthDateRules } from "@/lib/test-support/dancer-birth-date-schema";

import { buildCreateDancerSchema } from "./shared";

describe("portal dancer create schema", () => {
  test("applies the shared birth-date rules", () => {
    expectSharedBirthDateRules({
      buildSchema: buildCreateDancerSchema,
      values: {
        firstName: "Ana",
        lastName: "Paz",
        documentType: "",
        documentNumber: "",
      },
    });
  });

  test("accepts a dancer without a document", () => {
    expect(parse({ documentType: "", documentNumber: "" }).success).toBe(true);
  });

  test("refuses half a document pair", () => {
    expect(
      parse({ documentType: "", documentNumber: "30111222" }).error?.issues,
    ).toMatchObject([
      { message: "Seleccioná el tipo de documento.", path: ["documentType"] },
    ]);
    expect(
      parse({ documentType: "dni", documentNumber: "" }).error?.issues,
    ).toMatchObject([
      { message: "Ingresá el número de documento.", path: ["documentNumber"] },
    ]);
  });
});

function parse(document: { documentType: string; documentNumber: string }) {
  return buildCreateDancerSchema(null).safeParse({
    firstName: "Ana",
    lastName: "Paz",
    birthDate: "2014-01-01",
    ...document,
  });
}

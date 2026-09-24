import { describe, expect, test } from "vitest";

import { createProfessorSchema } from "./shared";

describe("portal professor create schema", () => {
  test("accepts a professor without a document", () => {
    expect(parse({ documentType: "", documentNumber: "" }).success).toBe(true);
  });

  test("refuses half a document pair", () => {
    expect(
      parse({ documentType: "", documentNumber: "30111222" }).error?.issues,
    ).toMatchObject([
      {
        message: "Seleccion\u00e1 el tipo de documento.",
        path: ["documentType"],
      },
    ]);
    expect(
      parse({ documentType: "dni", documentNumber: "" }).error?.issues,
    ).toMatchObject([
      {
        message: "Ingres\u00e1 el n\u00famero de documento.",
        path: ["documentNumber"],
      },
    ]);
  });
});

function parse(document: { documentType: string; documentNumber: string }) {
  return createProfessorSchema.safeParse({
    firstName: "Ana",
    lastName: "Paz",
    ...document,
  });
}

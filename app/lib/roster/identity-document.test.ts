import { describe, expect, test } from "vitest";

import { buildDancerUpdateSchema } from "@/features/admin/dancers/detail/shared";
import { buildProfessorEditSchema } from "@/features/admin/professors/detail/shared";
import { buildPortalDancerSchema } from "@/features/portal/dancers/detail/shared";
import { professorSchema } from "@/features/portal/professors/detail/shared";

import {
  formatIdentityDocument,
  hasIdentityDocument,
  normalizeIdentityDocument,
  toDocumentNumberSearchTerm,
} from "./identity-document";

describe("normalizeIdentityDocument", () => {
  test("reads an empty pair as no document", () => {
    expect(normalizeIdentityDocument(" ", "")).toEqual({
      ok: true,
      documentType: null,
      documentNumber: null,
    });
  });

  test.each([
    { input: ["dni", "12.345.678"], stored: "12345678" },
    { input: ["dni", " 12 345-678 "], stored: "12345678" },
    { input: ["passport", " AB  123 "], stored: "AB 123" },
    { input: ["other", "X-1  2"], stored: "X-1 2" },
  ])("stores $input as $stored", ({ input: [type, number], stored }) => {
    expect(normalizeIdentityDocument(type, number)).toEqual({
      ok: true,
      documentType: type,
      documentNumber: stored,
    });
  });

  test.each([
    {
      input: ["", "30111222"],
      fieldErrors: { documentType: "Seleccioná el tipo de documento." },
    },
    {
      input: ["dni", ""],
      fieldErrors: { documentNumber: "Ingresá el número de documento." },
    },
    {
      input: ["cedula", "30111222"],
      fieldErrors: { documentType: "Seleccioná un tipo de documento válido." },
    },
    {
      input: ["dni", "30A11222"],
      fieldErrors: {
        documentNumber: "Ingresá un DNI válido usando solo números.",
      },
    },
  ])("refuses $input", ({ input: [type, number], fieldErrors }) => {
    expect(normalizeIdentityDocument(type, number)).toEqual({
      ok: false,
      fieldErrors,
    });
  });
});

// #735: the professor forms checked only that the pair was whole, so a DNI with
// letters reached the server before the academy heard about it.
describe("every roster person form refuses what the server refuses", () => {
  const forms = {
    "portal dancer": (document: DocumentValues) =>
      buildPortalDancerSchema(null).safeParse(dancerValues(document)),
    "admin dancer": (document: DocumentValues) =>
      buildDancerUpdateSchema(null).safeParse(dancerValues(document)),
    "portal professor": (document: DocumentValues) =>
      professorSchema.safeParse(professorValues(document)),
    "admin professor": (document: DocumentValues) =>
      buildProfessorEditSchema().safeParse(professorValues(document)),
  };

  test.each([
    { documentType: "", documentNumber: "30111222" },
    { documentType: "dni", documentNumber: "" },
    { documentType: "cedula", documentNumber: "30111222" },
    { documentType: "dni", documentNumber: "30A11222" },
  ])("$documentType/$documentNumber", (document) => {
    const server = normalizeIdentityDocument(
      document.documentType,
      document.documentNumber,
    );

    if (server.ok) {
      throw new Error("The server accepts this document.");
    }

    for (const parse of Object.values(forms)) {
      expect(fieldErrors(parse(document))).toEqual(server.fieldErrors);
    }
  });

  test("accepts a formatted DNI", () => {
    for (const parse of Object.values(forms)) {
      expect(
        fieldErrors(
          parse({ documentType: "dni", documentNumber: "12.345.678" }),
        ),
      ).toEqual({});
    }
  });
});

describe("hasIdentityDocument", () => {
  test.each([
    { documentType: "dni", documentNumber: "1", loaded: true },
    { documentType: "dni", documentNumber: null, loaded: false },
    { documentType: null, documentNumber: "1", loaded: false },
    { documentType: "dni", documentNumber: "", loaded: false },
  ] as const)(
    "$documentType/$documentNumber is loaded: $loaded",
    ({ loaded, ...document }) => {
      expect(hasIdentityDocument(document)).toBe(loaded);
    },
  );
});

describe("formatIdentityDocument", () => {
  test("prints the type's label before the number", () => {
    expect(
      formatIdentityDocument({
        documentType: "passport",
        documentNumber: "AB 123",
      }),
    ).toBe("Pasaporte AB 123");
  });

  test("prints nothing for a half-loaded document", () => {
    expect(
      formatIdentityDocument({ documentType: "dni", documentNumber: null }),
    ).toBeNull();
  });
});

describe("toDocumentNumberSearchTerm", () => {
  test.each([
    { search: "12.345.678", term: "12345678" },
    { search: " 12 345-678 ", term: "12345678" },
  ])("reads $search as $term", ({ search, term }) => {
    expect(toDocumentNumberSearchTerm(search)).toBe(term);
  });

  test.each(["Ana Paz", "AB 123", ""])(
    "leaves %j to the plain search",
    (search) => {
      expect(toDocumentNumberSearchTerm(search)).toBeNull();
    },
  );
});

type DocumentValues = { documentType: string; documentNumber: string };

function dancerValues(document: DocumentValues) {
  return {
    firstName: "Ana",
    lastName: "Paz",
    birthDate: "2014-01-01",
    documentFrontImageStorageKey: "",
    documentBackImageStorageKey: "",
    ...document,
  };
}

function professorValues(document: DocumentValues) {
  return { firstName: "Ana", lastName: "Paz", ...document };
}

function fieldErrors(result: {
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) {
  return Object.fromEntries(
    (result.error?.issues ?? []).map((issue) => [
      String(issue.path[0]),
      issue.message,
    ]),
  );
}

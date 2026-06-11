import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { dancers } from "@/db/schema";

export type DancerListItem = {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  documentType: string | null;
  documentNumber: string | null;
  verificationStatus: "incomplete" | "missingImages";
};

export type CreateDancerInput = {
  firstName: string;
  lastName: string;
  birthDate: string;
};

export type CreateDancerResult =
  | { ok: true; dancer: typeof dancers.$inferSelect }
  | {
      ok: false;
      error: string;
      fieldErrors: Partial<Record<keyof CreateDancerInput, string>>;
      values: CreateDancerInput;
    };

const spanishParticles = new Set(["de", "del", "la", "las", "los", "y"]);

export async function listDancersForAcademy(
  academyId: string,
): Promise<DancerListItem[]> {
  const rows = await db.query.dancers.findMany({
    where: eq(dancers.academyId, academyId),
    orderBy: [asc(dancers.lastName), asc(dancers.firstName)],
  });

  return rows.map((dancer) => ({
    id: dancer.id,
    firstName: dancer.firstName,
    lastName: dancer.lastName,
    birthDate: dancer.birthDate,
    documentType: dancer.documentType,
    documentNumber: dancer.documentNumber,
    verificationStatus:
      dancer.documentType && dancer.documentNumber
        ? "missingImages"
        : "incomplete",
  }));
}

export async function createDancerForAcademy(
  academyId: string,
  input: CreateDancerInput,
): Promise<CreateDancerResult> {
  const validation = validateCreateDancerInput(input);

  if (!validation.ok) {
    return validation;
  }

  const [dancer] = await db
    .insert(dancers)
    .values({
      academyId,
      firstName: validation.input.firstName,
      lastName: validation.input.lastName,
      birthDate: validation.input.birthDate,
    })
    .returning();

  return { ok: true, dancer };
}

export async function findDancerForAcademy(
  academyId: string,
  dancerId: string,
) {
  return await db.query.dancers.findFirst({
    where: and(eq(dancers.id, dancerId), eq(dancers.academyId, academyId)),
  });
}

function validateCreateDancerInput(
  input: CreateDancerInput,
):
  | { ok: true; input: CreateDancerInput }
  | Extract<CreateDancerResult, { ok: false }> {
  const values = {
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    birthDate: input.birthDate.trim(),
  };
  const fieldErrors: Partial<Record<keyof CreateDancerInput, string>> = {};

  if (!values.firstName) {
    fieldErrors.firstName = "Ingresá el nombre.";
  }

  if (!values.lastName) {
    fieldErrors.lastName = "Ingresá el apellido.";
  }

  if (!values.birthDate) {
    fieldErrors.birthDate = "Ingresá la fecha de nacimiento.";
  } else if (!isDateOnly(values.birthDate)) {
    fieldErrors.birthDate = "Usá una fecha válida.";
  } else if (isFutureDateOnly(values.birthDate)) {
    fieldErrors.birthDate = "La fecha de nacimiento no puede ser futura.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      error: "Revisá los datos del Bailarín.",
      fieldErrors,
      values,
    };
  }

  return {
    ok: true,
    input: {
      firstName: toSpanishTitleCase(values.firstName),
      lastName: toSpanishTitleCase(values.lastName),
      birthDate: values.birthDate,
    },
  };
}

export function toSpanishTitleCase(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word, index) => {
      const lower = word.toLocaleLowerCase("es-AR");

      if (index > 0 && spanishParticles.has(lower)) {
        return lower;
      }

      return lower.charAt(0).toLocaleUpperCase("es-AR") + lower.slice(1);
    })
    .join(" ");
}

function isDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  return parsed.toISOString().slice(0, 10) === value;
}

function isFutureDateOnly(value: string) {
  const today = new Date().toISOString().slice(0, 10);

  return value > today;
}

import { z } from "zod";

import {
  normalizeIdentityDocument,
  refineIdentityDocument,
  type IdentityDocumentType,
} from "@/lib/roster/identity-document";
import { argentinePhoneField } from "@/lib/shared/argentine-phone";
import { getFieldErrors } from "@/lib/shared/form-validation";
import { toPersonLastName, toPersonName } from "@/lib/shared/person-name";
import { contentTextField } from "@/lib/shared/text-content";

/**
 * The personal data of an `individual` (`Particular`): who the person is and
 * how to reach them. Onboarding asks for it and `Mis datos` edits it, through
 * this one schema, so both refuse and store the same. Unlike a roster person,
 * the document is required: it is what the link to academy rosters matches on
 * (ADR-0019).
 */
export const individualPersonalDataSchema = z
  .object({
    firstName: contentTextField(),
    lastName: contentTextField(),
    documentType: z.string().trim().min(1, "Seleccioná el tipo de documento."),
    documentNumber: z.string().trim().min(1, "Ingresá el número de documento."),
    phone: argentinePhoneField(),
  })
  .superRefine(refineIdentityDocument);

const individualPersonalDataFields = [
  "firstName",
  "lastName",
  "documentType",
  "documentNumber",
  "phone",
] as const;

export type IndividualPersonalDataField =
  (typeof individualPersonalDataFields)[number];

/** As the form holds them, and as an action reads them back. */
export type IndividualPersonalDataValues = Record<
  IndividualPersonalDataField,
  string
>;

export type IndividualPersonalData = {
  firstName: string;
  lastName: string;
  documentType: IdentityDocumentType;
  documentNumber: string;
  phone: string;
};

export type IndividualPersonalDataFieldErrors = Partial<
  Record<IndividualPersonalDataField, string>
>;

export const emptyIndividualPersonalDataValues: IndividualPersonalDataValues = {
  firstName: "",
  lastName: "",
  documentType: "",
  documentNumber: "",
  phone: "",
};

/** The form's fields as an action reads them, each empty when missing. */
export function readIndividualPersonalDataValues(
  formData: FormData,
): IndividualPersonalDataValues {
  const read = (field: IndividualPersonalDataField) => {
    const value = formData.get(field);

    return typeof value === "string" ? value : "";
  };

  return {
    firstName: read("firstName"),
    lastName: read("lastName"),
    documentType: read("documentType"),
    documentNumber: read("documentNumber"),
    phone: read("phone"),
  };
}

/**
 * The values as they are stored: names written the Spanish way, the document
 * normalized (a DNI loses its dots and spaces), or the field errors.
 */
export function parseIndividualPersonalData(
  values: IndividualPersonalDataValues,
):
  | { ok: true; data: IndividualPersonalData }
  | { ok: false; fieldErrors: IndividualPersonalDataFieldErrors } {
  const parsed = individualPersonalDataSchema.safeParse(values);

  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: getFieldErrors(parsed.error, individualPersonalDataFields),
    };
  }

  const document = normalizeIdentityDocument(
    parsed.data.documentType,
    parsed.data.documentNumber,
  );

  // The schema already refused an empty or a malformed document.
  if (!document.ok || document.documentType === null) {
    throw new Error("The personal data schema let an invalid document pass.");
  }

  return {
    ok: true,
    data: {
      firstName: toPersonName(parsed.data.firstName),
      lastName: toPersonLastName(parsed.data.lastName),
      documentType: document.documentType,
      documentNumber: document.documentNumber,
      phone: parsed.data.phone,
    },
  };
}

/** The name the owner row carries as its `name` and its `contactName`. */
export function toIndividualFullName(person: {
  firstName: string;
  lastName: string;
}) {
  return `${person.firstName} ${person.lastName}`;
}

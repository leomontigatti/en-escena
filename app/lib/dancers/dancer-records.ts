import { isDateOnly, isFutureDateOnly } from "@/lib/shared/date-only";
import { toPersonLastName, toPersonName } from "@/lib/shared/person-name";

export type DancerNameInput = {
  firstName: string;
  lastName: string;
  birthDate: string;
};

export function normalizeDancerValues(
  input: DancerNameInput,
  options: {
    fieldErrors?: Partial<Record<keyof DancerNameInput, string>>;
    lowercaseLeadingLastNameParticle?: boolean;
  } = {},
) {
  const firstName = toPersonName(input.firstName);
  const lastName =
    (options.lowercaseLeadingLastNameParticle ?? true)
      ? toPersonLastName(input.lastName)
      : toPersonName(input.lastName);
  const birthDate = input.birthDate.trim();
  const fieldErrors: Partial<Record<keyof DancerNameInput, string>> = {};

  if (!firstName) {
    fieldErrors.firstName =
      options.fieldErrors?.firstName ?? "Ingresá el nombre del Bailarín.";
  }

  if (!lastName) {
    fieldErrors.lastName =
      options.fieldErrors?.lastName ?? "Ingresá el apellido del Bailarín.";
  }

  if (!birthDate) {
    fieldErrors.birthDate =
      options.fieldErrors?.birthDate ?? "Ingresá la fecha de nacimiento.";
  } else if (!isDateOnly(birthDate)) {
    fieldErrors.birthDate = "Usá una fecha válida.";
  } else if (isFutureDateOnly(birthDate)) {
    fieldErrors.birthDate = "La fecha de nacimiento no puede ser futura.";
  }

  return { firstName, lastName, birthDate, fieldErrors };
}

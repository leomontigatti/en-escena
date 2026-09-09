import { z } from "zod";

import type { FieldErrors } from "@/lib/shared/form-validation";
import { requiredFieldMessage } from "@/lib/shared/forms";
import type {
  SeminarFieldName,
  SeminarListItem,
} from "@/lib/seminars/repository.server";

export const basePath = "/administracion/seminarios";

export const createSeminarIntent = "create-seminar";
export const updateSeminarIntent = "update-seminar";
export const deleteSeminarIntent = "delete-seminar";

// The form's fields are the row's, so the repository owns the name of each and
// this list only fixes the order the refusals are read back in.
export const seminarFieldNames: readonly SeminarFieldName[] = [
  "instructorName",
  "scheduledDate",
  "startTime",
  "quota",
];

export const seminarFormSchema = z.object({
  instructorName: z.string().trim().min(1, requiredFieldMessage),
  scheduledDate: z.string().trim().min(1, requiredFieldMessage),
  startTime: z.string().trim().min(1, requiredFieldMessage),
  quota: z
    .string()
    .trim()
    .min(1, requiredFieldMessage)
    .refine(isPositiveIntegerString, "Ingresá un cupo mayor a cero."),
});

export type SeminarFormValues = z.infer<typeof seminarFormSchema>;

export type SeminarActionData = {
  fieldErrors?: FieldErrors<SeminarFieldName>;
  intent: string;
  message: string;
  status: "error" | "success";
  values?: SeminarFormValues;
};

export type SeminarsListLoaderData = {
  selectedEventId: string | null;
  seminars: SeminarListItem[];
};

export type SeminarCreateLoaderData = {
  selectedEventId: string | null;
  values: SeminarFormValues;
};

export type SeminarDetailLoaderData = {
  selectedEventId: string | null;
  seminar: SeminarListItem;
  values: SeminarFormValues;
};

export function defaultSeminarFormValues(): SeminarFormValues {
  return {
    instructorName: "",
    scheduledDate: "",
    startTime: "",
    quota: "",
  };
}

export function toSeminarFormValues(
  seminar: Pick<
    SeminarListItem,
    "instructorName" | "quota" | "scheduledDate" | "startTime"
  >,
): SeminarFormValues {
  return {
    instructorName: seminar.instructorName,
    scheduledDate: seminar.scheduledDate,
    startTime: seminar.startTime,
    quota: seminar.quota.toString(),
  };
}

export function readSeminarFormValues(formData: FormData): SeminarFormValues {
  return {
    instructorName: String(formData.get("instructorName") ?? "").trim(),
    scheduledDate: String(formData.get("scheduledDate") ?? "").trim(),
    startTime: String(formData.get("startTime") ?? "").trim(),
    quota: String(formData.get("quota") ?? "").trim(),
  };
}

function isPositiveIntegerString(value: string) {
  const parsedValue = Number(value);

  return Number.isInteger(parsedValue) && parsedValue > 0;
}

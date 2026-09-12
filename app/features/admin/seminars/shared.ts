import { z } from "zod";

import { isPositiveIntegerString } from "@/features/admin/schedules/view-shared";
import {
  DEFAULT_SEMINAR_DEPOSIT_PERCENTAGE,
  invalidSeminarDepositPercentageMessage,
  isValidSeminarDepositPercentage,
} from "@/lib/seminars/deposit-percentage";
import {
  defaultSeminarKind,
  isSeminarKind,
  seminarKindValues,
  type SeminarKind,
} from "@/lib/seminars/seminar-kinds";
import type { FieldErrors } from "@/lib/shared/form-validation";
import { requiredFieldMessage } from "@/lib/shared/forms";
import type { SeminarInscriptionRow } from "@/lib/seminars/inscriptions.server";
import type {
  SeminarFieldName,
  SeminarListItem,
} from "@/lib/seminars/repository.server";

export const basePath = "/administracion/seminarios";

export const createSeminarIntent = "create-seminar";
export const updateSeminarIntent = "update-seminar";
export const deleteSeminarIntent = "delete-seminar";
export const deleteSeminarInscriptionIntent = "delete-seminar-inscription";

/**
 * The picture rides on the seminar's own form, as the event's PDFs ride on the
 * event's: a single save writes the instructor, the date, the time, the quota
 * and the picture together. These names are what tie the two halves.
 *
 * The "present" marker is included on purpose. A body that does not carry the
 * picture fields is not "the picture was removed" — it is a submission that
 * never had them, and the costly way to be wrong is the one that deletes.
 */
export const seminarPictureFileField = "instructorPictureFile";
export const seminarPictureKeptField = "instructorPictureKept";
export const seminarPicturePresentField = "instructorPicturePresent";
export const keptSeminarPictureValue = "kept";

// The form's fields are the row's, so the repository owns the name of each and
// this list only fixes the order the refusals are read back in.
export const seminarFieldNames: readonly SeminarFieldName[] = [
  "instructorName",
  "scheduledDate",
  "startTime",
  "quota",
  "kind",
  "requiredDepositPercentage",
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
  kind: z.enum(seminarKindValues),
  requiredDepositPercentage: z
    .string()
    .trim()
    .min(1, requiredFieldMessage)
    .refine(
      (value) => isValidSeminarDepositPercentage(Number(value)),
      invalidSeminarDepositPercentageMessage,
    ),
  // Whether the stored picture is still wanted, never the storage key itself:
  // the upload field empties this when its remove button is pressed, and the
  // save deletes the object. The browser never learns the real key.
  [seminarPictureKeptField]: z.enum(["", keptSeminarPictureValue]),
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
  /**
   * Whether an inscription of this seminar has already covered its deposit, in
   * which case the kind and the deposit rate are read-only: the refusal shows
   * on sight rather than after the save. Always `false` until seminar money
   * exists (`app/lib/seminars/covered-inscriptions.server.ts`).
   */
  hasCoveredInscription: boolean;
  /** Everyone registered, whichever academy registered them. */
  inscriptions: SeminarInscriptionRow[];
  /** A signed link to the stored picture, or `null` when there is none. */
  instructorPictureUrl: string | null;
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
    kind: defaultSeminarKind,
    requiredDepositPercentage: DEFAULT_SEMINAR_DEPOSIT_PERCENTAGE.toString(),
    [seminarPictureKeptField]: "",
  };
}

export function toSeminarFormValues(
  seminar: Pick<
    SeminarListItem,
    | "instructorName"
    | "instructorPictureStorageKey"
    | "kind"
    | "quota"
    | "requiredDepositPercentage"
    | "scheduledDate"
    | "startTime"
  >,
): SeminarFormValues {
  return {
    instructorName: seminar.instructorName,
    scheduledDate: seminar.scheduledDate,
    startTime: seminar.startTime,
    quota: seminar.quota.toString(),
    kind: seminar.kind,
    requiredDepositPercentage: seminar.requiredDepositPercentage.toString(),
    [seminarPictureKeptField]: seminar.instructorPictureStorageKey
      ? keptSeminarPictureValue
      : "",
  };
}

export function readSeminarFormValues(formData: FormData): SeminarFormValues {
  return {
    instructorName: String(formData.get("instructorName") ?? "").trim(),
    scheduledDate: String(formData.get("scheduledDate") ?? "").trim(),
    startTime: String(formData.get("startTime") ?? "").trim(),
    quota: String(formData.get("quota") ?? "").trim(),
    kind: readSeminarKind(formData.get("kind")),
    requiredDepositPercentage: String(
      formData.get("requiredDepositPercentage") ?? "",
    ).trim(),
    [seminarPictureKeptField]:
      formData.get(seminarPictureKeptField) === keptSeminarPictureValue
        ? keptSeminarPictureValue
        : "",
  };
}

/**
 * The kind is a closed set, so an unreadable value falls back to the default
 * rather than reaching the schema as a free string.
 */
function readSeminarKind(value: FormDataEntryValue | null): SeminarKind {
  const kind = String(value ?? "").trim();

  return isSeminarKind(kind) ? kind : defaultSeminarKind;
}

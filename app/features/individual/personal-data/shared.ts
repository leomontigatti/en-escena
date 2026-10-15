import { z } from "zod";

import {
  individualPersonalDataSchema,
  type IndividualPersonalDataFieldErrors,
} from "@/lib/individuals/personal-data";

// The document photo rides on the `Perfil` form. The file input carries a
// picked photo; the key field carries the stored one, empty once the
// individual removed it. A body without the key field leaves the photo alone.
export const documentPhotoFileField = "documentPhoto";
export const documentPhotoStorageKeyField = "documentPhotoStorageKey";

export const profileFormSchema = z.intersection(
  individualPersonalDataSchema,
  z.object({ [documentPhotoStorageKeyField]: z.string() }),
);

export type ProfileFormValues = z.input<typeof profileFormSchema>;

export type IndividualPersonalDataActionData =
  | { status: "success"; message: string }
  | {
      status: "error";
      message: string;
      fieldErrors: IndividualPersonalDataFieldErrors;
      values: ProfileFormValues;
    };

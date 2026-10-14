import { z } from "zod";

import {
  individualPersonalDataSchema,
  type IndividualPersonalDataFieldErrors,
} from "@/lib/individuals/personal-data";

// The document photo rides on the `Mis datos` form. The file input carries a
// picked photo; the key field carries the stored one, empty once the
// individual removed it. A body without the key field leaves the photo alone.
export const documentPhotoFileField = "documentPhoto";
export const documentPhotoStorageKeyField = "documentPhotoStorageKey";

export const misDatosFormSchema = z.intersection(
  individualPersonalDataSchema,
  z.object({ [documentPhotoStorageKeyField]: z.string() }),
);

export type MisDatosFormValues = z.input<typeof misDatosFormSchema>;

export type IndividualPersonalDataActionData =
  | { status: "success"; message: string }
  | {
      status: "error";
      message: string;
      fieldErrors: IndividualPersonalDataFieldErrors;
      values: MisDatosFormValues;
    };

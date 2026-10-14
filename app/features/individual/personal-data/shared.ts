import type {
  IndividualPersonalDataFieldErrors,
  IndividualPersonalDataValues,
} from "@/lib/individuals/personal-data";

export type IndividualPersonalDataActionData =
  | { status: "success"; message: string }
  | {
      status: "error";
      message: string;
      fieldErrors: IndividualPersonalDataFieldErrors;
      values: IndividualPersonalDataValues;
    };

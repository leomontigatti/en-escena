import type {
  EventFormValues,
  FieldErrors,
} from "@/lib/admin/events/form-values";

export type AdministrativeEventCreateActionData = {
  status: "error";
  message: string;
  fieldErrors: FieldErrors;
  values: EventFormValues;
};

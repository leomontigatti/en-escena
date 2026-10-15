import type { IndividualPersonalDataValues } from "@/lib/individuals/personal-data";

export type IndividualOnboardingActionData = {
  message: string;
  status: "error";
  values: IndividualPersonalDataValues;
};

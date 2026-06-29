import { z } from "zod";

import {
  MAX_REQUIRED_DEPOSIT_PERCENTAGE,
  MIN_REQUIRED_DEPOSIT_PERCENTAGE,
  invalidRequiredDepositPercentageMessage,
} from "@/lib/events/deposit-percentage";

export const depositPercentageFormSchema = z.object({
  requiredDepositPercentage: z.string().refine((value) => {
    const percentage = Number(value);

    return (
      value.trim().length > 0 &&
      Number.isInteger(percentage) &&
      percentage >= MIN_REQUIRED_DEPOSIT_PERCENTAGE &&
      percentage <= MAX_REQUIRED_DEPOSIT_PERCENTAGE
    );
  }, invalidRequiredDepositPercentageMessage),
});

export type DepositPercentageFormValues = z.infer<
  typeof depositPercentageFormSchema
>;

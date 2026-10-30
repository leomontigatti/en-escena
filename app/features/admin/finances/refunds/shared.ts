import type { CreatePaymentFormValues } from "@/features/admin/payments/create/shared";

export const updateRefundIntent = "update-refund";
export const deleteRefundIntent = "delete-refund";

type UpdateRefundActionData =
  | {
      fieldErrors: Partial<Record<keyof CreatePaymentFormValues, string>>;
      intent: typeof updateRefundIntent;
      message: string;
      status: "error";
      /**
       * What the form sent, to keep on screen, and the version it was written
       * against. Left out when the refund changed meanwhile: the form then
       * takes what the loader revalidates, so a retry cannot save stale values
       * under the new version. The form also drops them when the version it
       * revalidated differs, for a write that landed after this refusal.
       */
      values?: CreatePaymentFormValues;
      version?: string;
    }
  | {
      intent: typeof updateRefundIntent;
      message: string;
      status: "success";
    };

type DeleteRefundActionData = {
  intent: typeof deleteRefundIntent;
  message: string;
  status: "error";
};

export type RefundDetailActionData =
  DeleteRefundActionData | UpdateRefundActionData;

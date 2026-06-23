import { useEffect } from "react";
import { toast } from "sonner";

export type ToastVariant = "success" | "error" | "info" | "warning";

export type ToastMessage = {
  id?: string;
  message: string;
  variant: ToastVariant;
};

type ServerActionToast = {
  message: string;
  status: ToastVariant;
};

export function showToastMessage({ id, message, variant }: ToastMessage) {
  switch (variant) {
    case "success":
      toast.success(message, { id });
      return;
    case "error":
      toast.error(message, { id });
      return;
    case "info":
      toast.info(message, { id });
      return;
    case "warning":
      toast.warning(message, { id });
      return;
  }
}

export function useServerActionToast(
  actionData?: ServerActionToast | null,
  options?: {
    toastId?: string;
  },
) {
  const toastId = options?.toastId;

  useEffect(() => {
    if (!actionData) {
      return;
    }

    window.setTimeout(() => {
      showToastMessage({
        id: toastId,
        message: actionData.message,
        variant: actionData.status,
      });
    }, 0);
  }, [actionData, toastId]);
}

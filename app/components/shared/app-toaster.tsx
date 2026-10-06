import { Toaster } from "sonner";

import { alertVariantIcons } from "@/components/shared/alert-icons";

const {
  destructive: ErrorIcon,
  info: InfoIcon,
  success: SuccessIcon,
  warning: WarningIcon,
} = alertVariantIcons;

/**
 * The app's one `Toaster`. A toast draws the icon of the `Alert` of the same
 * kind (style guide → Toasts), so a refusal reads the same whether it arrives
 * as a toast or sits on the screen as an alert.
 */
const toastIcons = {
  error: <ErrorIcon aria-hidden="true" className="size-4" />,
  info: <InfoIcon aria-hidden="true" className="size-4" />,
  success: <SuccessIcon aria-hidden="true" className="size-4" />,
  warning: <WarningIcon aria-hidden="true" className="size-4" />,
};

export function AppToaster() {
  return <Toaster icons={toastIcons} position="top-center" richColors />;
}

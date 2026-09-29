import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";

/**
 * The one icon each `Alert` variant draws (style guide → Alert icons), for the
 * alerts that choose their variant at run time.
 */
export const alertVariantIcons = {
  destructive: CircleAlert,
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
} as const;

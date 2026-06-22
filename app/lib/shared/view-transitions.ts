import type { CSSProperties } from "react";

export const portalRecordTitleViewTransitionName = "portal-record-title";

export function getPortalRecordTitleViewTransitionStyle(
  isTransitioning: boolean,
): CSSProperties {
  return {
    viewTransitionName: isTransitioning
      ? portalRecordTitleViewTransitionName
      : "none",
  };
}

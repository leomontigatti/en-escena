import type { CSSProperties } from "react";
import { useViewTransitionState } from "react-router";

const portalRecordTitleViewTransitionName = "portal-record-title";

function getPortalRecordTitleViewTransitionStyle(
  isTransitioning: boolean,
): CSSProperties {
  return {
    viewTransitionName: isTransitioning
      ? portalRecordTitleViewTransitionName
      : "none",
  };
}

export function usePortalRecordTitleLinkTransitionStyle(
  href: string,
): CSSProperties {
  return getPortalRecordTitleViewTransitionStyle(useViewTransitionState(href));
}

export function usePortalRecordTitleDetailTransitionStyle({
  detailHref,
  listHref,
}: {
  detailHref: string;
  listHref: string;
}): CSSProperties {
  const isDetailTransitioning = useViewTransitionState(detailHref);
  const isListTransitioning = useViewTransitionState(listHref);

  return getPortalRecordTitleViewTransitionStyle(
    isDetailTransitioning || isListTransitioning,
  );
}

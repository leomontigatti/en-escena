import type { CSSProperties } from "react";
import { useViewTransitionState } from "react-router";

const recordTitleViewTransitionName = "record-title";

function getRecordTitleViewTransitionStyle(
  isTransitioning: boolean,
): CSSProperties {
  return {
    viewTransitionName: isTransitioning
      ? recordTitleViewTransitionName
      : "none",
  };
}

export function useRecordTitleLinkTransitionStyle(href: string): CSSProperties {
  return getRecordTitleViewTransitionStyle(useViewTransitionState(href));
}

export function useRecordTitleDetailTransitionStyle({
  detailHref,
  listHref,
}: {
  detailHref: string;
  listHref: string;
}): CSSProperties {
  const isDetailTransitioning = useViewTransitionState(detailHref);
  const isListTransitioning = useViewTransitionState(listHref);

  return getRecordTitleViewTransitionStyle(
    isDetailTransitioning || isListTransitioning,
  );
}

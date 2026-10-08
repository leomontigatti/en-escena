import { useLocation, useViewTransitionState, type To } from "react-router";

/**
 * The record title is the app's one view transition between pages: a record's
 * name morphs from its row in a list into the title of its detail page, and
 * back. Each end marks itself with `data-record-title` while a navigation
 * touches it, and `app/app.css` names what is marked `record-title`.
 *
 * Only the row whose link is the navigation's target is marked, so a frame
 * holds one link. A page title is marked only on a page its row's link opened,
 * which the link records in the location's state: a list's own title, or the
 * title of a page opened any other way, never pairs with another title. A
 * marked page title still yields to a marked link on its own page, as a detail
 * page can hold rows of other records.
 *
 * Shared by `DataTableLink`, the pages' headers and nothing else.
 */
const openedAsRecordTitle = "recordTitle";

export function useRecordTitleLink(to: To) {
  return {
    "data-record-title": useViewTransitionState(to) || undefined,
    state: { [openedAsRecordTitle]: true },
    viewTransition: true,
  };
}

export function useRecordTitleHeading() {
  const location = useLocation();
  const isTransitioning = useViewTransitionState(location.pathname);
  const wasOpenedAsRecord =
    typeof location.state === "object" &&
    location.state !== null &&
    openedAsRecordTitle in location.state;

  return {
    "data-record-title": (isTransitioning && wasOpenedAsRecord) || undefined,
  };
}

import { useViewTransitionState, type To } from "react-router";

/**
 * The record title is the app's one view transition between pages: a record's
 * name morphs from its row in a list into the title of its detail page, and
 * back. Each end marks itself with `data-record-title` while a navigation
 * touches `to`, and `app/app.css` names what is marked `record-title`. Only the
 * row whose link is the navigation's target is marked, so a frame holds one;
 * a page title yields to a marked link on its own page, so a list's title
 * stays out of it.
 *
 * Shared by `DataTableLink`, the pages' headers and nothing else.
 */
export function useRecordTitleAttribute(to: To) {
  return {
    "data-record-title": useViewTransitionState(to) || undefined,
  };
}

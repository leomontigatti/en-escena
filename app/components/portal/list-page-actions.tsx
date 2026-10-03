import { Plus } from "lucide-react";
import { Link } from "react-router";

import { PortalEventDocumentDownloads } from "@/components/portal/event-document-downloads";
import { Button } from "@/components/ui/button";
import type {
  EventDocumentDownloadUrls,
  EventDocumentKind,
} from "@/lib/events/event-documents";

/**
 * The header of a portal list: the downloads of the event documents this list
 * is the right place for, and beside them the button that creates a record.
 * Both lists that carry documents render the same pair, so the pairing lives
 * here instead of in each view. It wraps, so a narrow screen stacks the two
 * instead of squeezing their labels.
 */
export function PortalListPageActions({
  create,
  createLabel,
  documentDownloadUrls,
  kinds,
}: {
  /** A page to go to (`to`), or a dialog to open (`onClick`). */
  create: { to: string } | { onClick: () => void };
  createLabel: string;
  documentDownloadUrls: EventDocumentDownloadUrls;
  kinds: readonly EventDocumentKind[];
}) {
  const content = (
    <>
      <Plus aria-hidden="true" data-icon="inline-start" />
      {createLabel}
    </>
  );

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <PortalEventDocumentDownloads
        documentDownloadUrls={documentDownloadUrls}
        kinds={kinds}
      />
      {"to" in create ? (
        <Button asChild>
          <Link to={create.to}>{content}</Link>
        </Button>
      ) : (
        <Button type="button" onClick={create.onClick}>
          {content}
        </Button>
      )}
    </div>
  );
}

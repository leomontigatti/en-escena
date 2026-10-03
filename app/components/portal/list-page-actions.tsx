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
 * is the right place for, and beside them the link to the page that creates a
 * record.
 * Both lists that carry documents render the same pair, so the pairing lives
 * here instead of in each view. It wraps, so a narrow screen stacks the two
 * instead of squeezing their labels.
 */
export function PortalListPageActions({
  createLabel,
  createTo,
  documentDownloadUrls,
  kinds,
}: {
  createLabel: string;
  /** The page that creates the record. */
  createTo: string;
  documentDownloadUrls: EventDocumentDownloadUrls;
  kinds: readonly EventDocumentKind[];
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <PortalEventDocumentDownloads
        documentDownloadUrls={documentDownloadUrls}
        kinds={kinds}
      />
      <Button asChild>
        <Link to={createTo}>
          <Plus aria-hidden="true" data-icon="inline-start" />
          {createLabel}
        </Link>
      </Button>
    </div>
  );
}

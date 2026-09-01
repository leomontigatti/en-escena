import { Plus } from "lucide-react";

import { PortalEventDocumentsMenu } from "@/components/portal/event-documents-menu";
import { Button } from "@/components/ui/button";
import type {
  EventDocumentDownloadUrls,
  EventDocumentKind,
} from "@/lib/events/event-documents";

/**
 * The header of a portal list: the button that creates a record, and beside it
 * the menu that downloads the event documents this list is the right place for.
 * Both lists that carry documents render the same pair, so the pairing — and
 * the order the tooltip depends on — lives here instead of in each view.
 */
export function PortalListPageActions({
  createLabel,
  documentDownloadUrls,
  kinds,
  onCreate,
}: {
  createLabel: string;
  documentDownloadUrls: EventDocumentDownloadUrls;
  kinds: readonly EventDocumentKind[];
  onCreate: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Button type="button" onClick={onCreate}>
        <Plus aria-hidden="true" data-icon />
        {createLabel}
      </Button>
      <PortalEventDocumentsMenu
        documentDownloadUrls={documentDownloadUrls}
        kinds={kinds}
      />
    </div>
  );
}

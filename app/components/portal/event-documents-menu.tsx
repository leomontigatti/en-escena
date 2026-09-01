import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  getEventDocumentDownloadLabel,
  type EventDocumentDownloadUrls,
  type EventDocumentKind,
} from "@/lib/events/event-documents";

/**
 * The event documents an academy can download from a list view. Downloads are
 * scattered by audience — the professors contract sits with the professors, the
 * two dancer documents with the dancers — so each list declares the `kinds` it
 * is the right place for.
 *
 * The trigger renders even when nothing is available: an unavailable document
 * is a disabled item, so an academy can see the document exists and is not yet
 * published instead of wondering where the menu went.
 */
export function PortalEventDocumentsMenu({
  documentDownloadUrls,
  kinds,
}: {
  documentDownloadUrls: EventDocumentDownloadUrls;
  kinds: readonly EventDocumentKind[];
}) {
  return (
    // The tooltip goes below: both list headers put the "Nuevo …" button
    // immediately to the left of this trigger, and the default side covers it.
    <ResourceActionsMenu contentClassName="w-64" tooltipSide="bottom">
      <DropdownMenuGroup>
        {kinds.map((kind) => (
          <PortalEventDocumentMenuItem
            key={kind}
            downloadUrl={documentDownloadUrls[kind]}
            kind={kind}
          />
        ))}
      </DropdownMenuGroup>
    </ResourceActionsMenu>
  );
}

function PortalEventDocumentMenuItem({
  downloadUrl,
  kind,
}: {
  downloadUrl: string | null;
  kind: EventDocumentKind;
}) {
  const label = getEventDocumentDownloadLabel(kind);

  if (!downloadUrl) {
    return <DropdownMenuItem disabled>{label}</DropdownMenuItem>;
  }

  return (
    <DropdownMenuItem asChild>
      <a href={downloadUrl} target="_blank" rel="noreferrer">
        {label}
      </a>
    </DropdownMenuItem>
  );
}

import { ChevronDown, Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
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
 * The control says what it does in words: behind the `⋯` of a record's actions
 * academies either missed the downloads or took the menu for something else.
 * Every list gets the same "Descargar documentos" button, even the one with a
 * single document, so the download looks the same wherever it is.
 *
 * It renders even when nothing is available: an unavailable document is
 * disabled, so an academy can see the document exists and is not yet published
 * instead of wondering where the download went.
 */
export function PortalEventDocumentDownloads({
  documentDownloadUrls,
  kinds,
}: {
  documentDownloadUrls: EventDocumentDownloadUrls;
  kinds: readonly EventDocumentKind[];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline">
          <Download aria-hidden="true" data-icon />
          Descargar documentos
          <ChevronDown aria-hidden="true" data-icon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          {kinds.map((kind) => (
            <PortalEventDocumentMenuItem
              key={kind}
              downloadUrl={documentDownloadUrls[kind]}
              kind={kind}
            />
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
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

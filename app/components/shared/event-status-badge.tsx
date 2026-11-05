import { Badge } from "@/components/ui/badge";
import type { EventStatus } from "@/lib/events/event-status";
import { eventStatusLabels } from "@/lib/events/event-status-copy";

const eventStatusVariants = {
  "not-started": "info",
  "in-progress": "success",
  finished: "secondary",
} as const satisfies Record<EventStatus, string>;

/**
 * An event's `Estado del evento`, the same in the events list and the
 * sidebars. `flagFinished` turns `finished` amber: in a sidebar it means the
 * `Evento activo` is over and still active, which the list's past events are not.
 */
export function EventStatusBadge({
  eventStatus,
  flagFinished = false,
  className,
}: {
  eventStatus: EventStatus;
  flagFinished?: boolean;
  className?: string;
}) {
  const variant =
    flagFinished && eventStatus === "finished"
      ? "warning"
      : eventStatusVariants[eventStatus];

  return (
    <Badge variant={variant} className={className}>
      {eventStatusLabels[eventStatus]}
    </Badge>
  );
}

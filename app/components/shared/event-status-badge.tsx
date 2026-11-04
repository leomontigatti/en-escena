import { Badge } from "@/components/ui/badge";
import type { EventStatus } from "@/lib/events/event-status";
import {
  eventStatusLabels,
  noActiveEventLabel,
} from "@/lib/events/event-status-copy";

const eventStatusVariants = {
  "not-started": "info",
  "in-progress": "success",
  finished: "secondary",
} as const satisfies Record<EventStatus, string>;

/**
 * An event's `Estado del evento`, the same in the events list and both
 * shells. `null` is a shell with no `Evento activo`.
 */
export function EventStatusBadge({
  eventStatus,
  className,
}: {
  eventStatus: EventStatus | null;
  className?: string;
}) {
  if (eventStatus === null) {
    return (
      <Badge variant="secondary" className={className}>
        {noActiveEventLabel}
      </Badge>
    );
  }

  return (
    <Badge variant={eventStatusVariants[eventStatus]} className={className}>
      {eventStatusLabels[eventStatus]}
    </Badge>
  );
}

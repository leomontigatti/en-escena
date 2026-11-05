import { EnEscenaAvatar } from "@/components/shared/en-escena-avatar";
import { EventStatusBadge } from "@/components/shared/event-status-badge";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { ActiveEventStatusContext } from "@/lib/events/event-status";
import { noActiveEventLabel } from "@/lib/events/event-status-copy";

/**
 * A sidebar's header: the `Evento activo` with its `Estado del evento` on the
 * first line, the area it opens (`Panel de administración`, `Portal de
 * academias`, `Portal de particulares`) on the second.
 */
export function SidebarEventHeader({
  eventContext,
  areaLabel,
}: {
  eventContext: ActiveEventStatusContext;
  areaLabel: string;
}) {
  const eventName = eventContext.activeEvent?.name ?? noActiveEventLabel;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg">
          <EnEscenaAvatar />
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate font-medium" title={eventName}>
                {eventName}
              </span>
              {eventContext.activeEvent ? (
                <EventStatusBadge
                  eventStatus={eventContext.eventStatus}
                  flagFinished
                />
              ) : null}
            </span>
            <span className="truncate text-xs">{areaLabel}</span>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

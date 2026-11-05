import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { EventStatusBadge } from "@/components/shared/event-status-badge";
import { SidebarEventHeader } from "@/components/shared/sidebar-event-header";
import { SidebarProvider } from "@/components/ui/sidebar";
import type { ActiveEventStatusContext } from "@/lib/events/event-status";

function renderHeader(eventContext: ActiveEventStatusContext) {
  return renderToStaticMarkup(
    <SidebarProvider>
      <SidebarEventHeader
        eventContext={eventContext}
        areaLabel="Portal de academias"
      />
    </SidebarProvider>,
  );
}

describe("a sidebar's event header", () => {
  test("names the area under the event and its status", () => {
    const text = renderHeader({
      activeEvent: { name: "En Escena 2026" },
      eventStatus: "in-progress",
    }).replace(/<[^>]+>/g, " ");

    expect(text).toMatch(/En Escena 2026\s+En curso\s+Portal de academias/);
  });

  // An `Evento activo` that is over and still active is the admin's to close,
  // so the sidebar flags it where the events list's past events stay grey.
  test("flags a finished active event amber, and the list does not", () => {
    expect(
      renderHeader({
        activeEvent: { name: "En Escena 2026" },
        eventStatus: "finished",
      }),
    ).toContain('data-variant="warning"');
    expect(
      renderToStaticMarkup(<EventStatusBadge eventStatus="finished" />),
    ).toContain('data-variant="secondary"');
  });

  test("reads `Sin evento activo` with no badge without an active event", () => {
    const markup = renderHeader({ activeEvent: null });

    expect(markup).toContain("Sin evento activo");
    expect(markup).not.toContain('data-slot="badge"');
    expect(markup).toContain("Portal de academias");
  });
});

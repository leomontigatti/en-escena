import { describe, expect, test } from "vitest";

import { resolveAdminEventContext } from "@/lib/admin-event-context.server";

describe("admin event context", () => {
  test("defaults to the active Evento and represents it in the URL query", () => {
    expect(
      resolveAdminEventContext({
        requestUrl: "http://localhost/administracion",
        events: [
          { id: "evento_2025", name: "Evento 2025", active: false },
          { id: "evento_2026", name: "Evento 2026", active: true },
        ],
      }),
    ).toEqual({
      selectedEventId: "evento_2026",
      redirectTo: "/administracion?evento=evento_2026",
    });
  });

  test("preserves an explicit valid Evento de trabajo selection", () => {
    expect(
      resolveAdminEventContext({
        requestUrl: "http://localhost/administracion?evento=evento_2025",
        events: [
          { id: "evento_2025", name: "Evento 2025", active: false },
          { id: "evento_2026", name: "Evento 2026", active: true },
        ],
      }),
    ).toEqual({
      selectedEventId: "evento_2025",
      redirectTo: null,
    });
  });

  test("leaves the context empty when no active event exists and none is selected", () => {
    expect(
      resolveAdminEventContext({
        requestUrl: "http://localhost/administracion",
        events: [{ id: "evento_2025", name: "Evento 2025", active: false }],
      }),
    ).toEqual({
      selectedEventId: null,
      redirectTo: null,
    });
  });
});

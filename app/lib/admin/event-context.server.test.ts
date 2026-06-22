import { describe, expect, test } from "vitest";

import { resolveAdminEventContext } from "@/lib/admin/event-context.server";

describe("admin event context", () => {
  test("defaults to the active Evento", () => {
    expect(
      resolveAdminEventContext({
        events: [
          { id: "evento_2025", name: "Evento 2025", active: false },
          { id: "evento_2026", name: "Evento 2026", active: true },
        ],
      }),
    ).toEqual({
      selectedEventId: "evento_2026",
      redirectTo: null,
    });
  });

  test("does not select inactive Eventos", () => {
    expect(
      resolveAdminEventContext({
        events: [
          { id: "evento_2025", name: "Evento 2025", active: false },
          { id: "evento_2026", name: "Evento 2026", active: true },
        ],
      }),
    ).toEqual({
      selectedEventId: "evento_2026",
      redirectTo: null,
    });
  });

  test("leaves the context empty when no active event exists and none is selected", () => {
    expect(
      resolveAdminEventContext({
        events: [{ id: "evento_2025", name: "Evento 2025", active: false }],
      }),
    ).toEqual({
      selectedEventId: null,
      redirectTo: null,
    });
  });
});

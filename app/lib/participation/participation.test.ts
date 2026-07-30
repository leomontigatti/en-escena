import { describe, expect, test } from "vitest";

import {
  getParticipationBadgeVariant,
  getParticipationLabel,
  toParticipationStatus,
  type ParticipationStatus,
} from "@/lib/participation/participation";

describe("toParticipationStatus", () => {
  test("reports 'no-event' when there is no selected event", () => {
    expect(toParticipationStatus(null, false)).toBe("no-event");
    expect(toParticipationStatus(null, true)).toBe("no-event");
  });

  test("reports participation against the selected event", () => {
    expect(toParticipationStatus("event_1", true)).toBe("participating");
    expect(toParticipationStatus("event_1", false)).toBe("not-participating");
  });
});

describe("getParticipationLabel", () => {
  test("labels every status", () => {
    const labels: Record<ParticipationStatus, string> = {
      participating: "Participando",
      "not-participating": "No participando",
      "no-event": "Sin evento",
    };

    for (const [status, label] of Object.entries(labels)) {
      expect(getParticipationLabel(status as ParticipationStatus)).toBe(label);
    }
  });
});

describe("getParticipationBadgeVariant", () => {
  test("highlights only the participating status", () => {
    expect(getParticipationBadgeVariant("participating")).toBe("success");
    expect(getParticipationBadgeVariant("not-participating")).toBe("secondary");
    expect(getParticipationBadgeVariant("no-event")).toBe("secondary");
  });
});

import { vi } from "vitest";

import * as businessTimeZone from "./business-time-zone";

/**
 * Pins today's business date for the rest of the test. The price owner has no
 * date parameter — every caller resolves against today — so a test that needs
 * a particular day sets that day and restores the clock in `afterEach`.
 */
export function onBusinessDate(businessDate: string) {
  vi.spyOn(businessTimeZone, "getBusinessDateOnly").mockReturnValue(
    businessDate,
  );
}

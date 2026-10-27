import type { ServerInstrumentation } from "react-router";
import { describe, expect, test } from "vitest";

import { createServedRequests } from "./served-requests.server";

type InstrumentRequest = (
  handleRequest: () => Promise<unknown>,
) => Promise<void>;

// What React Router hands the handler instrumentation, reduced to the one
// hook the counter uses.
function instrumentRequest(instrumentation: ServerInstrumentation) {
  let wrap: InstrumentRequest | undefined;
  instrumentation.handler?.({
    instrument: ({ request }: { request?: InstrumentRequest }) => {
      wrap = request;
    },
  } as never);

  return (handleRequest: () => Promise<unknown>) =>
    wrap?.(handleRequest) ?? handleRequest();
}

describe("createServedRequests", () => {
  test("counts a request once it is answered, not while a slow loader still holds it", async () => {
    const served = createServedRequests();
    let answer = () => {};
    const handled = instrumentRequest(served.instrumentation)(
      () =>
        new Promise<void>((resolve) => {
          answer = resolve;
        }),
    );

    expect(served.countLastHour()).toBe(0);

    answer();
    await handled;

    expect(served.countLastHour()).toBe(1);
  });
});

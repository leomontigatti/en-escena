import type { ServerInstrumentation } from "react-router";

import { createRollingHourCount } from "@/lib/shared/rolling-hour-count";

/**
 * How many requests the server answered in the last hour. The client error
 * intake weighs browsers' lost connections against it: sixty on a night of
 * forty thousand requests are phones in a full theatre, not a broken proxy.
 */
function createServedRequests() {
  const answered = createRollingHourCount();

  // Every request React Router handles, documents, data and resource routes
  // alike; the static assets Express serves before it are not counted. A
  // request counts once answered: a stalled server must not look busy.
  const instrumentation: ServerInstrumentation = {
    handler(handler) {
      handler.instrument({
        request: async (handleRequest) => {
          try {
            await handleRequest();
          } finally {
            answered.add();
          }
        },
      });
    },
  };

  return { countLastHour: answered.lastHour, instrumentation };
}

const servedRequests = createServedRequests();

export { createServedRequests, servedRequests };

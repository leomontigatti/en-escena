const MINUTE_MS = 60 * 1000;
const MINUTES_IN_HOUR = 60;

/**
 * A count over the last hour, kept per minute so it holds sixty numbers
 * however much is added.
 */
function createRollingHourCount({ now = Date.now } = {}) {
  const perMinute = new Map<number, number>();

  const currentMinute = () => Math.floor(now() / MINUTE_MS);
  const forgetOlderThanAnHour = (minute: number) => {
    for (const recorded of perMinute.keys()) {
      if (recorded <= minute - MINUTES_IN_HOUR) {
        perMinute.delete(recorded);
      }
    }
  };

  return {
    add() {
      const minute = currentMinute();
      forgetOlderThanAnHour(minute);
      perMinute.set(minute, (perMinute.get(minute) ?? 0) + 1);
    },
    lastHour() {
      forgetOlderThanAnHour(currentMinute());

      let total = 0;
      for (const count of perMinute.values()) {
        total += count;
      }

      return total;
    },
  };
}

export { createRollingHourCount };

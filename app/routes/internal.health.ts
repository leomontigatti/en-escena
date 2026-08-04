/**
 * Liveness probe for the Coolify healthcheck.
 *
 * Deliberately does not touch the database. Migration success already gates
 * startup, so this route only has to answer "did the process come up". A
 * database-touching check would mark a healthy container unhealthy during a
 * blip and trigger restarts, which is the crash loop the entrypoint's retry
 * budget exists to prevent.
 */
export function loader() {
  return new Response("ok", {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

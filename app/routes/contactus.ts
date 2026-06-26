export function loader() {
  return new Response("Not Found", {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Robots-Tag": "noindex",
    },
    status: 404,
  });
}

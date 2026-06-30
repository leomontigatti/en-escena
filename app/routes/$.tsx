const scanner404Headers = {
  "Cache-Control": "no-store",
  "Content-Type": "text/plain; charset=utf-8",
  "X-Robots-Tag": "noindex",
};

function scanner404Response() {
  return new Response("Página no encontrada", {
    headers: scanner404Headers,
    status: 404,
    statusText: "Página no encontrada",
  });
}

export function loader() {
  return scanner404Response();
}

export function action() {
  return scanner404Response();
}

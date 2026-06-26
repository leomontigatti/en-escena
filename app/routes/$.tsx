export function loader() {
  return new Response("Página no encontrada", {
    status: 404,
    statusText: "Página no encontrada",
  });
}

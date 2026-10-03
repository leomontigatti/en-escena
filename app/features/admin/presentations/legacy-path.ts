import { redirect } from "react-router";

const legacyPath = "/administracion/presentacion";
const currentPath = "/administracion/presentaciones";

/**
 * The participation list lived at the singular `/administracion/presentacion`
 * until #1404. A saved or shared link to it, or to anything under it, lands on
 * the same page under the plural path, with its query untouched.
 */
export function redirectLegacyPresentationsPath(request: Request) {
  const url = new URL(request.url);
  const rest = url.pathname.slice(legacyPath.length);

  return redirect(`${currentPath}${rest}${url.search}`, 301);
}

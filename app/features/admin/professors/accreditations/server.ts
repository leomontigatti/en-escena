import QRCode from "qrcode";

import { loadEventContext } from "@/lib/admin/event-context.server";
import {
  listProfessorAccreditations,
  readProfessorFilters,
} from "@/lib/admin/professors/professors.server";
import { requireInternalUser } from "@/lib/auth/internal-access.server";

import { professorAccreditationIdParam } from "./shared";
import { renderProfessorAccreditationsDocument } from "./view";

/**
 * The print page of professor `accreditation`s, for the administrator only. It
 * prints the ticked professors when the address names any, and otherwise every
 * professor the list's search and filters match. It records nothing.
 */
export async function loadProfessorAccreditationsPrint(
  request: Request,
): Promise<Response> {
  await requireInternalUser(request, ["admin"]);

  const url = new URL(request.url);
  const { selectedEventId } = await loadEventContext(request);
  const professorIds = url.searchParams.getAll(professorAccreditationIdParam);
  const accreditations = await listProfessorAccreditations({
    selectedEventId,
    selection:
      professorIds.length > 0
        ? { professorIds }
        : { filters: readProfessorFilters(url.searchParams) },
  });
  const qrUrl = buildEventProgramUrl(url);
  const qrCodeSvg = await QRCode.toString(qrUrl, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
  });

  return new Response(
    renderProfessorAccreditationsDocument({
      accreditations,
      qrCodeSvg,
      qrUrl,
    }),
    { headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

/**
 * The public program's absolute address, on `APP_URL`, the app's configured
 * origin, falling back to the one the page was asked on. It is printed whether
 * or not the program is visible yet: the passes go out before it is published.
 */
function buildEventProgramUrl(requestUrl: URL) {
  return new URL("/programa", process.env.APP_URL || requestUrl.origin).href;
}

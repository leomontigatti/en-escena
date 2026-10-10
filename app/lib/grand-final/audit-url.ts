/**
 * Where an `auditLink` leads. The token travels in the fragment, which a
 * browser never sends: it stays out of the server's and the proxy's request
 * logs, out of every `Referer`, and out of a chat app's link preview, which
 * would otherwise open the link first and take its one device. The page reads
 * it in the browser and sends it once, in the body of the form that opens it.
 */
export const auditPath = "/auditoria";

/** The absolute link administration hands to an auditor, on the app's origin. */
export function buildAuditLinkUrl(origin: string, token: string) {
  const url = new URL(auditPath, origin);
  url.hash = token;

  return url.href;
}

/** The token a link's fragment carries, or null when there is none. */
export function readAuditLinkToken(hash: string) {
  const token = hash.replace(/^#/, "").trim();

  return token === "" ? null : token;
}

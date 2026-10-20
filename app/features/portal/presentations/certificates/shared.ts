/** The dancer whose certificate the address asks for; all of them without it. */
export const certificateDancerParam = "bailarin";

export function portalCertificatesPath(
  choreographyId: string,
  dancerId?: string,
) {
  const path = `/portal/presentaciones/${choreographyId}/certificados`;

  return dancerId
    ? `${path}?${new URLSearchParams({ [certificateDancerParam]: dancerId })}`
    : path;
}

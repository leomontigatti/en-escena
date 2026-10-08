/**
 * Where the public votes in the `Gran final`, and how a printed `voteCode`
 * reaches it: the QR encodes the vote page with the token in `codigo`, so the
 * page that reads the parameter and the sheet that prints it share one shape.
 */
const votePath = "/votar";

const voteCodeParam = "codigo";

/** The absolute vote URL a code's QR encodes, on the app's origin. */
export function buildVoteCodeUrl(origin: string, token: string) {
  const url = new URL(votePath, origin);
  url.searchParams.set(voteCodeParam, token);

  return url.href;
}

/**
 * Where the public votes in the `Gran final`, and how a printed `voteCode`
 * reaches it: the QR encodes the vote page with the token in `codigo`, so the
 * page that reads the parameter and the sheet that prints it share one shape.
 */
const votePath = "/votar";

export const voteCodeParam = "codigo";

/** The absolute vote URL a code's QR encodes, on the app's origin. */
export function buildVoteCodeUrl(origin: string, token: string) {
  return new URL(buildVoteCodePath(token), origin).href;
}

/** The vote page as the code reaches it, where a vote cast with it lands. */
export function buildVoteCodePath(token: string) {
  return `${votePath}?${new URLSearchParams({ [voteCodeParam]: token })}`;
}

/** The absolute vote URL a finalist academy shares, with no code in it. */
export function buildVoteUrl(origin: string) {
  return new URL(votePath, origin).href;
}

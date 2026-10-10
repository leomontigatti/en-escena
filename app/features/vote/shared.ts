import { z } from "zod";

import { requiredFieldMessage } from "@/lib/shared/forms";

/**
 * What the public vote page of the `Gran final` and its server agree on. A
 * module of its own because the view imports the schema, and the server
 * module cannot reach the browser.
 */

export const voteFormSchema = z.object({
  academyId: z.string().trim().min(1, requiredFieldMessage),
  codigo: z.string().trim(),
  /** The round the visitor chose in: a vote never lands in a later one. */
  roundId: z.string().trim().min(1, requiredFieldMessage),
});

export type VoteFormValues = z.input<typeof voteFormSchema>;

/** A finalist as the page shows it: its two pictures already signed. */
export type VoteFinalist = {
  academyId: string;
  city: string | null;
  name: string;
  pictureUrls: string[];
};

/** Why the code the visitor arrived with cannot vote. */
export type VoteCodeRefusal = "unknown-code" | "voided-code";

/**
 * A finalist in the published `grandFinalResult`: its place and its share of
 * the weighted points, never the points or the votes themselves.
 */
export type PublishedFinalist = {
  academyId: string;
  city: string | null;
  name: string;
  percentage: number;
  position: number;
  winner: boolean;
};

/**
 * `not-open` before the round opens, `closed` once it closed: the page says
 * which, and nothing else, until the result is published, when it shows the
 * last round's ranking. While the round is open, only a visitor who can vote
 * sees the finalists: one with nothing that votes is asked to sign in, one
 * whose code cannot vote is told why, and one who voted reads that it was
 * registered.
 */
export type VotePageData =
  | { state: "closed" }
  | { state: "not-open" }
  | {
      ranking: PublishedFinalist[];
      /** 2 when the ranking is the `Desempate`'s. */
      roundNumber: number;
      state: "published";
      /** The first place tied on points and the QR votes decided it. */
      tieBrokenByCodeVotes: boolean;
    }
  | {
      /** Whether the deployment has Google sign-in, or only codes vote. */
      google: boolean;
      state: "sign-in";
    }
  | { reason: VoteCodeRefusal; state: "code-refused" }
  | {
      /** The code the visitor arrived with, or null for a signed-in voter. */
      code: string | null;
      finalists: VoteFinalist[];
      /** The open round, which the vote form names. */
      roundId: string;
      state: "open";
    }
  | { finalist: VoteFinalist; state: "registered" };

export type VoteActionData = { message: string; status: "error" };

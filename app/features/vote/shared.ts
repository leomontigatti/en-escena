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
});

export type VoteFormValues = z.input<typeof voteFormSchema>;

/** A finalist as the page shows it: its two pictures already signed. */
export type VoteFinalist = {
  academyId: string;
  city: string | null;
  name: string;
  pictureUrls: string[];
};

/**
 * Why this visitor cannot vote now: nothing identifies them yet (no code, no
 * sign-in), or the code they brought is not a code of the event or was
 * voided. Built by the server; the vote button stays and opens them
 * (docs/agents/form-feedback.md).
 */
export type VoteBlockReason = {
  code: "no-identity" | "unknown-code" | "voided-code";
  label: string;
};

/**
 * Where the visitor stands with Google: offered when nothing else lets them
 * vote here, signed in once they are, and null when the page votes with the
 * code they brought or the deployment has no Google sign-in.
 */
export type VoteGoogleSignIn = "offered" | "signed-in" | null;

/**
 * `not-open` before the round opens, `closed` once it closed: the page says
 * which, and nothing else, until the result is published.
 */
export type VotePageData =
  | { state: "closed" }
  | { state: "not-open" }
  | {
      blockReasons: VoteBlockReason[];
      /** The code the visitor arrived with, when it can still vote. */
      code: string | null;
      finalists: VoteFinalist[];
      googleSignIn: VoteGoogleSignIn;
      state: "open";
    }
  | {
      /**
       * Whether the page offers Google too: a code's vote is registered and
       * the same person may still vote with their account.
       */
      canAlsoSignIn: boolean;
      finalist: VoteFinalist;
      state: "registered";
    };

export type VoteActionData = { message: string; status: "error" };

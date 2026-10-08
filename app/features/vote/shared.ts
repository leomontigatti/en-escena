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
 * Why this visitor cannot vote now: no code reached the page, or the one that
 * did is not a code of the event or was voided. Built by the server; the vote
 * button stays and opens them (docs/agents/form-feedback.md).
 */
export type VoteBlockReason = {
  code: "no-code" | "unknown-code" | "voided-code";
  label: string;
};

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
      state: "open";
    }
  | { finalist: VoteFinalist; state: "registered" };

export type VoteActionData = { message: string; status: "error" };

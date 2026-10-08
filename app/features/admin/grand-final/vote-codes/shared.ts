import { z } from "zod";

/**
 * What the `Gran final` list's QR code batches and their server agree on: the
 * two intents, their schemas, and where a batch prints. A module of its own
 * because the view imports it and the server module cannot reach the browser.
 */

export const createVoteCodeBatchIntent = "create-vote-code-batch";
export const voidVoteCodeBatchIntent = "void-vote-code-batch";

/**
 * The most codes one batch takes. A print run is a night's tickets at most,
 * and a larger one is several batches, each voidable on its own.
 */
export const maxVoteCodeBatchSize = 1000;

export const voteCodeCountMessage = `Ingresá un número entero entre 1 y ${maxVoteCodeBatchSize}.`;

/**
 * The count stays the digits typed, so the form's values and the schema's
 * output are one type; `parseVoteCodeCount` reads the number off it.
 */
export const createVoteCodeBatchSchema = z.object({
  count: z
    .string()
    .trim()
    .regex(/^\d+$/, voteCodeCountMessage)
    .refine(
      (digits) => {
        const count = parseVoteCodeCount(digits);

        return count >= 1 && count <= maxVoteCodeBatchSize;
      },
      { message: voteCodeCountMessage },
    ),
  intent: z.literal(createVoteCodeBatchIntent),
});

export function parseVoteCodeCount(digits: string) {
  return Number.parseInt(digits, 10);
}

export type CreateVoteCodeBatchFormValues = z.input<
  typeof createVoteCodeBatchSchema
>;

export const voidVoteCodeBatchSchema = z.object({
  batchId: z.string().trim().min(1),
  intent: z.literal(voidVoteCodeBatchIntent),
});

/** The printable sheet of a batch's QR codes, opened in a new tab. */
export function buildVoteCodeSheetPath(batchId: string) {
  return `/administracion/gran-final/codigos-qr/${encodeURIComponent(batchId)}`;
}

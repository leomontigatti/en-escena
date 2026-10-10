/**
 * The `grandFinalResult` read off a closed `votingRound`'s tally: the ranking
 * by weighted points, each finalist's share of them, and who won. Pure, so the
 * rule reads in one place (CONTEXT.md `votingRound`):
 *
 * - Round 1 ranks by points. A tie for first place crowns nobody: it is what
 *   a `Desempate` round settles.
 * - Round 2, the `Desempate`, ranks by points and then by the greater number
 *   of QR votes; finalists still tied on both share the first place and all
 *   win.
 */

/** A finalist's votes in one round, as the votes table counts them. */
export type FinalistTally = {
  academyId: string;
  city: string | null;
  /** Votes cast with a `voteCode`. */
  codeVotes: number;
  name: string;
  /** Weighted points: what the ranking and the percentages read. */
  points: number;
  /** Votes cast by a signed-in `voter`. */
  voterVotes: number;
};

export type RankedFinalist = FinalistTally & {
  /** Share of the round's weighted points, 0 to 100, to one decimal. */
  percentage: number;
  /** 1 for the first place; tied finalists share a position, and the next skips. */
  position: number;
  winner: boolean;
};

/**
 * `winner` names one academy; `tie` a round 1 first place shared, which
 * blocks publishing until a `Desempate`; `shared` a round 2 first place still
 * tied on QR votes, where every one named wins.
 */
export type GrandFinalOutcome = {
  academyIds: string[];
  kind: "shared" | "tie" | "winner";
};

export type GrandFinalRanking = {
  entries: RankedFinalist[];
  outcome: GrandFinalOutcome;
  /**
   * Whether a `Desempate`'s first place was tied on points and the greater
   * number of QR votes decided it: the shares alone read as a tie then.
   */
  tieBrokenByCodeVotes: boolean;
};

export function rankGrandFinal(
  roundNumber: number,
  tallies: FinalistTally[],
): GrandFinalRanking {
  const isTieBreak = roundNumber === 2;
  const totalPoints = tallies.reduce((sum, tally) => sum + tally.points, 0);
  // Round 2 compares QR votes only where the points are equal.
  const compare = (left: FinalistTally, right: FinalistTally) =>
    right.points - left.points ||
    (isTieBreak ? right.codeVotes - left.codeVotes : 0);
  const sorted = [...tallies].sort(
    (left, right) =>
      compare(left, right) || left.name.localeCompare(right.name, "es"),
  );
  const positions = sorted.map((tally) => {
    const ahead = sorted.findIndex((other) => compare(other, tally) === 0);

    return ahead + 1;
  });
  const firstPlace = sorted
    .filter((_, index) => positions[index] === 1)
    .map((tally) => tally.academyId);
  const outcome = readOutcome(firstPlace, isTieBreak);
  const winners = outcome.kind === "tie" ? [] : outcome.academyIds;

  return {
    entries: sorted.map((tally, index) => ({
      ...tally,
      percentage: readPercentage(tally.points, totalPoints),
      position: positions[index],
      winner: winners.includes(tally.academyId),
    })),
    outcome,
    tieBrokenByCodeVotes:
      isTieBreak &&
      outcome.kind === "winner" &&
      sorted.length > 1 &&
      sorted[0].points === sorted[1].points,
  };
}

function readOutcome(
  firstPlace: string[],
  isTieBreak: boolean,
): GrandFinalOutcome {
  if (firstPlace.length <= 1) {
    return { academyIds: firstPlace, kind: "winner" };
  }

  return { academyIds: firstPlace, kind: isTieBreak ? "shared" : "tie" };
}

function readPercentage(points: number, totalPoints: number) {
  if (totalPoints === 0) {
    return 0;
  }

  // In integer tenths first, so 2/3 reads 66.7 and not 66.69999.
  return Math.round((points * 1000) / totalPoints) / 10;
}

const voteShareFormat = new Intl.NumberFormat("es-AR", {
  maximumFractionDigits: 1,
});

/** A finalist's share as the pages show it: `52,6 %`. */
export function formatVoteShare(percentage: number) {
  return `${voteShareFormat.format(percentage)} %`;
}

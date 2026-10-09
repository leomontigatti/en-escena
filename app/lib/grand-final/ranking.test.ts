import { describe, expect, test } from "vitest";

import { formatVoteShare, rankGrandFinal, type FinalistTally } from "./ranking";

function tally(
  name: string,
  votes: { codes?: number; voters?: number },
): FinalistTally {
  const codeVotes = votes.codes ?? 0;
  const voterVotes = votes.voters ?? 0;

  return {
    academyId: name.toLowerCase(),
    city: null,
    codeVotes,
    name,
    points: codeVotes * 10 + voterVotes,
    voterVotes,
  };
}

function summarize(result: ReturnType<typeof rankGrandFinal>) {
  return result.entries.map((entry) => [
    entry.name,
    entry.position,
    entry.percentage,
    entry.winner,
  ]);
}

describe("`rankGrandFinal`", () => {
  test("ranks by weighted points, not by how many votes each finalist got", () => {
    const result = rankGrandFinal(1, [
      tally("Ritmo", { voters: 9 }),
      tally("Alas", { codes: 1 }),
    ]);

    expect(summarize(result)).toEqual([
      ["Alas", 1, 52.6, true],
      ["Ritmo", 2, 47.4, false],
    ]);
    expect(result.outcome).toEqual({ academyIds: ["alas"], kind: "winner" });
  });

  test("gives each finalist its share of the round's weighted points, to one decimal", () => {
    const result = rankGrandFinal(1, [
      tally("Alas", { codes: 1, voters: 10 }),
      tally("Ritmo", { voters: 5 }),
      tally("Sur", { voters: 5 }),
    ]);

    expect(summarize(result)).toEqual([
      ["Alas", 1, 66.7, true],
      ["Ritmo", 2, 16.7, false],
      ["Sur", 2, 16.7, false],
    ]);
  });

  test("gives every finalist 0% when nobody voted, and calls the first place tied", () => {
    const result = rankGrandFinal(1, [tally("Alas", {}), tally("Ritmo", {})]);

    expect(summarize(result)).toEqual([
      ["Alas", 1, 0, false],
      ["Ritmo", 1, 0, false],
    ]);
    expect(result.outcome).toEqual({
      academyIds: ["alas", "ritmo"],
      kind: "tie",
    });
  });

  test("calls a round 1 tie for first place a tie, whoever has more QR votes, and crowns nobody", () => {
    const result = rankGrandFinal(1, [
      tally("Ritmo", { voters: 20 }),
      tally("Alas", { codes: 2 }),
      tally("Sur", { codes: 1 }),
    ]);

    expect(result.outcome).toEqual({
      academyIds: ["alas", "ritmo"],
      kind: "tie",
    });
    expect(summarize(result)).toEqual([
      ["Alas", 1, 40, false],
      ["Ritmo", 1, 40, false],
      ["Sur", 3, 20, false],
    ]);
  });

  test("calls no tie when only places below the first are tied", () => {
    const result = rankGrandFinal(1, [
      tally("Ritmo", { codes: 2 }),
      tally("Alas", { codes: 3 }),
      tally("Sur", { voters: 20 }),
    ]);

    expect(result.outcome).toEqual({ academyIds: ["alas"], kind: "winner" });
  });

  test("crowns the only finalist of a round", () => {
    expect(rankGrandFinal(1, [tally("Alas", {})]).outcome).toEqual({
      academyIds: ["alas"],
      kind: "winner",
    });
  });

  test("breaks a round 2 tie for first place by the greater number of QR votes", () => {
    const result = rankGrandFinal(2, [
      tally("Alas", { codes: 1, voters: 10 }),
      tally("Ritmo", { codes: 2 }),
    ]);

    expect(result.outcome).toEqual({ academyIds: ["ritmo"], kind: "winner" });
    expect(result.tieBrokenByCodeVotes).toBe(true);
    expect(summarize(result)).toEqual([
      ["Ritmo", 1, 50, true],
      ["Alas", 2, 50, false],
    ]);
  });

  test("lets QR votes decide nothing in round 2 when the points are not tied", () => {
    const result = rankGrandFinal(2, [
      tally("Ritmo", { codes: 2 }),
      tally("Alas", { codes: 1, voters: 11 }),
    ]);

    expect(result.outcome).toEqual({ academyIds: ["alas"], kind: "winner" });
    expect(result.tieBrokenByCodeVotes).toBe(false);
  });

  test("crowns both when round 2 ties on points and on QR votes", () => {
    const result = rankGrandFinal(2, [
      tally("Ritmo", { codes: 1, voters: 3 }),
      tally("Alas", { codes: 1, voters: 3 }),
    ]);

    expect(result.outcome).toEqual({
      academyIds: ["alas", "ritmo"],
      kind: "shared",
    });
    expect(result.tieBrokenByCodeVotes).toBe(false);
    expect(summarize(result)).toEqual([
      ["Alas", 1, 50, true],
      ["Ritmo", 1, 50, true],
    ]);
  });
});

describe("`formatVoteShare`", () => {
  test("reads a share in Spanish, with a decimal comma only when it has one", () => {
    expect(
      [52.6, 50, 0, 100].map((percentage) => formatVoteShare(percentage)),
    ).toEqual(["52,6 %", "50 %", "0 %", "100 %"]);
  });
});

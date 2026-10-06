import { sql, type SQL } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { db } from "@/db";
import { matchesListSearch } from "@/lib/list-query/list-query";
import { listSearchCondition } from "@/lib/list-query/list-query.server";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

/**
 * One table of Spanish inputs, asked of the in-memory predicate and of its SQL
 * twin: a list that searches in memory and a list that searches in SQL must
 * find the same rows for the same typing.
 */
const searchCases: [value: string, search: string, matches: boolean][] = [
  ["Bailarín", "bailarin", true],
  ["bailarin", "BAILARÍN", true],
  ["Peña", "pena", true],
  ["PEÑA", "peña", true],
  ["José María Güemes", "jose maria guemes", true],
  ["Academia Ñandú", "ñandu", true],
  ["Àngels Çelik", "angels celik", true],
  ["Estudio 100%", "100%", true],
  ["Estudio 1000", "100%", false],
  ["mi_estudio", "mi_", true],
  ["mixestudio", "mi_", false],
  ["barra\\invertida", "a\\i", true],
  ["barrainvertida", "a\\i", false],
  ["Rosario", "  sario  ", true],
  ["Rosario", "córdoba", false],
  ["Peña".normalize("NFD"), "pena", true],
  ["Peña", "pen\u0303a", true],
];

describe("listSearchCondition", () => {
  test.each(searchCases)(
    "agrees with the in-memory search on `%s` searched as `%s`",
    async (value, search, matches) => {
      expect(matchesListSearch(search, [value])).toBe(matches);
      expect(
        await matchesInSql(listSearchCondition(search, [sql`${value}::text`])),
      ).toBe(matches);
    },
  );

  // Recorded, not wished away: `translate` folds a fixed list of letters, so an
  // accent outside it folds in memory and stays put in SQL.
  test("folds in SQL only the accents it lists", async () => {
    expect(matchesListSearch("osaka", ["Ōsaka"])).toBe(true);
    expect(
      await matchesInSql(listSearchCondition("osaka", [sql`${"Ōsaka"}::text`])),
    ).toBe(false);
  });

  test("matches when any of the columns does", async () => {
    const condition = listSearchCondition("ana", [
      sql`${"Rosario"}::text`,
      sql`${"Ana Pérez"}::text`,
    ]);

    expect(await matchesInSql(condition)).toBe(true);
  });

  test("asks nothing of an empty search", () => {
    expect(listSearchCondition("   ", [sql`${"Rosario"}::text`])).toBe(
      undefined,
    );
  });
});

async function matchesInSql(condition: SQL | undefined) {
  const [row] = await db
    .select({ matches: sql<boolean>`${condition}` })
    .from(sql`(values (1)) as probe (one)`);

  return row?.matches;
}

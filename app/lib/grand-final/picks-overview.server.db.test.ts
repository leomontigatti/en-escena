import { describe, expect, test } from "vitest";

import { saveFinalistBanners } from "@/lib/grand-final/banners.server";
import { setAcademyFinalistPicks } from "@/lib/grand-final/finalist-pick.server";
import { readGrandFinalPicks } from "@/lib/grand-final/picks-overview.server";
import { seedEligibilityFixture } from "@/lib/grand-final/grand-final.test-support";
import { createGrandFinalBannerStorage } from "@/lib/storage/grand-final-banners.server";
import { pngFile } from "@/lib/test-support/images";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

/**
 * Two modalities with two eligible academies each, one of them eligible in
 * both, and a panel of three judges on the event.
 */
async function seedTwoModalities() {
  const fixture = await seedEligibilityFixture();
  const jazz = await fixture.addModality("Jazz");
  const tap = await fixture.addModality("Tap");
  const pirueta = await fixture.addAcademy("Academia Pirueta");
  const vecina = await fixture.addAcademy("Academia Vecina");
  const zapateo = await fixture.addAcademy("Academia Zapateo");
  const choreographyIds: string[] = [];

  for (const [academy, modality] of [
    [pirueta, jazz],
    [vecina, jazz],
    [pirueta, tap],
    [zapateo, tap],
  ] as const) {
    choreographyIds.push(
      await fixture.register({ academy, modality, category: "Infantil" }),
    );
    await fixture.register({ academy, modality, category: "Mayores" });
  }

  const [ana, bruno, carla] = await Promise.all(
    ["Ana Juez", "Bruno Juez", "Carla Juez"].map((name) =>
      fixture.addJudge(name),
    ),
  );

  for (const judgeId of [ana, bruno, carla]) {
    await fixture.assignJudge(judgeId, choreographyIds[0]);
  }

  return { ana, bruno, carla, fixture, jazz, pirueta, tap, vecina, zapateo };
}

describe("`readGrandFinalPicks`", () => {
  test("lists each modality's eligible academies with the judges who picked them, and marks every picked academy a finalist", async () => {
    const seed = await seedTwoModalities();
    await seed.fixture.addJudge("Diego Juez, de otro evento");

    await setAcademyFinalistPicks({
      academyId: seed.vecina,
      picks: [{ judgeIds: [seed.ana, seed.bruno], modalityId: seed.jazz }],
    });
    await setAcademyFinalistPicks({
      academyId: seed.pirueta,
      picks: [{ judgeIds: [seed.ana], modalityId: seed.tap }],
    });

    await expect(readGrandFinalPicks(seed.fixture.eventId)).resolves.toEqual({
      judges: [
        { id: seed.ana, name: "Ana Juez" },
        { id: seed.bruno, name: "Bruno Juez" },
        { id: seed.carla, name: "Carla Juez" },
      ],
      modalities: [
        {
          modalityId: seed.jazz,
          modalityName: "Jazz",
          academies: [
            {
              academyId: seed.pirueta,
              bannerCount: 0,
              eligible: true,
              finalist: true,
              name: "Academia Pirueta",
              pickedByJudgeIds: [],
            },
            {
              academyId: seed.vecina,
              bannerCount: 0,
              eligible: true,
              finalist: true,
              name: "Academia Vecina",
              pickedByJudgeIds: [seed.ana, seed.bruno],
            },
          ],
        },
        {
          modalityId: seed.tap,
          modalityName: "Tap",
          academies: [
            {
              academyId: seed.pirueta,
              bannerCount: 0,
              eligible: true,
              finalist: true,
              name: "Academia Pirueta",
              pickedByJudgeIds: [seed.ana],
            },
            {
              academyId: seed.zapateo,
              bannerCount: 0,
              eligible: true,
              finalist: false,
              name: "Academia Zapateo",
              pickedByJudgeIds: [],
            },
          ],
        },
      ],
    });
  });

  test("keeps a pick whose academy stopped being eligible, marked as such", async () => {
    const seed = await seedTwoModalities();

    await setAcademyFinalistPicks({
      academyId: seed.vecina,
      picks: [{ judgeIds: [seed.carla], modalityId: seed.jazz }],
    });
    await seed.fixture.withdrawAll(seed.vecina);

    const { modalities } = await readGrandFinalPicks(seed.fixture.eventId);

    expect(modalities[0].academies).toEqual([
      expect.objectContaining({ academyId: seed.pirueta, eligible: true }),
      {
        academyId: seed.vecina,
        bannerCount: 0,
        eligible: false,
        finalist: true,
        name: "Academia Vecina",
        pickedByJudgeIds: [seed.carla],
      },
    ]);
  });

  test("lists a modality with no eligible academy, empty", async () => {
    const seed = await seedTwoModalities();
    const salsa = await seed.fixture.addModality("Salsa");

    const { modalities } = await readGrandFinalPicks(seed.fixture.eventId);

    expect(modalities.map((row) => row.modalityName)).toEqual([
      "Jazz",
      "Salsa",
      "Tap",
    ]);
    expect(
      modalities.find((row) => row.modalityId === salsa)?.academies,
    ).toEqual([]);
  });

  // Banners belong to the academy within the event: a pick moved to another
  // academy and back finds them where they were.
  test("counts each academy's banners, and keeps them through a pick change", async () => {
    const seed = await seedTwoModalities();
    const storage = createGrandFinalBannerStorage({
      createSignedUrl: async () => "https://example.test/signed",
      remove: async () => {},
      upload: async () => {},
    });

    await setAcademyFinalistPicks({
      academyId: seed.vecina,
      picks: [{ judgeIds: [seed.ana], modalityId: seed.jazz }],
    });
    await expect(
      saveFinalistBanners({
        academyId: seed.vecina,
        changes: {
          first: { file: pngFile("a.png", 1920, 1080), kind: "upload" },
          second: { kind: "keep" },
        },
        eventId: seed.fixture.eventId,
        storage,
      }),
    ).resolves.toEqual({ ok: true });
    await setAcademyFinalistPicks({
      academyId: seed.pirueta,
      picks: [{ judgeIds: [seed.ana], modalityId: seed.jazz }],
    });
    await setAcademyFinalistPicks({
      academyId: seed.vecina,
      picks: [{ judgeIds: [seed.ana], modalityId: seed.jazz }],
    });

    const { modalities } = await readGrandFinalPicks(seed.fixture.eventId);

    expect(
      modalities[0].academies.map((row) => [row.name, row.bannerCount]),
    ).toEqual([
      ["Academia Pirueta", 0],
      ["Academia Vecina", 1],
    ]);
  });
});

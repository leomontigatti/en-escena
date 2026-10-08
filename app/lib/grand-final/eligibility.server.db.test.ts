import { describe, expect, test } from "vitest";

import { grandFinalEligibility } from "@/lib/grand-final/eligibility.server";
import { seedEligibilityFixture } from "@/lib/grand-final/grand-final.test-support";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

describe("`grandFinalEligibility`", () => {
  test("an academy with a grupal children and a grupal adults choreography in one modality is eligible in it", async () => {
    const fixture = await seedEligibilityFixture();
    const academy = await fixture.addAcademy("Academia Pirueta");
    const jazz = await fixture.addModality("Jazz");

    await fixture.register({ academy, modality: jazz, category: "Infantil A" });
    await fixture.register({ academy, modality: jazz, category: "Mayores" });

    await expect(grandFinalEligibility(fixture.eventId)).resolves.toEqual([
      { academyId: academy, modalityId: jazz },
    ]);
  });

  // The rule reads the first word of the name and nothing else: the ages of
  // the category never enter, and a name outside the list counts for neither.
  test.each([
    { children: "Baby", adults: "Juvenil A" },
    { children: "Infantil B", adults: "Mayores" },
    { children: "Infantil", adults: "Adulto" },
    { children: "Baby 2", adults: "Adultos Libre" },
  ])(
    "pairs a $children category with a $adults category",
    async ({ children, adults }) => {
      const fixture = await seedEligibilityFixture();
      const academy = await fixture.addAcademy("Academia Pirueta");
      const jazz = await fixture.addModality("Jazz");

      await fixture.register({ academy, modality: jazz, category: children });
      await fixture.register({ academy, modality: jazz, category: adults });

      await expect(grandFinalEligibility(fixture.eventId)).resolves.toEqual([
        { academyId: academy, modalityId: jazz },
      ]);
    },
  );

  test("a category whose first word is not in the rule counts for neither half", async () => {
    const fixture = await seedEligibilityFixture();
    const academy = await fixture.addAcademy("Academia Pirueta");
    const jazz = await fixture.addModality("Jazz");

    await fixture.register({ academy, modality: jazz, category: "Infantil" });
    await fixture.register({ academy, modality: jazz, category: "Libre" });
    await fixture.register({
      academy,
      modality: jazz,
      category: "Pre Juvenil",
    });
    await fixture.register({
      academy,
      modality: jazz,
      category: "Baby Mayores",
    });

    await expect(grandFinalEligibility(fixture.eventId)).resolves.toEqual([]);
  });

  test("a withdrawn choreography does not count, and eligibility follows the withdrawal at once", async () => {
    const fixture = await seedEligibilityFixture();
    const academy = await fixture.addAcademy("Academia Pirueta");
    const jazz = await fixture.addModality("Jazz");

    await fixture.register({ academy, modality: jazz, category: "Infantil" });
    await fixture.register({
      academy,
      modality: jazz,
      category: "Mayores",
      withdrawn: true,
    });

    await expect(grandFinalEligibility(fixture.eventId)).resolves.toEqual([]);

    await fixture.register({ academy, modality: jazz, category: "Mayores" });

    await expect(grandFinalEligibility(fixture.eventId)).resolves.toEqual([
      { academyId: academy, modalityId: jazz },
    ]);
  });

  test("a choreography that is not grupal never counts", async () => {
    const fixture = await seedEligibilityFixture();
    const academy = await fixture.addAcademy("Academia Pirueta");
    const jazz = await fixture.addModality("Jazz");

    await fixture.register({ academy, modality: jazz, category: "Infantil" });
    await fixture.register({
      academy,
      modality: jazz,
      category: "Mayores",
      groupType: "solo",
    });

    await expect(grandFinalEligibility(fixture.eventId)).resolves.toEqual([]);
  });

  test("the two halves may sit in different submodalities of the modality", async () => {
    const fixture = await seedEligibilityFixture();
    const academy = await fixture.addAcademy("Academia Pirueta");
    const jazz = await fixture.addModality("Jazz");
    const lyrical = await fixture.addSubmodality(jazz, "Lírico");
    const funk = await fixture.addSubmodality(jazz, "Funk");

    await fixture.register({
      academy,
      modality: jazz,
      category: "Infantil",
      submodality: lyrical,
    });
    await fixture.register({
      academy,
      modality: jazz,
      category: "Mayores",
      submodality: funk,
    });

    await expect(grandFinalEligibility(fixture.eventId)).resolves.toEqual([
      { academyId: academy, modalityId: jazz },
    ]);
  });

  test("halves split across two modalities make the academy eligible in neither", async () => {
    const fixture = await seedEligibilityFixture();
    const academy = await fixture.addAcademy("Academia Pirueta");
    const jazz = await fixture.addModality("Jazz");
    const tap = await fixture.addModality("Tap");

    await fixture.register({ academy, modality: jazz, category: "Infantil" });
    await fixture.register({ academy, modality: tap, category: "Mayores" });

    await expect(grandFinalEligibility(fixture.eventId)).resolves.toEqual([]);
  });

  test("answers per academy and modality: eligible in one modality, not in another, and never through another academy's rows", async () => {
    const fixture = await seedEligibilityFixture();
    const academy = await fixture.addAcademy("Academia Pirueta");
    const neighbour = await fixture.addAcademy("Academia Vecina");
    const jazz = await fixture.addModality("Jazz");
    const tap = await fixture.addModality("Tap");

    await fixture.register({ academy, modality: jazz, category: "Infantil" });
    await fixture.register({ academy, modality: jazz, category: "Juvenil" });
    await fixture.register({ academy, modality: tap, category: "Infantil" });
    await fixture.register({
      academy: neighbour,
      modality: tap,
      category: "Mayores",
    });

    await expect(grandFinalEligibility(fixture.eventId)).resolves.toEqual([
      { academyId: academy, modalityId: jazz },
    ]);
  });
});

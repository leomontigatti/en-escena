import { describe, expect, test } from "vitest";

import {
  createModality,
  createModalityWithSubmodalities,
  listModalities,
  listSubmodalities,
} from "@/lib/modalities/repository.server";
import {
  createSavedEvent,
  expectCreated,
} from "@/lib/events/bases-test-fixtures.server.db";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

installDatabaseTestHooks();

describe("`Bases del evento` modalities repository", () => {
  test("creates a modality together with its submodalities in one transaction", async () => {
    const event = await createSavedEvent("Regional 2026");

    const modality = await expectCreated(
      createModalityWithSubmodalities(event.id, {
        name: " jazz ",
        submodalities: [{ name: " lírico " }, { name: "Contemporáneo" }],
      }),
    );

    if (!("name" in modality)) {
      throw new Error("Expected the created `Modalidad` to include a name.");
    }
    expect(modality.name).toBe("Jazz");

    const submodalities = await listSubmodalities(event.id);
    expect(submodalities).toHaveLength(2);
    expect(
      submodalities.every((entry) => entry.modalityId === modality.id),
    ).toBe(true);
    expect(submodalities.every((entry) => entry.eventId === event.id)).toBe(
      true,
    );
    expect(submodalities.map((entry) => entry.name).sort()).toEqual([
      "Contemporáneo",
      "Lírico",
    ]);
  });

  test("creates a modality with zero submodalities", async () => {
    const event = await createSavedEvent("Regional 2026");

    const modality = await expectCreated(
      createModalityWithSubmodalities(event.id, {
        name: "Urbanas",
        submodalities: [],
      }),
    );

    await expect(listModalities(event.id)).resolves.toMatchObject([
      { id: modality.id, name: "Urbanas" },
    ]);
    await expect(listSubmodalities(event.id)).resolves.toEqual([]);
  });

  test("surfaces the unique submodality name conflict and rolls back the whole insert", async () => {
    const event = await createSavedEvent("Regional 2026");

    await expect(
      createModalityWithSubmodalities(event.id, {
        name: "Jazz",
        submodalities: [{ name: "Lírico" }, { name: " lírico " }],
      }),
    ).resolves.toMatchObject({ ok: false, code: "duplicate-name" });

    await expect(listModalities(event.id)).resolves.toEqual([]);
    await expect(listSubmodalities(event.id)).resolves.toEqual([]);
  });

  test("rejects an existing modality name without persisting submodalities", async () => {
    const event = await createSavedEvent("Regional 2026");
    const existing = await expectCreated(
      createModality(event.id, { name: "Jazz" }),
    );

    await expect(
      createModalityWithSubmodalities(event.id, {
        name: "jazz",
        submodalities: [{ name: "Lírico" }],
      }),
    ).resolves.toMatchObject({ ok: false, code: "duplicate-name" });

    await expect(listModalities(event.id)).resolves.toMatchObject([
      { id: existing.id, name: "Jazz" },
    ]);
    await expect(listSubmodalities(event.id)).resolves.toEqual([]);
  });
});

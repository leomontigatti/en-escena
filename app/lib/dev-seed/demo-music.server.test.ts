import { describe, expect, test, vi } from "vitest";

import { removeOrphanedMusic } from "@/lib/dev-seed/demo-music.server";
import type { ChoreographyMusicStorage } from "@/lib/storage/choreography-music.server";

describe("removeOrphanedMusic", () => {
  // Their rows are already gone, so a file the loop skips is never found
  // again: one refusal must not leave the files after it behind.
  test("tries every file when one cannot be removed, and names the one left", async () => {
    const removed: string[] = [];
    const storage = {
      removeMusic: async (storageKey: string) => {
        if (storageKey === "b.wav") throw new Error("EACCES");
        removed.push(storageKey);
      },
    } as Pick<ChoreographyMusicStorage, "removeMusic">;
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    await removeOrphanedMusic(storage, ["a.wav", "b.wav", "c.wav"]);

    expect(removed).toEqual(["a.wav", "c.wav"]);
    expect(logged).toHaveBeenCalledWith(
      "[dev-seed:music:orphan]",
      expect.objectContaining({ storageKey: "b.wav", detail: "EACCES" }),
    );
    logged.mockRestore();
  });
});

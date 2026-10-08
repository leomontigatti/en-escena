import { afterEach, describe, expect, test, vi } from "vitest";

import { loadOptionalAssetDownloadUrl } from "./asset-download-url";

describe("optional asset download URL", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("logs an unreachable object before reading it as no file", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const url = await loadOptionalAssetDownloadUrl({
      createSignedUrl: async () => {
        throw new Error("EACCES: permission denied");
      },
      storageKey: "academy-1/dancer-1/front.jpg",
    });

    expect(url).toBeNull();
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith("[storage:signed-url:error]", {
      storageKey: "academy-1/dancer-1/front.jpg",
      error: expect.stringContaining("EACCES: permission denied"),
    });
  });
});

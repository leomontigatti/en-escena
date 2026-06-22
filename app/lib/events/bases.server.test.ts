import { afterEach, describe, expect, test, vi } from "vitest";

const listEventBasesData = vi.hoisted(() => vi.fn());
const listChoreographyRegistrationBaseOptionsData = vi.hoisted(() => vi.fn());

vi.mock("@/lib/events/bases-repository.server", () => ({
  listChoreographyRegistrationBaseOptionsData,
  listEventBasesData,
  resolveApplicablePrice: vi.fn(),
  resolveCompatibleScheduleCapacities: vi.fn(),
}));

describe("event bases service", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  test("loads choreography registration initial options through the slim repository query", async () => {
    const initialOptions = {
      modalities: [{ id: "mod-1", name: "Jazz" }],
      submodalities: [
        {
          id: "sub-1",
          name: "Jazz Funk",
          modalityId: "mod-1",
        },
      ],
    };
    listChoreographyRegistrationBaseOptionsData.mockResolvedValue(
      initialOptions,
    );

    const { getChoreographyRegistrationInitialOptions } =
      await import("@/lib/events/bases.server");

    await expect(
      getChoreographyRegistrationInitialOptions("event-1"),
    ).resolves.toEqual(initialOptions);
    expect(listChoreographyRegistrationBaseOptionsData).toHaveBeenCalledWith(
      "event-1",
    );
    expect(listEventBasesData).not.toHaveBeenCalled();
  });
});

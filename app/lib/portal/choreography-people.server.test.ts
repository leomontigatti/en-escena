import { beforeEach, describe, expect, test, vi } from "vitest";

const listDancerOptionsForChoreography = vi.fn();
const listProfessorOptionsForChoreography = vi.fn();
const resolveChoreographyDancers = vi.fn();
const updateChoreographyDancers = vi.fn();
const updateChoreographyProfessors = vi.fn();
const validateChoreographyProfessorSelection = vi.fn();

vi.mock("@/lib/portal/choreography-people-options.server", () => ({
  listDancerOptionsForChoreography,
  listProfessorOptionsForChoreography,
}));

vi.mock("@/lib/portal/choreography-people-dancer-update.server", () => ({
  resolveChoreographyDancers,
  updateChoreographyDancers,
}));

vi.mock("@/lib/portal/choreography-people-professor-update.server", () => ({
  updateChoreographyProfessors,
  validateChoreographyProfessorSelection,
}));

describe("updateChoreography", () => {
  beforeEach(() => {
    vi.resetModules();
    listDancerOptionsForChoreography.mockReset();
    listProfessorOptionsForChoreography.mockReset();
    resolveChoreographyDancers.mockReset();
    updateChoreographyDancers.mockReset();
    updateChoreographyProfessors.mockReset();
    validateChoreographyProfessorSelection.mockReset();
  });

  test("updates only profesores when bailarines stay unchanged", async () => {
    const { db } = await import("@/db");
    const select = vi
      .spyOn(db, "select")
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ dancerId: "dancer_1" }]),
        }),
      } as never)
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi
            .fn()
            .mockResolvedValue([{ professorId: "professor_existing" }]),
        }),
      } as never);

    updateChoreographyProfessors.mockResolvedValue({ ok: true });
    validateChoreographyProfessorSelection.mockResolvedValue({
      ok: true,
      professorIds: ["professor_new"],
    });

    const { updateChoreography } =
      await import("@/lib/portal/choreography-people.server");
    const result = await updateChoreography({
      academyId: "academy_1",
      choreographyId: "choreo_1",
      dancerIds: ["dancer_1"],
      eventId: "event_1",
      experienceLevelId: null,
      isRegistrationOpen: false,
      professorIds: ["professor_new"],
      scheduleCapacityId: null,
    });

    expect(result).toEqual({ ok: true });
    expect(updateChoreographyDancers).not.toHaveBeenCalled();
    expect(updateChoreographyProfessors).toHaveBeenCalledWith({
      academyId: "academy_1",
      choreographyId: "choreo_1",
      eventId: "event_1",
      professorIds: ["professor_new"],
    });

    select.mockRestore();
  });
});

import { beforeEach, describe, expect, test, vi } from "vitest";

const listDancerOptionsForChoreography = vi.fn();
const listProfessorOptionsForChoreography = vi.fn();

vi.mock("@/lib/portal/choreographies.server", () => ({
  listDancerOptionsForChoreography,
  listProfessorOptionsForChoreography,
}));

describe("loadCoreografiaPeopleEditorOptions", () => {
  beforeEach(() => {
    vi.resetModules();
    listDancerOptionsForChoreography.mockReset();
    listProfessorOptionsForChoreography.mockReset();
  });

  test("loads dancer and professor options in parallel", async () => {
    const started: string[] = [];
    const dancersDeferred = createDeferred<
      Array<{
        id: string;
        firstName: string;
        lastName: string;
        active: boolean;
      }>
    >();
    const professorsDeferred = createDeferred<
      Array<{
        id: string;
        firstName: string;
        lastName: string;
        active: boolean;
      }>
    >();

    listDancerOptionsForChoreography.mockImplementation(() => {
      started.push("dancers");
      return dancersDeferred.promise;
    });
    listProfessorOptionsForChoreography.mockImplementation(() => {
      started.push("professors");
      return professorsDeferred.promise;
    });

    const { loadCoreografiaPeopleEditorOptions } =
      await import("@/lib/portal/coreografia-detail.server");
    const pendingResult = loadCoreografiaPeopleEditorOptions({
      academyId: "academy_1",
      choreography: {
        id: "choreo_1",
        dancers: [{ id: "dancer_1" }],
        professors: [{ id: "professor_1" }],
      },
    });

    expect(started).toEqual(["professors", "dancers"]);
    expect(listProfessorOptionsForChoreography).toHaveBeenCalledWith(
      "academy_1",
      ["professor_1"],
    );
    expect(listDancerOptionsForChoreography).toHaveBeenCalledWith("academy_1", [
      "dancer_1",
    ]);

    professorsDeferred.resolve([
      {
        id: "professor_1",
        firstName: "Paula",
        lastName: "Docente",
        active: true,
      },
    ]);
    dancersDeferred.resolve([
      {
        id: "dancer_1",
        firstName: "Ana",
        lastName: "Paz",
        active: true,
      },
    ]);

    await expect(pendingResult).resolves.toEqual({
      availableDancers: [
        {
          id: "dancer_1",
          firstName: "Ana",
          lastName: "Paz",
          active: true,
        },
      ],
      availableProfessors: [
        {
          id: "professor_1",
          firstName: "Paula",
          lastName: "Docente",
          active: true,
        },
      ],
    });
  });
});

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
}

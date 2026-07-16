import { beforeEach, describe, expect, test, vi } from "vitest";

const requireAcademyUser = vi.fn();
const getPortalActiveEventReadinessContext = vi.fn();
const resolveChoreographyDancers = vi.fn();
const updateChoreography = vi.fn();
const listDancerOptionsForChoreography = vi.fn();
const listProfessorOptionsForChoreography = vi.fn();
const updateChoreographyMusic = vi.fn();
const deleteChoreography = vi.fn();
const safeParseChoreographyEdit = vi.fn();

vi.mock("@/lib/auth/internal-access.server", () => ({
  requireAcademyUser,
}));

vi.mock("@/lib/portal/event-context.server", () => ({
  getPortalActiveEventReadinessContext,
}));

vi.mock("@/lib/portal/choreographies.server", () => ({
  deleteChoreography,
}));

vi.mock("@/lib/portal/choreography-music.server", () => ({
  updateChoreographyMusic,
}));

vi.mock("@/lib/choreographies/choreography-roster.server", () => ({
  listDancerOptionsForChoreography,
  listProfessorOptionsForChoreography,
  resolveChoreographyDancers,
  updateChoreography,
}));

vi.mock("@/features/portal/choreographies/detail/roster-editor", () => ({
  choreographyEditSchema: {
    safeParse: safeParseChoreographyEdit,
  },
  choreographyMusicInvalidTypeMessage: "invalid music type",
  choreographyMusicMaxFileSizeMessage: "music too large",
  choreographyMusicPresentationBlockedMessage: "music blocked",
  choreographyMusicUploadErrorMessage: "music upload error",
  resolveChoreographyDancersIntent: "resolve-choreography-dancers",
  rosterEditorReviewMessage: "Revisá los datos",
  updateChoreographyIntent: "update-choreography",
}));

describe("portal choreography detail server", () => {
  beforeEach(() => {
    vi.resetModules();
    requireAcademyUser.mockReset();
    getPortalActiveEventReadinessContext.mockReset();
    resolveChoreographyDancers.mockReset();
    updateChoreography.mockReset();
    listDancerOptionsForChoreography.mockReset();
    listProfessorOptionsForChoreography.mockReset();
    updateChoreographyMusic.mockReset();
    deleteChoreography.mockReset();
    safeParseChoreographyEdit.mockReset();
  });

  test("returns a saved redirect for successful route updates without music changes", async () => {
    requireAcademyUser.mockResolvedValue({
      academy: { id: "academy_1" },
    });
    getPortalActiveEventReadinessContext.mockResolvedValue({
      isReadOnly: false,
      isRegistrationOpen: true,
      selectedEvent: { id: "event_1" },
    });
    safeParseChoreographyEdit.mockReturnValue({
      success: true,
      data: {
        dancerIds: ["dancer_1"],
        musicStorageKey: "",
        scheduleCapacityId: undefined,
      },
    });
    updateChoreography.mockResolvedValue({ ok: true });

    const { handlePortalChoreographyDetailRouteAction } =
      await import("@/features/portal/choreographies/detail/server");

    const formData = new FormData();
    formData.set("intent", "update-choreography");
    formData.append("dancerIds", "dancer_1");

    const response = await handlePortalChoreographyDetailRouteAction({
      params: { choreographyId: "choreo_1" },
      request: new Request("http://localhost/portal/coreografias/choreo_1", {
        method: "POST",
        body: formData,
      }),
    });

    expect(updateChoreography).toHaveBeenCalledWith({
      academyId: "academy_1",
      choreographyId: "choreo_1",
      dancerIds: ["dancer_1"],
      eventId: "event_1",
      experienceLevelId: null,
      isRegistrationOpen: true,
      professorIds: [],
      scheduleCapacityId: undefined,
    });
    expect(updateChoreographyMusic).not.toHaveBeenCalled();
    expect(response).toBeInstanceOf(Response);
    if (!(response instanceof Response)) {
      throw new Error("Expected a redirect Response.");
    }

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      "/portal/coreografias/choreo_1?notificacion=coreografia-guardada",
    );
  });

  test("returns dancer resolution data directly from the route action", async () => {
    requireAcademyUser.mockResolvedValue({
      academy: { id: "academy_1" },
    });
    getPortalActiveEventReadinessContext.mockResolvedValue({
      isReadOnly: false,
      isRegistrationOpen: true,
      selectedEvent: { id: "event_1" },
    });
    resolveChoreographyDancers.mockResolvedValue({
      ok: true,
      resolution: {
        schedule: {
          options: [],
          selectedScheduleCapacityId: "schedule_capacity_1",
          status: "keep-current",
        },
      },
    });

    const { handlePortalChoreographyDetailRouteAction } =
      await import("@/features/portal/choreographies/detail/server");

    const formData = new FormData();
    formData.set("intent", "resolve-choreography-dancers");
    formData.append("dancerIds", "dancer_1");

    await expect(
      handlePortalChoreographyDetailRouteAction({
        params: { choreographyId: "choreo_1" },
        request: new Request("http://localhost/portal/coreografias/choreo_1", {
          method: "POST",
          body: formData,
        }),
      }),
    ).resolves.toEqual({
      intent: "resolve-choreography-dancers",
      result: {
        ok: true,
        resolution: {
          schedule: {
            options: [],
            selectedScheduleCapacityId: "schedule_capacity_1",
            status: "keep-current",
          },
        },
      },
    });
  });

  test("returns a music update error without running choreography persistence", async () => {
    requireAcademyUser.mockResolvedValue({
      academy: { id: "academy_1" },
    });
    getPortalActiveEventReadinessContext.mockResolvedValue({
      isReadOnly: false,
      isRegistrationOpen: true,
      selectedEvent: { id: "event_1" },
    });

    const { handlePortalChoreographyDetailRouteAction } =
      await import("@/features/portal/choreographies/detail/server");

    const formData = new FormData();
    formData.set("intent", "update-choreography");
    formData.append("dancerIds", "dancer_1");
    formData.set("musicFileValidationError", "El archivo no es valido.");

    await expect(
      handlePortalChoreographyDetailRouteAction({
        params: { choreographyId: "choreo_1" },
        request: new Request("http://localhost/portal/coreografias/choreo_1", {
          method: "POST",
          body: formData,
        }),
      }),
    ).resolves.toEqual({
      status: "update-error",
      section: "music",
      message: "El archivo no es valido.",
      selectedDancerIds: ["dancer_1"],
      selectedMusicStorageKey: "",
      selectedProfessorIds: [],
      selectedExperienceLevelId: null,
      selectedScheduleCapacityId: undefined,
    });

    expect(updateChoreography).not.toHaveBeenCalled();
    expect(updateChoreographyMusic).not.toHaveBeenCalled();
  });

  test("returns dancer field errors when the submitted roster is invalid", async () => {
    requireAcademyUser.mockResolvedValue({
      academy: { id: "academy_1" },
    });
    getPortalActiveEventReadinessContext.mockResolvedValue({
      isReadOnly: false,
      isRegistrationOpen: true,
      selectedEvent: { id: "event_1" },
    });
    safeParseChoreographyEdit.mockReturnValue({
      success: false,
      error: {
        flatten: () => ({
          fieldErrors: {
            dancerIds: ["Seleccioná al menos un bailarín."],
            scheduleCapacityId: ["Elegí un cupo."],
          },
        }),
      },
    });

    const { handlePortalChoreographyDetailRouteAction } =
      await import("@/features/portal/choreographies/detail/server");

    const formData = new FormData();
    formData.set("intent", "update-choreography");

    await expect(
      handlePortalChoreographyDetailRouteAction({
        params: { choreographyId: "choreo_1" },
        request: new Request("http://localhost/portal/coreografias/choreo_1", {
          method: "POST",
          body: formData,
        }),
      }),
    ).resolves.toEqual({
      status: "update-error",
      section: "dancers",
      fieldErrors: {
        dancerIds: "Seleccioná al menos un bailarín.",
        scheduleCapacityId: "Elegí un cupo.",
      },
      message: "Revisá los datos",
      selectedDancerIds: [],
      selectedMusicStorageKey: "",
      selectedProfessorIds: [],
      selectedExperienceLevelId: null,
      selectedScheduleCapacityId: undefined,
    });

    expect(updateChoreography).not.toHaveBeenCalled();
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

    const { loadChoreographyRosterEditorOptions } =
      await import("@/features/portal/choreographies/detail/server");
    const pendingResult = loadChoreographyRosterEditorOptions({
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
  }, 15_000);
});

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });

  return { promise, resolve };
}

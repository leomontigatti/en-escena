/** @vitest-environment jsdom */

import {
  createMemoryRouter,
  RouterProvider,
  useActionData,
  useLoaderData,
} from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import type {
  PortalChoreographyMusicActionData,
  PortalChoreographyMusicLoaderData,
} from "@/features/portal/choreographies/detail/music-editor.shared";
import { PortalChoreographyDetailRouteView } from "@/features/portal/choreographies/detail/view";
import {
  clickReactDomButton,
  createReactDomTestRenderer,
  getButton,
  updateReactDomForm,
} from "@/lib/test-support/react-dom";

const storedMusicUrl = "/almacenamiento?key=music.mp3";

function loaderData(): PortalChoreographyMusicLoaderData {
  const event = {
    active: true,
    endsAt: new Date("2026-11-30T12:00:00Z"),
    id: "event_1",
    name: "Evento Activo",
    startsAt: new Date("2026-11-26T12:00:00Z"),
  };

  return {
    choreography: {
      categoryId: "category_1",
      categoryName: "Juvenil",
      choreographyNumber: 1,
      dancers: [],
      experienceLevelId: null,
      experienceLevelName: null,
      groupType: "solo",
      id: "choreo_1",
      isEvaluated: false,
      isWithdrawn: false,
      modalityName: "Jazz",
      // A replacement keeps the key: the new song is stored at the same path.
      musicDownloadUrl: storedMusicUrl,
      musicStorageKey: "music/choreo_1.mp3",
      name: "Coreografía",
      operationalStatus: { code: "complete", pendingItems: [] },
      professors: [],
      requiresExperienceLevel: false,
      scheduleCapacityId: "schedule_1",
      scheduleLabel: "2026-11-26 · 10:00",
      scheduleName: "Bloque mañana",
      submodalityName: null,
    },
    eventContext: {
      activeEvent: event,
      activeEventRegistrationReadiness: {
        eventId: "event_1",
        isReady: true,
        missingItems: [],
      },
      hasActiveEvent: true,
      hasEvents: true,
      isReadOnly: false,
      isRegistrationOpen: true,
      selectedEvent: event,
    },
  };
}

function MusicEditorRoute() {
  return (
    <PortalChoreographyDetailRouteView
      actionData={useActionData() as PortalChoreographyMusicActionData}
      loaderData={useLoaderData() as PortalChoreographyMusicLoaderData}
    />
  );
}

describe("replacing a choreography's music", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(() => {
    renderer.cleanup();
    Reflect.deleteProperty(URL, "createObjectURL");
  });

  test("comes back to the stored song once the replacement is saved", async () => {
    // jsdom has no `createObjectURL`; a browser hands back a `blob:` link.
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: () => "blob:tema",
    });
    const router = createMemoryRouter(
      [
        {
          action: () => ({
            message: "Coreografía guardada.",
            status: "success",
          }),
          element: <MusicEditorRoute />,
          loader: loaderData,
          path: "/portal/coreografias/choreo_1",
        },
      ],
      { initialEntries: ["/portal/coreografias/choreo_1"] },
    );
    await renderer.renderAsync(<RouterProvider router={router} />);

    await clickReactDomButton("Borrar música");
    const input = document.querySelector<HTMLInputElement>(
      'input[name="musicFile"]',
    );
    await updateReactDomForm(() => {
      Object.defineProperty(input, "files", {
        configurable: true,
        value: [new File(["song"], "tema.mp3", { type: "audio/mpeg" })],
      });
      input?.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(document.querySelector("audio")?.getAttribute("src")).toBe(
      "blob:tema",
    );

    await clickReactDomButton("Guardar");
    await updateReactDomForm(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(document.querySelector("audio")?.getAttribute("src")).toBe(
      storedMusicUrl,
    );
    expect(
      document.querySelector('a[aria-label="Descargar música"]'),
    ).not.toBeNull();
    expect(getButton("Guardar").disabled).toBe(true);
  });
});

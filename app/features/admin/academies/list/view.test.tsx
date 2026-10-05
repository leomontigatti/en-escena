/** @vitest-environment jsdom */

import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, test } from "vitest";

import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

import { AcademiesListRouteView } from "./view";

type LoaderData = Parameters<typeof AcademiesListRouteView>[0]["loaderData"];

const loaderData: LoaderData = {
  academies: [
    {
      contactName: "Mario Ruiz",
      dataStatus: "incomplete",
      id: "academy-old",
      isParticipating: false,
      name: "Academia Antigua",
    },
    {
      contactName: "Carla Gómez",
      dataStatus: "complete",
      id: "academy-demo",
      isParticipating: true,
      name: "Academia Demo",
    },
  ],
  canWrite: true,
  selectedEventId: "event-1",
};

describe("the academies list", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  async function listedAt(search: string) {
    const router = createMemoryRouter(
      [
        {
          path: "/administracion/academias",
          element: <AcademiesListRouteView loaderData={loaderData} />,
        },
      ],
      { initialEntries: [`/administracion/academias${search}`] },
    );

    await renderer.renderAsync(<RouterProvider router={router} />);

    return [
      ...document.querySelectorAll('a[href^="/administracion/academias/"]'),
    ].map((link) => link.textContent);
  }

  test.each([
    ["?datos=incompleta", ["Academia Antigua"]],
    ["?datos=completa", ["Academia Demo"]],
    ["?participando=si&datos=completa", ["Academia Demo"]],
    ["?participando=si&datos=incompleta", []],
  ])("narrows to the academies %s asks for", async (search, names) => {
    expect(await listedAt(search)).toEqual(names);
  });
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { db } from "@/db";
import { dancers } from "@/db/schema";
import { createEventChoreographyFixture } from "@/lib/events/bases.test-support";
import { routeArgs } from "@/lib/admin/test-support/route";
import { renderInDataRouter } from "@/lib/test-support/data-router";
import { DancerDetailRouteView } from "@/routes/administracion.bailarines_.$dancerId";

export function listRouteArgs(request: Request) {
  return routeArgs(request, "/administracion/bailarines");
}

export function detailRouteArgs(request: Request, dancerId: string) {
  return routeArgs(request, "/administracion/bailarines/:dancerId", {
    dancerId,
  });
}

export function renderDetailRoute(
  loaderData: Parameters<typeof DancerDetailRouteView>[0]["loaderData"],
  dancerId: string,
) {
  return renderToStaticMarkup(
    renderInDataRouter(
      `/administracion/bailarines/${dancerId}`,
      createElement(DancerDetailRouteView, { loaderData }),
    ),
  );
}

export async function createDancer(input: {
  academyId: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  active?: boolean;
  documentType?: "dni" | "passport" | "other" | null;
  documentNumber?: string | null;
  documentFrontImageStorageKey?: string | null;
  documentBackImageStorageKey?: string | null;
  identityVerifiedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  const [dancer] = await db
    .insert(dancers)
    .values({
      academyId: input.academyId,
      firstName: input.firstName,
      lastName: input.lastName,
      birthDate: input.birthDate,
      active: input.active ?? true,
      documentType: input.documentType ?? null,
      documentNumber: input.documentNumber ?? null,
      documentFrontImageStorageKey: input.documentFrontImageStorageKey ?? null,
      documentBackImageStorageKey: input.documentBackImageStorageKey ?? null,
      identityVerifiedAt: input.identityVerifiedAt ?? null,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    })
    .returning();

  return dancer;
}

export async function linkDancerToEventChoreography(input: {
  eventId: string;
  academyId: string;
  dancerId: string;
  choreographyName: string;
  groupType?: "solo" | "duo" | "trio" | "grupal";
}) {
  return createEventChoreographyFixture({
    eventId: input.eventId,
    academyId: input.academyId,
    name: input.choreographyName,
    groupType: input.groupType,
    dancerIds: [input.dancerId],
  });
}

import { and, eq, isNull } from "drizzle-orm";
import { expect } from "vitest";

import { db } from "@/db";
import { prices } from "@/db/schema";
import type { GroupType } from "@/lib/events/group-types";

import {
  action,
  buildScheduleDraft,
  createEventScheduleAdminFixture,
  createScheduleAdminRequest,
  createSignedInRequest,
  expectThrownResponse,
  findSavedScheduleByName,
  formData,
  routeArgs,
} from "./event-bases.test-helpers";

type PriceDraft = {
  amount: string;
  groupType: string;
  isSpecialPrice?: string;
  name: string;
  paymentDeadline: string;
  scheduleId: string;
};

type SignedInAdminRequestInput = Parameters<typeof createSignedInRequest>[0];

type CreatePriceAdminRequestInput = Omit<SignedInAdminRequestInput, "body"> & {
  intent: "create-price";
  price?: Partial<PriceDraft>;
};

type UpdatePriceAdminRequestInput = Omit<SignedInAdminRequestInput, "body"> & {
  intent: "update-price";
  price?: Partial<PriceDraft>;
  priceId: string;
};

export async function createEventPriceAdminFixture() {
  const { event, modalities } = await createEventScheduleAdminFixture(["Jazz"]);
  const scheduleRequest = await createScheduleAdminRequest({
    email: "admin.precio.cronograma.fixture@example.com",
    role: "admin",
    requestUrl: `http://localhost/administracion/cronogramas?evento=${event.id}`,
    intent: "create-schedule",
    schedule: buildScheduleDraft({
      modalityIds: [modalities[0].id],
    }),
  });

  await expectThrownResponse(action(routeArgs(scheduleRequest.request)), 302);

  const schedule = await findSavedScheduleByName("Sábado Mañana");

  if (!schedule) {
    throw new Error("Expected price schedule fixture to be created.");
  }

  return { event, modality: modalities[0], schedule };
}

function buildPriceDraft(overrides: Partial<PriceDraft> = {}): PriceDraft {
  return {
    name: "Precio base",
    isSpecialPrice: "",
    groupType: "solo",
    amount: "12000",
    paymentDeadline: "2026-05-31",
    scheduleId: "",
    ...overrides,
  };
}

export async function createPriceAdminRequest(
  input: CreatePriceAdminRequestInput | UpdatePriceAdminRequestInput,
) {
  const price = buildPriceDraft(input.price);
  const body = formDataWithPrice(input.intent, price);

  if (input.intent === "update-price") {
    body.set("id", input.priceId);
  }

  return createSignedInRequest({
    ...input,
    body,
  });
}

export async function createDeletePriceAdminRequest(
  input: Omit<SignedInAdminRequestInput, "body"> & {
    confirmDeletion?: string;
    priceId: string;
  },
) {
  const body = formData({
    intent: "delete-price",
    id: input.priceId,
  });

  if (input.confirmDeletion) {
    body.set("confirmDeletion", input.confirmDeletion);
  }

  return createSignedInRequest({
    ...input,
    body,
  });
}

export async function findSavedPriceById(priceId: string) {
  return db.query.prices.findFirst({
    where: eq(prices.id, priceId),
  });
}

export async function findSavedPriceByScope(input: {
  groupType: GroupType;
  paymentDeadline: string;
  scheduleId: string | null;
}) {
  return db.query.prices.findFirst({
    where: and(
      eq(prices.groupType, input.groupType),
      eq(prices.paymentDeadline, input.paymentDeadline),
      input.scheduleId === null
        ? isNull(prices.scheduleId)
        : eq(prices.scheduleId, input.scheduleId),
    ),
  });
}

export function expectPriceSavedRedirect(response: Response) {
  expect(response.headers.get("location")).toMatch(
    /\/administracion\/precios\/[^?]+\?notificacion=precio-guardado/,
  );
}

export function expectPriceDeletedRedirect(response: Response) {
  expect(response.headers.get("location")).toBe(
    "/administracion/precios?notificacion=precio-eliminado",
  );
}

function formDataWithPrice(
  intent: "create-price" | "update-price",
  price: PriceDraft,
): FormData {
  return formData({
    intent,
    name: price.name,
    isSpecialPrice: price.isSpecialPrice ?? "",
    groupType: price.groupType,
    amount: price.amount,
    paymentDeadline: price.paymentDeadline,
    scheduleId: price.scheduleId,
  });
}

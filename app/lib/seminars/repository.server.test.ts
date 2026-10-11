import { describe, expect, test } from "vitest";

import {
  createSeminar,
  updateSeminar,
  type SeminarInput,
} from "@/lib/seminars/repository.server";

const seminarInput: SeminarInput = {
  instructorName: "Abril Sosa",
  scheduledDate: "2026-10-10",
  startTime: "18:30",
  quota: 20,
  kind: "regular",
  requiredDepositPercentage: 50,
};

// Each refusal answers before the conflict check or the row lock: a write that
// reached the database would throw here, where none is configured.
describe("seminar input refusals", () => {
  test("refuses an empty instructor name, an invalid moment and a quota below one", async () => {
    const eventId = crypto.randomUUID();

    await expect(
      createSeminar(eventId, { ...seminarInput, instructorName: "   " }),
    ).resolves.toMatchObject({
      ok: false,
      code: "invalid-seminar",
      fieldErrors: { instructorName: "Ingresá el nombre del instructor." },
    });
    await expect(
      createSeminar(eventId, { ...seminarInput, scheduledDate: "2026-13-40" }),
    ).resolves.toMatchObject({
      ok: false,
      fieldErrors: { scheduledDate: "Este campo es obligatorio." },
    });
    await expect(
      createSeminar(eventId, { ...seminarInput, startTime: "25:00" }),
    ).resolves.toMatchObject({
      ok: false,
      fieldErrors: { startTime: "Este campo es obligatorio." },
    });
    await expect(
      createSeminar(eventId, { ...seminarInput, quota: 0 }),
    ).resolves.toMatchObject({
      ok: false,
      fieldErrors: { quota: "Ingresá un cupo mayor a cero." },
    });
  });

  test("refuses a deposit rate outside 1 and 99", async () => {
    for (const requiredDepositPercentage of [0, 100, 50.5]) {
      await expect(
        updateSeminar(crypto.randomUUID(), {
          ...seminarInput,
          requiredDepositPercentage,
        }),
      ).resolves.toMatchObject({
        ok: false,
        code: "invalid-seminar",
        fieldErrors: {
          requiredDepositPercentage:
            "La seña del seminario debe ser un entero entre 1 y 99.",
        },
      });
    }
  });
});

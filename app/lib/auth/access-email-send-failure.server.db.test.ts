import { like } from "drizzle-orm";
import { RouterContextProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { db } from "@/db";
import { unexpectedErrors, verification } from "@/db/schema";
import { getSetCookieValues } from "@/lib/auth/set-cookie-headers";
import { createIndividualUser } from "@/lib/test-support/individuals";
import { action as recoveryAction } from "@/routes/recuperar-acceso";
import { action as registrationAction } from "@/routes/registro";

import { installDatabaseTestHooks } from "../../../tests/db/harness";

const resendSendMock = vi.hoisted(() => vi.fn());

// The provider is the boundary: `sendEmail` runs its production path against
// a Resend that refuses. A `function` expression, so `new Resend()` works.
vi.mock("resend", () => ({
  Resend: vi.fn(function ResendMock() {
    return { emails: { send: resendSendMock } };
  }),
}));

const NEW_EMAIL = "nueva@example.com";
const EXISTING_EMAIL = "existente@example.com";

installDatabaseTestHooks();

// #1810: when the email provider fails, the public response must not tell an
// address with an account from one without (docs/domain/access.md).
describe("access emails when the provider fails (#1810)", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ENVIRONMENT", "");
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM", "En Escena <acceso@example.com>");
    resendSendMock.mockReset();
    // Resend's free-text message can quote the request; it must not reach a log.
    resendSendMock.mockImplementation(async ({ to }: { to: string }) => ({
      data: null,
      error: {
        name: "application_error",
        statusCode: 503,
        message: `Could not deliver to ${to}`,
      },
    }));
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
    vi.unstubAllEnvs();
  });

  test("registration answers a new and an existing address alike", async () => {
    await createIndividualUser({ email: EXISTING_EMAIL });

    const forNewAddress = await register(NEW_EMAIL);
    const forExistingAddress = await register(EXISTING_EMAIL);

    expect(resendSendMock).toHaveBeenCalledTimes(1);
    expect(publicResponse(forNewAddress)).toEqual(
      publicResponse(forExistingAddress),
    );
    expect(publicResponse(forNewAddress)).toMatchObject({ status: "success" });
    await expectOneSendFailureReported("signUpConfirmation");
  });

  test("recovery answers an eligible and an ineligible address alike", async () => {
    await createIndividualUser({ email: EXISTING_EMAIL });

    const forEligibleAddress = await requestRecovery(EXISTING_EMAIL);
    const forIneligibleAddress = await requestRecovery(NEW_EMAIL);

    expect(resendSendMock).toHaveBeenCalledTimes(1);
    expect(publicResponse(forEligibleAddress)).toEqual(
      publicResponse(forIneligibleAddress),
    );
    expect(publicResponse(forEligibleAddress)).toMatchObject({
      status: "success",
    });
    await expectOneSendFailureReported("accessRecovery");
  });

  test("a registration retried after a failed send leaves one pending sign-up", async () => {
    await register(NEW_EMAIL);
    resendSendMock.mockResolvedValueOnce({
      data: { id: "email_id" },
      error: null,
    });
    await register(NEW_EMAIL);

    const pendingSignUps = await db.query.verification.findMany({
      columns: { identifier: true, value: true },
      where: like(verification.identifier, "academy-signup:%"),
    });

    expect(pendingSignUps).toHaveLength(1);
    expect(pendingSignUps[0]!.value).toContain(NEW_EMAIL);
    expect(resendSendMock.mock.lastCall?.[0].text).toContain(
      pendingSignUps[0]!.identifier.slice("academy-signup:".length),
    );
  });

  // The visitor is told the email left, so the failure also goes where an
  // unhandled one would: a row of `unexpected_error`, which alerts.
  async function expectOneSendFailureReported(kind: string) {
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError).toHaveBeenCalledWith("[auth:email:not-sent]", {
      kind,
      error: expect.stringContaining("Email provider failed to send message"),
    });
    const recorded = await db.select().from(unexpectedErrors);
    expect(recorded).toEqual([
      expect.objectContaining({
        source: "server",
        stack: expect.stringContaining("Email provider failed to send message"),
      }),
    ]);
    const reported = JSON.stringify([consoleError.mock.calls, recorded]);
    expect(reported).not.toContain(NEW_EMAIL);
    expect(reported).not.toContain(EXISTING_EMAIL);
  }
});

type ActionResult = {
  data: Record<string, unknown> & { values: Record<string, string> };
  init: ResponseInit | null;
};

// What a visitor gets back, without the address they typed, which the form
// echoes either way.
function publicResponse(result: unknown) {
  const {
    data: { values: _values, ...data },
    init,
  } = result as ActionResult;

  return {
    ...data,
    setCookies: getSetCookieValues(new Headers(init?.headers)),
  };
}

async function register(email: string) {
  const formData = new FormData();
  formData.set("email", email);
  formData.set("password", "password-segura");
  formData.set("confirmPassword", "password-segura");

  return await registrationAction({
    url: new URL("http://localhost/registro"),
    pattern: "/registro",
    request: new Request("http://localhost/registro", {
      method: "POST",
      body: formData,
    }),
    params: {},
    context: new RouterContextProvider(),
  });
}

async function requestRecovery(email: string) {
  const formData = new FormData();
  formData.set("email", email);

  return await recoveryAction({
    url: new URL("http://localhost/recuperar-acceso"),
    pattern: "/recuperar-acceso",
    request: new Request("http://localhost/recuperar-acceso", {
      method: "POST",
      body: formData,
    }),
    params: {},
    context: new RouterContextProvider(),
  });
}

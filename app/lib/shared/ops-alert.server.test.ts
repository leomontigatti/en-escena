import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { createOpsAlertSender } from "./ops-alert.server";

let consoleError: ReturnType<typeof vi.spyOn>;
let consoleInfo: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  consoleInfo = vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const configured = {
  TELEGRAM_BOT_TOKEN: "123456:secret-bot-token",
  TELEGRAM_CHAT_ID: "-1001234567890",
};

function okFetch() {
  return vi.fn<typeof fetch>(async () => Response.json({ ok: true }));
}

describe("createOpsAlertSender", () => {
  test("posts the text to the configured chat through the Bot API", async () => {
    const fetchFake = okFetch();
    const send = createOpsAlertSender({
      environment: configured,
      fetch: fetchFake,
    });

    await expect(send("server error on /administracion")).resolves.toBe(true);

    expect(fetchFake).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFake.mock.calls[0];
    expect(url).toBe(
      "https://api.telegram.org/bot123456:secret-bot-token/sendMessage",
    );
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      chat_id: "-1001234567890",
      text: "server error on /administracion",
      link_preview_options: { is_disabled: true },
    });
  });

  test("posts to the topic when one is configured", async () => {
    const fetchFake = okFetch();
    const send = createOpsAlertSender({
      environment: { ...configured, TELEGRAM_TOPIC_ID: "42" },
      fetch: fetchFake,
    });

    await send("text");

    const body = JSON.parse(String(fetchFake.mock.calls[0][1]?.body));
    expect(body.message_thread_id).toBe(42);
  });

  test("posts to the chat itself when the topic is not a number", async () => {
    const fetchFake = okFetch();
    const send = createOpsAlertSender({
      environment: { ...configured, TELEGRAM_TOPIC_ID: "general" },
      fetch: fetchFake,
    });

    await send("text");

    const body = JSON.parse(String(fetchFake.mock.calls[0][1]?.body));
    expect(body).not.toHaveProperty("message_thread_id");
  });

  test("sends nothing and says so once when a variable is unset", async () => {
    const fetchFake = okFetch();
    const send = createOpsAlertSender({
      environment: { TELEGRAM_BOT_TOKEN: configured.TELEGRAM_BOT_TOKEN },
      fetch: fetchFake,
    });

    await expect(send("first")).resolves.toBe(false);
    await send("second");

    expect(fetchFake).not.toHaveBeenCalled();
    expect(consoleInfo).toHaveBeenCalledTimes(1);
    expect(String(consoleInfo.mock.calls[0][0])).toMatch(
      /^\[ops-alert:disabled\]/,
    );
  });

  test.each([
    [
      "a refused post",
      async () => new Response("Bad Request", { status: 400 }),
    ],
    [
      "an unreachable API",
      async () => {
        throw new TypeError("fetch failed");
      },
    ],
  ])("logs %s without the token and never throws", async (_label, reply) => {
    const send = createOpsAlertSender({
      environment: configured,
      fetch: vi.fn<typeof fetch>(reply),
    });

    await expect(send("text")).resolves.toBe(false);

    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(String(consoleError.mock.calls[0][0])).toBe("[ops-alert:failed]");
    expect(JSON.stringify(consoleError.mock.calls[0])).not.toContain(
      "secret-bot-token",
    );
  });

  test("cuts a text longer than Telegram accepts", async () => {
    const fetchFake = okFetch();
    const send = createOpsAlertSender({
      environment: configured,
      fetch: fetchFake,
    });

    await send("x".repeat(5000));

    const body = JSON.parse(String(fetchFake.mock.calls[0][1]?.body));
    expect(body.text.length).toBeLessThanOrEqual(4096);
  });
});

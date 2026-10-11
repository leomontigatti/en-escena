import { describeErrorStack } from "@/lib/shared/unexpected-error-log";

type OpsAlertEnvironment = {
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  TELEGRAM_TOPIC_ID?: string;
};

// Whether the message was delivered, so a caller can retry on the next error.
type SendOpsAlert = (text: string) => Promise<boolean>;

// The Bot API refuses a message over 4096 characters.
const MAX_TEXT_LENGTH = 4096;
// An alert is sent from the error path: a slow API must not hold it open.
const SEND_TIMEOUT_MS = 5000;

/**
 * The sender for operations alerts: a message from the ops bot to the
 * Telegram chat (and topic, when set) Coolify already notifies. With a
 * variable unset (local, tests, staging) it sends nothing and says so once.
 * It never throws: a failed post is logged and dropped, since the alert is
 * the report of a failure, not something that may cause one.
 */
function createOpsAlertSender({
  environment,
  fetch,
}: {
  environment: OpsAlertEnvironment;
  fetch: typeof globalThis.fetch;
}): SendOpsAlert {
  const token = environment.TELEGRAM_BOT_TOKEN;
  const chatId = environment.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    let announced = false;

    return async () => {
      if (!announced) {
        announced = true;
        console.info(
          "[ops-alert:disabled] TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is unset; alerts are not sent",
        );
      }

      return false;
    };
  }

  const topicId = readTopicId(environment.TELEGRAM_TOPIC_ID);

  return async (text) => {
    try {
      const response = await fetch(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            ...(topicId === undefined ? {} : { message_thread_id: topicId }),
            text: text.slice(0, MAX_TEXT_LENGTH),
            link_preview_options: { is_disabled: true },
          }),
          signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
        },
      );

      if (!response.ok) {
        console.error("[ops-alert:failed]", { status: response.status });
      }

      return response.ok;
    } catch (thrown) {
      // A network error's message names the host, never the URL's path, so
      // the token stays out of the line.
      console.error("[ops-alert:failed]", {
        error: describeErrorStack(thrown).split("\n")[0],
      });

      return false;
    }
  };
}

// A topic id that is not an integer would reach the API as `null` and get
// every message refused; posting to the chat itself is the better fallback.
function readTopicId(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const topicId = Number(value);

  if (!Number.isInteger(topicId)) {
    console.error(
      "[ops-alert:topic-ignored] TELEGRAM_TOPIC_ID is not an integer",
    );
    return undefined;
  }

  return topicId;
}

/** The process's one sender, so the unset case is announced once. */
const sendOpsAlert = createOpsAlertSender({
  environment: process.env,
  fetch: (...args) => globalThis.fetch(...args),
});

export { createOpsAlertSender, sendOpsAlert };
export type { SendOpsAlert };

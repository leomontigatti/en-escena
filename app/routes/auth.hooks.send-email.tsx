import { handleSupabaseSendEmailHook } from "@/lib/auth/send-email-hook.server";

import type { Route } from "./+types/auth.hooks.send-email";

export async function action({ request }: Route.ActionArgs) {
  try {
    return await handleSupabaseSendEmailHook(request);
  } catch (error) {
    console.error(
      "[supabase-auth-email-hook:error]",
      serializeHookError(error),
    );

    return new Response(
      JSON.stringify({
        error: {
          message: "Supabase auth email hook failed.",
        },
      }),
      {
        headers: {
          "content-type": "application/json",
        },
        status: 401,
      },
    );
  }
}

export function loader() {
  return new Response("Method not allowed", { status: 405 });
}

function serializeHookError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
    };
  }

  return {
    message: String(error),
    name: "HookError",
  };
}

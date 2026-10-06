import { afterEach, describe, expect, test } from "vitest";

import { loader } from "./root";

function loaderArgs(request: Request) {
  return {
    request,
    params: {},
    context: {},
  } as unknown as Parameters<typeof loader>[0];
}

const originalAppEnvironment = process.env.APP_ENVIRONMENT;

describe("root staging flag", () => {
  afterEach(() => {
    if (originalAppEnvironment === undefined) {
      delete process.env.APP_ENVIRONMENT;
    } else {
      process.env.APP_ENVIRONMENT = originalAppEnvironment;
    }
  });

  test("marks every page as staging in the staging environment", async () => {
    process.env.APP_ENVIRONMENT = "staging";

    const result = await loader(
      loaderArgs(new Request("http://localhost/ingresar")),
    );

    expect(result.data.isStaging).toBe(true);
  });

  test("leaves production unmarked", async () => {
    delete process.env.APP_ENVIRONMENT;

    const result = await loader(
      loaderArgs(new Request("http://localhost/ingresar")),
    );

    expect(result.data.isStaging).toBe(false);
  });
});

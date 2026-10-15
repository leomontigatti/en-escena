import { describe, expect, test } from "vitest";

import { readFormData } from "./read-form-data";

function post(body: BodyInit, contentType?: string) {
  return new Request("http://localhost/ingresar", {
    method: "POST",
    body,
    headers: contentType ? { "content-type": contentType } : {},
  });
}

describe("readFormData", () => {
  test("reads a form body", async () => {
    const formData = new FormData();
    formData.set("email", "academia@example.com");

    const read = await readFormData(post(formData));

    expect(read.get("email")).toBe("academia@example.com");
  });

  test.each([
    ["JSON", JSON.stringify({ email: "a@b.c" }), "application/json"],
    ["plain text", "email=a@b.c", "text/plain"],
    ["a multipart body without its boundary", "x", "multipart/form-data"],
  ])(
    "refuses %s with a 400, which is a refusal and not a failure",
    async (_label, body, contentType) => {
      const refusal = await readFormData(post(body, contentType)).catch(
        (error: unknown) => error,
      );

      expect(refusal).toBeInstanceOf(Response);
      expect((refusal as Response).status).toBe(400);
    },
  );

  test("leaves a body read twice to fail, since that is our bug and not the sender's", async () => {
    const request = post(new FormData());
    await request.formData();

    const failure = await readFormData(request).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(TypeError);
  });
});

// @vitest-environment jsdom

import { useForm } from "react-hook-form";
import { afterEach, describe, expect, test } from "vitest";

import { TextInputField } from "@/components/shared/text-input-field";
import {
  clickReactDomButton,
  createReactDomTestRenderer,
} from "@/lib/test-support/react-dom";

type TestFormValues = {
  password: string;
};

function TestPasswordField({ disabled = false }: { disabled?: boolean }) {
  const form = useForm<TestFormValues>({
    defaultValues: { password: "" },
  });

  return (
    <TextInputField
      control={form.control}
      disabled={disabled}
      id="password"
      label="Contraseña"
      name="password"
      type="password"
    />
  );
}

function readPasswordInput() {
  const input = document.getElementById("password");
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("Expected the password input to be rendered.");
  }
  return input;
}

describe("TextInputField password visibility", () => {
  const renderer = createReactDomTestRenderer();

  afterEach(renderer.cleanup);

  test("hides the password until the reader asks to see it", async () => {
    await renderer.renderAsync(<TestPasswordField />);

    expect(readPasswordInput().type).toBe("password");

    await clickReactDomButton("Mostrar contraseña");

    expect(readPasswordInput().type).toBe("text");

    await clickReactDomButton("Ocultar contraseña");

    expect(readPasswordInput().type).toBe("password");
  });

  test("renders no toggle on a locked field", async () => {
    await renderer.renderAsync(<TestPasswordField disabled />);

    expect(document.querySelector("button")).toBeNull();
    expect(readPasswordInput().disabled).toBe(true);
  });
});

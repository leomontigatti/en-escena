import { act } from "react";
import { expect, vi } from "vitest";

export function spyOnNativeFormSubmit() {
  return vi
    .spyOn(HTMLFormElement.prototype, "submit")
    .mockImplementation(() => {});
}

export async function requestSubmitWithButton(
  form: HTMLFormElement,
  submitButton: HTMLButtonElement,
) {
  await act(async () => {
    form.requestSubmit(submitButton);
    await Promise.resolve();
  });
}

export function expectReactRouterSubmit(input: {
  action: string;
  nativeSubmitSpy: ReturnType<typeof spyOnNativeFormSubmit>;
  submitButton: HTMLButtonElement;
  submitSpy: ReturnType<typeof vi.fn>;
}) {
  expect(input.nativeSubmitSpy).not.toHaveBeenCalled();
  expect(input.submitSpy).toHaveBeenCalledTimes(1);
  expect(input.submitSpy).toHaveBeenCalledWith(
    input.submitButton,
    expect.objectContaining({
      action: input.action,
      method: "post",
    }),
  );
}

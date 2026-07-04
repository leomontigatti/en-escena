import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

function createReactDomTestRenderer() {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  function ensureRoot() {
    if (root) {
      return;
    }

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  }

  function render(element: ReactNode) {
    ensureRoot();

    act(() => {
      root?.render(element);
    });
  }

  async function renderAsync(element: ReactNode) {
    ensureRoot();

    await act(async () => {
      root?.render(element);
    });
  }

  function cleanup() {
    if (root) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }

    container?.remove();
    container = null;
    document.body.innerHTML = "";
  }

  return {
    cleanup,
    getContainer() {
      if (!container) {
        throw new Error("Expected React DOM test container to be mounted.");
      }

      return container;
    },
    render,
    renderAsync,
  };
}

async function updateReactDomForm(callback: () => void | Promise<void>) {
  await act(async () => {
    await callback();
    await Promise.resolve();
  });
}

function setInputValue(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;

  valueSetter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function getButton(label: string) {
  const button = findButton(label);

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Expected button "${label}" to be rendered.`);
  }

  return button;
}

async function clickReactDomButton(
  label: string,
  options: { exact?: boolean } = {},
) {
  const button = findButton(label, options);

  if (!button) {
    throw new Error(`Expected button "${label}" to be rendered.`);
  }

  await act(async () => {
    button.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      }),
    );
    await Promise.resolve();
  });
}

function findButton(label: string, options: { exact?: boolean } = {}) {
  return Array.from(document.querySelectorAll("button")).find((candidate) => {
    const text = candidate.textContent?.trim();
    const ariaLabel = candidate.getAttribute("aria-label");

    if (options.exact) {
      return text === label || ariaLabel === label;
    }

    return text?.includes(label) || ariaLabel === label;
  });
}

export {
  clickReactDomButton,
  createReactDomTestRenderer,
  getButton,
  setInputValue,
  updateReactDomForm,
};

import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

/** What {@link createReactDomTestRenderer} hands back, for helpers that take one. */
type ReactDomTestRenderer = ReturnType<typeof createReactDomTestRenderer>;

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

type FindButtonOptions = {
  exact?: boolean;
  /** Where to look, when a label is not unique on the page: a dialog's
   * `Cancelar` next to the form's own. */
  within?: ParentNode | null;
};

async function clickReactDomButton(
  label: string,
  options: FindButtonOptions = {},
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

function findButton(label: string, options: FindButtonOptions = {}) {
  const scope = options.within ?? document;

  return Array.from(scope.querySelectorAll("button")).find((candidate) => {
    const text = candidate.textContent?.trim();
    const ariaLabel = candidate.getAttribute("aria-label");

    if (options.exact) {
      return text === label || ariaLabel === label;
    }

    return text?.includes(label) || ariaLabel === label;
  });
}

/**
 * Waits for the page to reach a state, for an outcome that arrives when its
 * request does: a saved form, a refusal, a toast. A fixed pause in its place
 * passes on an idle machine and fails when the full suite saturates the
 * workers (#1338).
 */
async function waitFor(check: () => boolean) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (check()) {
      return;
    }

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }

  throw new Error("The page never reached the expected state.");
}

/** The text of every element matching `selector`, in document order. */
function getReactDomTexts(selector: string) {
  return Array.from(document.querySelectorAll(selector)).map(
    (element) => element.textContent,
  );
}

export {
  clickReactDomButton,
  createReactDomTestRenderer,
  findButton,
  getButton,
  getReactDomTexts,
  setInputValue,
  updateReactDomForm,
  waitFor,
};
export type { ReactDomTestRenderer };

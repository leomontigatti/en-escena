if (typeof window !== "undefined") {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  const testWindow = window as Window &
    typeof globalThis & {
      $RefreshReg$?: (type: unknown, id: string) => void;
      $RefreshSig$?: () => (type: unknown) => unknown;
      __vite_plugin_react_preamble_installed__?: boolean;
    };
  testWindow.__vite_plugin_react_preamble_installed__ = true;
  testWindow.$RefreshReg$ = () => {};
  testWindow.$RefreshSig$ = () => (type) => type;
  globalThis.FormData = window.FormData;
  globalThis.URLSearchParams = window.URLSearchParams;

  window.matchMedia ??= (() => ({
    addEventListener() {},
    addListener() {},
    dispatchEvent() {
      return false;
    },
    matches: false,
    media: "",
    onchange: null,
    removeEventListener() {},
    removeListener() {},
  })) as typeof window.matchMedia;

  class ResizeObserverMock {
    disconnect() {}
    observe() {}
    unobserve() {}
  }

  globalThis.ResizeObserver ??= ResizeObserverMock as typeof ResizeObserver;
}

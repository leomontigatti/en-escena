import { URLSearchParams as nodeURLSearchParams } from "node:url";

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
  // `URLSearchParams` uses Node's, not jsdom's: the global `Request` is provided
  // by undici (jsdom does not implement fetch) and it rejects a body that is not
  // an instance of ITS `URLSearchParams`. With jsdom's installed, any
  // `useFetcher` submit in an interaction test blows up before reaching the
  // action (#577).
  globalThis.URLSearchParams =
    nodeURLSearchParams as unknown as typeof globalThis.URLSearchParams;

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

  // jsdom implements no layout, so it ships no `scrollIntoView`. Radix's
  // `Select` calls it while positioning an open list, which would otherwise
  // throw in any test that opens one.
  Element.prototype.scrollIntoView ??= () => {};

  class ResizeObserverMock {
    disconnect() {}
    observe() {}
    unobserve() {}
  }

  globalThis.ResizeObserver ??= ResizeObserverMock as typeof ResizeObserver;
}

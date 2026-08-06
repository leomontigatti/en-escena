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
  // `URLSearchParams` va el de Node, no el de jsdom: el `Request` global lo pone
  // undici (jsdom no implementa fetch) y rechaza un body que no sea una instancia
  // de SU `URLSearchParams`. Con el de jsdom instalado, cualquier submit de
  // `useFetcher` en un test de interacción explota antes de llegar al action
  // (#577).
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

  class ResizeObserverMock {
    disconnect() {}
    observe() {}
    unobserve() {}
  }

  globalThis.ResizeObserver ??= ResizeObserverMock as typeof ResizeObserver;
}

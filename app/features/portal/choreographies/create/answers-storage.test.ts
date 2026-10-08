/** @vitest-environment jsdom */
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  clearStoredAnswers,
  readStoredAnswers,
  writeStoredAnswers,
} from "./answers-storage";

describe("wizard answers storage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage.clear();
  });

  test("gives up on surviving a reload when storage refuses the write", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    });

    expect(() => writeStoredAnswers("key", { step: 1 })).not.toThrow();
  });

  test("lets any other storage failure through", () => {
    const failure = new Error("Storage backend crashed");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw failure;
    });

    expect(() => writeStoredAnswers("key", { step: 1 })).toThrow(failure);
  });

  test("lets a storage exception that is not unavailability through", () => {
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("Bad state", "InvalidStateError");
    });

    expect(() => clearStoredAnswers("key")).toThrow("Bad state");
  });

  test("does not hide answers that cannot be serialized", () => {
    expect(() => writeStoredAnswers("key", { count: 1n })).toThrow(TypeError);
  });

  test("reads unparseable stored answers as none", () => {
    window.sessionStorage.setItem("key", "{not json");

    expect(readStoredAnswers("key")).toBeNull();
  });
});

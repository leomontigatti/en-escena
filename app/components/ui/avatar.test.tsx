/** @vitest-environment jsdom */

import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "@/components/ui/avatar";
import { createReactDomTestRenderer } from "@/lib/test-support/react-dom";

const renderer = createReactDomTestRenderer();

afterEach(() => {
  renderer.cleanup();
  vi.unstubAllGlobals();
});

// Radix renders `AvatarImage` only once the browser reports the image loaded,
// which jsdom never does; this stand-in reports every image as loaded.
class LoadedImage extends EventTarget {
  complete = true;
  naturalWidth = 1;
  crossOrigin: string | null = null;
  referrerPolicy = "";
  src = "";
}

function renderSquareAvatar(children: ReactNode) {
  renderer.render(<Avatar shape="square">{children}</Avatar>);
  return renderer.getContainer();
}

function slot(container: HTMLElement, name: string) {
  const element = container.querySelector(`[data-slot="${name}"]`);
  if (!element) throw new Error(`Expected a ${name} element.`);
  return element;
}

describe("Avatar shape", () => {
  // The square classes are always in the class list, like the `size` ones; only
  // `data-shape="square"` activates them.
  test("is round by default", () => {
    const markup = renderToStaticMarkup(
      <Avatar>
        <AvatarFallback>AB</AvatarFallback>
      </Avatar>,
    );

    expect(markup).toContain('data-shape="round"');
    expect(markup).toContain(" rounded-full ");
    expect(markup).toContain("after:rounded-full");
  });

  test("square rounds the root and its border ring to rounded-lg", () => {
    const root = slot(
      renderSquareAvatar(<AvatarFallback>AB</AvatarFallback>),
      "avatar",
    );

    expect(root.getAttribute("data-shape")).toBe("square");
    expect(root.classList).toContain("data-[shape=square]:rounded-lg");
    expect(root.classList).toContain("data-[shape=square]:after:rounded-lg");
  });

  test("square reaches the fallback through the avatar group", () => {
    const fallback = slot(
      renderSquareAvatar(<AvatarFallback>AB</AvatarFallback>),
      "avatar-fallback",
    );

    expect(fallback.classList).toContain(
      "group-data-[shape=square]/avatar:rounded-lg",
    );
  });

  test("square reaches the image through the avatar group", () => {
    vi.stubGlobal("Image", LoadedImage);

    const image = slot(
      renderSquareAvatar(<AvatarImage src="/avatar.png" alt="" />),
      "avatar-image",
    );

    expect(image.classList).toContain(
      "group-data-[shape=square]/avatar:rounded-lg",
    );
  });
});

describe("AvatarGroup", () => {
  test("keeps the intentional overlap layout explicit", () => {
    const markup = renderToStaticMarkup(
      <AvatarGroup>
        <Avatar>
          <AvatarFallback>AB</AvatarFallback>
        </Avatar>
        <Avatar>
          <AvatarFallback>CD</AvatarFallback>
        </Avatar>
        <AvatarGroupCount>+2</AvatarGroupCount>
      </AvatarGroup>,
    );

    expect(markup).toContain('data-layout="overlap"');
    expect(markup).toContain("-space-x-2");
    expect(markup).not.toContain("gap-");
  });
});

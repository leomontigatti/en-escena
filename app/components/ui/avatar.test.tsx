import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
} from "@/components/ui/avatar";

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

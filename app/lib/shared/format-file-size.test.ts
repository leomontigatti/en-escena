import { describe, expect, test } from "vitest";

import { formatFileSize } from "./format-file-size";

describe("formatFileSize", () => {
  test("formats byte counts with binary units", () => {
    expect(formatFileSize(0)).toBe("0 B");
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(1024)).toBe("1 KB");
    expect(formatFileSize(1536)).toBe("1.5 KB");
    expect(formatFileSize(1048576)).toBe("1 MB");
    expect(formatFileSize(1073741824)).toBe("1 GB");
    expect(formatFileSize(1099511627776)).toBe("1 TB");
  });

  test("drops the trailing .0 and rounds to one decimal", () => {
    expect(formatFileSize(2048)).toBe("2 KB");
    expect(formatFileSize(1075)).toBe("1 KB");
    expect(formatFileSize(1300)).toBe("1.3 KB");
    expect(formatFileSize(1331)).toBe("1.3 KB");
  });

  test("keeps the B unit for sub-1-byte fractional inputs", () => {
    expect(formatFileSize(0.5)).toBe("0.5 B");
    expect(formatFileSize(0.25)).toBe("0.3 B");
  });
});

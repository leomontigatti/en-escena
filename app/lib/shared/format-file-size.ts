const units = ["B", "KB", "MB", "GB", "TB"] as const;

/**
 * Formats a number of bytes as a readable string with binary units (each step =
 * 1024 of the previous one): `B`, `KB`, `MB`, `GB`, `TB`.
 *
 * The value is shown with up to one decimal (half-up), dropping the trailing
 * `.0` (`1024` → `"1 KB"`, not `"1.0 KB"`).
 *
 * Intended for sizes between 0 and the TB range; it does not handle negatives or
 * values above TB (they saturate at the `TB` unit).
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) {
    return "0 B";
  }

  const exponent = Math.max(
    0,
    Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1),
  );

  const value = bytes / 1024 ** exponent;
  const rounded = Math.round(value * 10) / 10;

  return `${rounded} ${units[exponent]}`;
}

/**
 * A name a download carries in its `Content-Disposition` header: plain ASCII,
 * lower case, words joined by dashes. "Gala Primavera" reads `gala-primavera`.
 */
export function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

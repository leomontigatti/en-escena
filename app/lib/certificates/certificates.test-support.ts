/**
 * How many pages a certificates PDF has: pdfkit writes each page's dictionary
 * uncompressed, as `/Type /Page`, beside the one `/Type /Pages` tree.
 */
export function countPdfPages(bytes: Uint8Array) {
  return (
    Buffer.from(bytes)
      .toString("latin1")
      .match(/\/Type \/Page\b(?!s)/g)?.length ?? 0
  );
}

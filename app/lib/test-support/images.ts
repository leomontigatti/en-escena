/**
 * The smallest PNG a dimension reader accepts: the signature and an `IHDR`
 * chunk naming the width and height, with no pixels. Enough for any check that
 * reads an image's size from its header, at whatever size the test needs,
 * without a fixture file per size.
 */
function pngHeaderBytes(width: number, height: number) {
  const bytes = new Uint8Array(33);
  const view = new DataView(bytes.buffer);

  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  view.setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  // Bit depth 8, truecolor, then compression, filter and interlace at 0. The
  // CRC after them is left zero: no size reader checks it.
  bytes.set([8, 2, 0, 0, 0], 24);

  return bytes;
}

export function pngFile(name: string, width: number, height: number) {
  return new File([pngHeaderBytes(width, height)], name, {
    type: "image/png",
  });
}

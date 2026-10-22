/**
 * How a presentation's music file is named wherever it is downloaded: alone
 * from a choreography's detail, or inside the day's audio archive. The running
 * order reads off a file list, so the number comes first, padded to the width
 * of the event's highest one: the order runs across the event.
 */

/** A name part longer than this is cut: some file systems cap a name at 255. */
const maxNamePartLength = 80;

export type MusicFileOrder = {
  highestOrderNumber: number;
  orderNumber: number;
};

/** `07 - Tema - Academia.mp3`, or `Tema - Academia.mp3` with no number. */
export function formatMusicFileName(input: {
  academyName: string;
  choreographyName: string;
  extension: string;
  order: MusicFileOrder | null;
}) {
  const label = formatMusicFileLabel(input);
  const name = input.order
    ? `${formatPaddedOrderNumber(input.order)} - ${label}`
    : label;

  return `${name}.${input.extension}`;
}

/** The choreography and its academy, as both the file and a missing list name it. */
export function formatMusicFileLabel(input: {
  academyName: string;
  choreographyName: string;
}) {
  return `${cleanFileNamePart(input.choreographyName)} - ${cleanFileNamePart(input.academyName)}`;
}

export function getMusicFileExtension(storageKey: string) {
  return storageKey.split(".").pop() ?? "";
}

function formatPaddedOrderNumber(order: MusicFileOrder) {
  // A withdrawn choreography keeps a number the event's highest may not count.
  const width = String(
    Math.max(order.highestOrderNumber, order.orderNumber),
  ).length;

  return String(order.orderNumber).padStart(width, "0");
}

/**
 * Keeps accents and spaces, which every system the file opens on reads, and
 * drops what Windows or a Unix path refuses.
 */
export function cleanFileNamePart(value: string) {
  return (
    value
      // oxlint-disable-next-line no-control-regex -- control characters are exactly what is being removed
      .replace(/[/\\:*?"<>|\u0000-\u001f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxNamePartLength)
      .replace(/[\s.]+$/, "")
  );
}

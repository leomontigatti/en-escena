/**
 * A `certificate` template's artwork, read from the designer's SVG so the PDF
 * can draw it as vectors. The designer exports a flat file: rectangles, one
 * embedded JPEG and filled paths, each path placed with a `translate`. That is
 * all this reads; anything else throws, so a new year's template that uses
 * more fails its test instead of printing with a piece missing.
 */

export type CertificateArtworkElement =
  | {
      kind: "rect";
      x: number;
      y: number;
      width: number;
      height: number;
      fill: string;
    }
  | {
      kind: "jpeg";
      x: number;
      y: number;
      width: number;
      height: number;
      dataUri: string;
    }
  | {
      kind: "path";
      d: string;
      fill: string;
      translateX: number;
      translateY: number;
    };

export type CertificateArtwork = {
  elements: CertificateArtworkElement[];
  height: number;
  width: number;
};

const jpegDataPrefix = "data:image/jpeg;base64,";

export function parseCertificateArtwork(svg: string): CertificateArtwork {
  const root = /<svg\b([^>]*)>/.exec(svg);

  if (!root) {
    throw new Error("The certificate template has no <svg> element.");
  }

  const rootAttributes = readAttributes(root[1]);
  const elements: CertificateArtworkElement[] = [];

  for (const match of svg
    .slice(root.index + root[0].length)
    .matchAll(/<([a-zA-Z]+)\b([^>]*?)\/?>/g)) {
    const [, tag, rawAttributes] = match;
    const attributes = readAttributes(rawAttributes);

    elements.push(readElement(tag, attributes));
  }

  return {
    elements,
    height: readNumber(rootAttributes, "height"),
    width: readNumber(rootAttributes, "width"),
  };
}

function readElement(
  tag: string,
  attributes: Map<string, string>,
): CertificateArtworkElement {
  switch (tag) {
    case "rect":
      return {
        kind: "rect",
        x: readNumber(attributes, "x", 0),
        y: readNumber(attributes, "y", 0),
        width: readNumber(attributes, "width"),
        height: readNumber(attributes, "height"),
        fill: readString(attributes, "fill"),
      };
    case "image": {
      const href = readString(attributes, "xlink:href");

      if (!href.startsWith(jpegDataPrefix)) {
        throw new Error(
          "A certificate template image must be an embedded JPEG.",
        );
      }

      return {
        kind: "jpeg",
        x: readNumber(attributes, "x", 0),
        y: readNumber(attributes, "y", 0),
        width: readNumber(attributes, "width"),
        height: readNumber(attributes, "height"),
        dataUri: href,
      };
    }
    case "path": {
      const translate = /^translate\(([-\d.]+),([-\d.]+)\)$/.exec(
        attributes.get("transform") ?? "translate(0,0)",
      );

      if (!translate) {
        throw new Error(
          `A certificate template path may only be translated: ${attributes.get("transform")}`,
        );
      }

      return {
        kind: "path",
        d: readString(attributes, "d"),
        fill: readString(attributes, "fill"),
        translateX: Number(translate[1]),
        translateY: Number(translate[2]),
      };
    }
    default:
      throw new Error(`A certificate template cannot draw <${tag}>.`);
  }
}

function readAttributes(raw: string) {
  return new Map(
    [...raw.matchAll(/([a-zA-Z:-]+)="([^"]*)"/g)].map(
      ([, name, value]) => [name, value] as const,
    ),
  );
}

function readString(attributes: Map<string, string>, name: string) {
  const value = attributes.get(name);

  if (value === undefined) {
    throw new Error(`A certificate template element has no ${name}.`);
  }

  return value;
}

function readNumber(
  attributes: Map<string, string>,
  name: string,
  fallback?: number,
) {
  const value = attributes.get(name);

  if (value === undefined && fallback !== undefined) {
    return fallback;
  }

  const number = Number(readString(attributes, name));

  if (!Number.isFinite(number)) {
    throw new Error(`A certificate template ${name} is not a number: ${value}`);
  }

  return number;
}

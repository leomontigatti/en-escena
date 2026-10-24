/**
 * How a photo sits in a `Gran final` banner's 16:9 frame, as the banner
 * editor sets it: turned in quarter turns, zoomed from "fills the frame", and
 * moved. The photo always fills the frame, so a banner has no empty bands.
 * The same draw makes the editor's preview and the uploaded picture, at any
 * size, so what administration frames is what the vote page shows.
 */

/** The uploaded banner: 16:9, past the minimum width the server checks. */
export const bannerOutputSize = { height: 1080, width: 1920 } as const;

const frameAspect = bannerOutputSize.width / bannerOutputSize.height;

export type BannerFraming = {
  /** Horizontal shift of the photo's centre, in frame widths. */
  offsetX: number;
  /** Vertical shift of the photo's centre, in frame heights. */
  offsetY: number;
  quarterTurns: number;
  /** 1 is the photo just filling the frame. */
  zoom: number;
};

export const initialBannerFraming: BannerFraming = {
  offsetX: 0,
  offsetY: 0,
  quarterTurns: 0,
  zoom: 1,
};

export const maxBannerZoom = 4;

type Size = { height: number; width: number };

type BannerCanvas = Pick<
  CanvasRenderingContext2D,
  | "clearRect"
  | "fillRect"
  | "fillStyle"
  | "restore"
  | "rotate"
  | "save"
  | "scale"
  | "translate"
> & {
  drawImage(
    image: never,
    x: number,
    y: number,
    width: number,
    height: number,
  ): void;
};

function turned(photo: Size, quarterTurns: number): Size {
  return quarterTurns % 2 === 0
    ? photo
    : { height: photo.width, width: photo.height };
}

/** The photo's size on the frame, in frame widths and frame heights. */
function sizeInFrame(photo: Size, framing: BannerFraming) {
  const { height, width } = turned(photo, framing.quarterTurns);
  const photoAspect = width / height;

  return {
    height: Math.max(frameAspect / photoAspect, 1) * framing.zoom,
    width: Math.max(photoAspect / frameAspect, 1) * framing.zoom,
  };
}

/** Keeps the photo filling the frame: a move stops at the photo's edge. */
export function clampBannerFraming(
  photo: Size,
  framing: BannerFraming,
): BannerFraming {
  const zoom = Math.min(Math.max(framing.zoom, 1), maxBannerZoom);
  const size = sizeInFrame(photo, { ...framing, zoom });
  const maxX = (size.width - 1) / 2;
  const maxY = (size.height - 1) / 2;

  return {
    offsetX: Math.min(Math.max(framing.offsetX, -maxX), maxX),
    offsetY: Math.min(Math.max(framing.offsetY, -maxY), maxY),
    quarterTurns: ((framing.quarterTurns % 4) + 4) % 4,
    zoom,
  };
}

export function drawBanner<TImage extends Size>(
  context: BannerCanvas,
  photo: TImage,
  frame: Size,
  framing: BannerFraming,
) {
  const { height, width } = turned(photo, framing.quarterTurns);
  const scale =
    Math.max(frame.width / width, frame.height / height) * framing.zoom;

  // The upload is a JPEG, which keeps no transparency: a transparent photo
  // shows white in the preview as it will in the banner, not black.
  context.clearRect(0, 0, frame.width, frame.height);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, frame.width, frame.height);
  context.save();
  context.translate(
    frame.width / 2 + framing.offsetX * frame.width,
    frame.height / 2 + framing.offsetY * frame.height,
  );
  context.rotate((framing.quarterTurns * Math.PI) / 2);
  context.scale(scale, scale);
  context.drawImage(
    photo as never,
    -photo.width / 2,
    -photo.height / 2,
    photo.width,
    photo.height,
  );
  context.restore();
}

/**
 * How many of the photo's pixels the frame spans across: under the banner's
 * width, the upload is the photo enlarged, and looks blurry.
 */
export function sourceWidthInFrame(photo: Size, framing: BannerFraming) {
  const { height, width } = turned(photo, framing.quarterTurns);

  return Math.round(Math.min(width, height * frameAspect) / framing.zoom);
}

/** What a banner should weigh at most: every voter's phone fetches it. */
const bannerBudgetBytes = 500_000;
const bannerQualities = [0.85, 0.75, 0.65];

/**
 * The banner encoded at the best quality that fits the budget, or at the
 * lowest one when none does: a detailed photo is encoded again, lighter.
 */
export async function encodeBannerWithinBudget(
  encode: (quality: number) => Promise<Blob | null>,
) {
  let banner: Blob | null = null;

  for (const quality of bannerQualities) {
    banner = await encode(quality);

    if (!banner || banner.size <= bannerBudgetBytes) {
      return banner;
    }
  }

  return banner;
}

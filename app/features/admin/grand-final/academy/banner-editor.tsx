import { Check, RotateCw, ZoomIn, ZoomOut } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import {
  bannerOutputSize,
  clampBannerFraming,
  drawBanner,
  initialBannerFraming,
  maxBannerZoom,
  sourceWidthInFrame,
  type BannerFraming,
} from "@/lib/grand-final/banner-framing";

/** JPEG at this quality keeps a 1920 px banner to a few hundred KB. */
const outputQuality = 0.85;
const keyboardStep = 0.02;

type EditRequest = { file: File; resolve: (file: File | null) => void };

/**
 * The editor a `Gran final` banner goes through before the form keeps it:
 * `editBanner` opens it on a picked photo and resolves with the framed 16:9
 * JPEG, or null when administration cancels. Render `editor` once.
 */
export function useBannerEditor() {
  const [request, setRequest] = useState<EditRequest | null>(null);

  const editBanner = useCallback(
    (file: File) =>
      new Promise<File | null>((resolve) => setRequest({ file, resolve })),
    [],
  );

  const editor = (
    <BannerEditorDialog
      file={request?.file ?? null}
      onDone={(file) => {
        request?.resolve(file);
        setRequest(null);
      }}
    />
  );

  return { editBanner, editor };
}

function BannerEditorDialog({
  file,
  onDone,
}: {
  file: File | null;
  onDone: (file: File | null) => void;
}) {
  const photo = usePhoto(file);
  const [framing, setFraming] = useState(initialBannerFraming);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setFraming(initialBannerFraming);
    setIsSaving(false);
  }, [file]);

  const reframe = useCallback(
    (change: (framing: BannerFraming) => BannerFraming) => {
      if (photo.state === "ready") {
        setFraming((current) =>
          clampBannerFraming(photo.image, change(current)),
        );
      }
    },
    [photo],
  );

  async function save() {
    if (photo.state !== "ready" || !file) {
      return;
    }

    setIsSaving(true);
    onDone(await renderBanner(photo.image, framing, file.name));
  }

  return (
    <Dialog
      open={file !== null}
      onOpenChange={(open) => {
        if (!open) {
          onDone(null);
        }
      }}
    >
      <DialogContent onInteractOutside={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Encuadrá la foto</DialogTitle>
          <DialogDescription>
            Arrastrala para moverla, acercala y girala hasta que se vea como
            querés. Así va a aparecer en la votación.
          </DialogDescription>
        </DialogHeader>
        {photo.state === "error" ? (
          <p className="text-sm text-destructive">
            No se pudo abrir la foto. Probá con una JPG, PNG o WEBP.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <BannerFrame
              framing={framing}
              photo={photo.state === "ready" ? photo.image : null}
              reframe={reframe}
            />
            <div className="flex items-center gap-3">
              <ZoomOut
                aria-hidden="true"
                className="size-4 text-muted-foreground"
              />
              <Slider
                aria-label="Acercar"
                className="flex-1"
                disabled={photo.state !== "ready"}
                max={maxBannerZoom}
                min={1}
                step={0.01}
                value={[framing.zoom]}
                onValueChange={([zoom = 1]) =>
                  reframe((current) => ({ ...current, zoom }))
                }
              />
              <ZoomIn
                aria-hidden="true"
                className="size-4 text-muted-foreground"
              />
              <Button
                type="button"
                variant="outline"
                disabled={photo.state !== "ready"}
                onClick={() =>
                  reframe((current) => ({
                    ...current,
                    quarterTurns: current.quarterTurns + 1,
                  }))
                }
              >
                <RotateCw aria-hidden="true" data-icon="inline-start" />
                Girar
              </Button>
            </div>
            {photo.state === "ready" &&
            sourceWidthInFrame(photo.image, framing) <
              bannerOutputSize.width * 0.66 ? (
              <p className="text-sm text-muted-foreground">
                La foto tiene poca resolución para este encuadre: puede verse
                poco nítida. Alejala o elegí otra más grande.
              </p>
            ) : null}
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onDone(null)}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={photo.state !== "ready" || isSaving}
            onClick={() => void save()}
          >
            <Check aria-hidden="true" data-icon="inline-start" />
            Usar foto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The 16:9 frame with the photo drawn in it as it will be uploaded. A drag
 * moves the photo, two fingers or the wheel zoom it, and the arrow keys and
 * `+` / `-` do both from the keyboard.
 */
function BannerFrame({
  framing,
  photo,
  reframe,
}: {
  framing: BannerFraming;
  photo: HTMLImageElement | null;
  reframe: (change: (framing: BannerFraming) => BannerFraming) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const [frameWidth, setFrameWidth] = useState(0);

  useEffect(() => {
    const frame = frameRef.current;

    if (!frame || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(([entry]) =>
      setFrameWidth(entry?.contentRect.width ?? 0),
    );
    observer.observe(frame);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");

    if (!canvas || !context || !photo || frameWidth === 0) {
      return;
    }

    const scale = window.devicePixelRatio || 1;
    canvas.width = Math.round(frameWidth * scale);
    canvas.height = Math.round(((frameWidth * 9) / 16) * scale);
    drawBanner(context, photo, canvas, framing);
  }, [framing, frameWidth, photo]);

  // React listens to the wheel passively, so it cannot keep the dialog from
  // scrolling while the wheel zooms.
  useEffect(() => {
    const frame = frameRef.current;

    if (!frame) {
      return;
    }

    const zoomOnWheel = (event: WheelEvent) => {
      event.preventDefault();
      reframe((current) => ({
        ...current,
        zoom: current.zoom * Math.exp(-event.deltaY * 0.002),
      }));
    };
    frame.addEventListener("wheel", zoomOnWheel, { passive: false });

    return () => frame.removeEventListener("wheel", zoomOnWheel);
  }, [reframe]);

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const previous = pointers.current.get(event.pointerId);
    const frame = frameRef.current;

    if (!previous || !frame) {
      return;
    }

    const others = [...pointers.current.entries()].filter(
      ([id]) => id !== event.pointerId,
    );
    const next = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, next);

    if (others.length === 0) {
      const { height, width } = frame.getBoundingClientRect();
      reframe((current) => ({
        ...current,
        offsetX: current.offsetX + (next.x - previous.x) / width,
        offsetY: current.offsetY + (next.y - previous.y) / height,
      }));
      return;
    }

    const [, other] = others[0] ?? [];

    if (other) {
      const before = Math.hypot(previous.x - other.x, previous.y - other.y);
      const after = Math.hypot(next.x - other.x, next.y - other.y);

      if (before > 0) {
        reframe((current) => ({
          ...current,
          zoom: current.zoom * (after / before),
        }));
      }
    }
  }

  function handlePointerEnd(event: PointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, Partial<Record<"x" | "y" | "zoom", number>>> = {
      "+": { zoom: 1.1 },
      "-": { zoom: 1 / 1.1 },
      ArrowDown: { y: keyboardStep },
      ArrowLeft: { x: -keyboardStep },
      ArrowRight: { x: keyboardStep },
      ArrowUp: { y: -keyboardStep },
    };
    const move = moves[event.key];

    if (!move) {
      return;
    }

    event.preventDefault();
    reframe((current) => ({
      ...current,
      offsetX: current.offsetX + (move.x ?? 0),
      offsetY: current.offsetY + (move.y ?? 0),
      zoom: current.zoom * (move.zoom ?? 1),
    }));
  }

  return (
    <div
      ref={frameRef}
      aria-label="Encuadre de la foto: arrastrá para moverla, flechas para moverla, + y - para acercarla"
      className="relative aspect-video w-full cursor-grab touch-none overflow-hidden rounded-md bg-muted outline-none select-none focus-visible:ring-3 focus-visible:ring-brand/50 active:cursor-grabbing"
      role="application"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onPointerCancel={handlePointerEnd}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
    >
      <canvas ref={canvasRef} className="block size-full" />
    </div>
  );
}

type PhotoState =
  | { state: "error" }
  | { state: "loading" }
  | { image: HTMLImageElement; state: "ready" };

/** The picked file decoded as an image, which the browser turns upright. */
function usePhoto(file: File | null): PhotoState {
  const [photo, setPhoto] = useState<PhotoState>({ state: "loading" });

  useEffect(() => {
    setPhoto({ state: "loading" });

    if (!file) {
      return;
    }

    if (typeof URL.createObjectURL !== "function") {
      setPhoto({ state: "error" });
      return;
    }

    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => setPhoto({ image, state: "ready" });
    image.onerror = () => setPhoto({ state: "error" });
    image.src = url;

    return () => {
      image.onload = null;
      image.onerror = null;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  return photo;
}

/** The framed photo as the banner the form uploads: 1920×1080 JPEG. */
async function renderBanner(
  photo: HTMLImageElement,
  framing: BannerFraming,
  pickedName: string,
) {
  const canvas = document.createElement("canvas");
  canvas.width = bannerOutputSize.width;
  canvas.height = bannerOutputSize.height;
  const context = canvas.getContext("2d");

  if (!context) {
    return null;
  }

  drawBanner(context, photo, canvas, framing);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", outputQuality),
  );
  const baseName = pickedName.replace(/\.[^.]+$/, "") || "banner";

  return blob
    ? new File([blob], `${baseName}.jpg`, { type: "image/jpeg" })
    : null;
}

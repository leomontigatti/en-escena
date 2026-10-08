// PROTOTYPE — throwaway, do not merge
//
// Variant A of the public Gran final vote page on /prototipo/votar (stacked
// full-width cards, each with an autoplay carousel of the academy's two photos
// cropped to 16:9), plus the "Tu voto fue registrado" state on
// `?estado=votado`. Fake data, no server: voting only changes the URL.
import Autoplay from "embla-carousel-autoplay";
import { Check, CircleCheck, Vote } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { EnEscenaAvatar } from "@/components/shared/en-escena-avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import { cn } from "@/lib/shared/utils";

// ---------------------------------------------------------------------------
// Fake data
// ---------------------------------------------------------------------------

type Ratio = "4:3" | "3:4" | "1:1";

type Finalist = {
  id: string;
  name: string;
  city: string;
  hue: number;
  photos: [Ratio, Ratio];
};

export const finalists: Finalist[] = [
  {
    id: "alas",
    name: "Estudio de Danzas Alas",
    city: "Córdoba",
    hue: 12,
    photos: ["4:3", "3:4"],
  },
  {
    id: "ritmo-sur",
    name: "Academia Ritmo Sur",
    city: "Río Cuarto",
    hue: 200,
    photos: ["1:1", "4:3"],
  },
  {
    id: "echeverria",
    name: "Escuela de Danzas Clásicas y Contemporáneas Mariana Echeverría",
    city: "San Francisco",
    hue: 280,
    photos: ["3:4", "1:1"],
  },
  {
    id: "movimiento-libre",
    name: "Movimiento Libre",
    city: "Villa Carlos Paz",
    hue: 140,
    photos: ["4:3", "1:1"],
  },
  {
    id: "malambo",
    name: "Instituto Coreográfico Malambo",
    city: "San Luis",
    hue: 40,
    photos: ["3:4", "4:3"],
  },
];

// ---------------------------------------------------------------------------
// Placeholder photo
// ---------------------------------------------------------------------------

const ratioBox: Record<Ratio, { w: number; h: number }> = {
  "4:3": { w: 400, h: 300 },
  "3:4": { w: 300, h: 400 },
  "1:1": { w: 400, h: 400 },
};

/**
 * A fake group photo drawn at its *original* ratio. The SVG is sized by its
 * container and cropped like `object-fit: cover` (`slice`), so the dashed frame
 * shows what the crop cuts off and the dancers' heads show whether faces survive.
 * The "original X:Y" chip is HTML, not SVG, so the crop never hides it.
 */
function FakePhoto({
  ratio,
  hue,
  variant = 0,
  className,
}: {
  ratio: Ratio;
  hue: number;
  variant?: number;
  className?: string;
}) {
  const gradientId = `g${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const { w, h } = ratioBox[ratio];
  const dancers = ratio === "3:4" ? 3 : 5;
  const shiftedHue = hue + variant * 30;

  return (
    <div className={cn("relative overflow-hidden bg-muted", className)}>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="xMidYMid slice"
        className="block size-full"
        role="img"
        aria-label={`Foto del grupo (original ${ratio})`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={`hsl(${shiftedHue} 55% 62%)`} />
            <stop offset="1" stopColor={`hsl(${shiftedHue + 40} 50% 32%)`} />
          </linearGradient>
        </defs>
        <rect width={w} height={h} fill={`url(#${gradientId})`} />
        <rect
          y={h * 0.82}
          width={w}
          height={h * 0.18}
          fill="rgb(0 0 0 / 0.25)"
        />
        {Array.from({ length: dancers }, (_, i) => {
          const cx = (w / (dancers + 1)) * (i + 1);
          const headY = h * 0.38 + (i % 2) * h * 0.04;
          const r = Math.min(w, h) * 0.055;
          return (
            <g key={i} fill="rgb(255 255 255 / 0.85)">
              <circle cx={cx} cy={headY} r={r} />
              <rect
                x={cx - r * 1.1}
                y={headY + r * 1.3}
                width={r * 2.2}
                height={h * 0.82 - headY - r * 1.3}
                rx={r}
              />
            </g>
          );
        })}
        <rect
          x="6"
          y="6"
          width={w - 12}
          height={h - 12}
          fill="none"
          stroke="white"
          strokeWidth="5"
          strokeDasharray="14 10"
        />
      </svg>
      <span className="pointer-events-none absolute top-3 left-3 rounded-full bg-black/55 px-2 py-0.5 text-xs font-semibold text-white">
        original {ratio}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared chrome (header and caption only; each variant owns its layout)
// ---------------------------------------------------------------------------

function PublicVoteShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex min-h-14 max-w-2xl items-center gap-2 px-4 py-2">
          <EnEscenaAvatar />
          <div className="grid text-sm leading-tight">
            <span className="font-medium">En Escena</span>
            <span className="text-xs text-muted-foreground">
              Votación del público
            </span>
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
        {children}
      </main>
    </div>
  );
}

function PageIntro() {
  return (
    <div className="flex flex-col gap-1 px-4 pt-5 pb-3">
      <h1 className="text-xl font-semibold">Gran final</h1>
      <p className="text-sm leading-6 text-muted-foreground">
        Elegí la academia que más te gustó. Podés votar una sola vez.
      </p>
    </div>
  );
}

function RatioCaption({ children }: { children: React.ReactNode }) {
  return (
    <p className="mx-4 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
      <span className="font-medium text-foreground">Prototipo:</span> {children}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Photo carousel: the two photos, 16:9, one at a time
// ---------------------------------------------------------------------------

/**
 * The academy's two photos cropped to 16:9, autoplaying every 3 s in a loop.
 * Any swipe or click stops the autoplay for good (`stopOnInteraction`), so a
 * person looking at one photo is not yanked to the next. The two dots only
 * signal that a second photo exists; swiping is the way to move.
 */
function PhotoCarousel({
  finalist,
  className,
  children,
}: {
  finalist: Finalist;
  className?: string;
  children?: React.ReactNode;
}) {
  const autoplay = useRef(Autoplay({ delay: 3000, stopOnInteraction: true }));
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setCurrent(api.selectedScrollSnap());
    onSelect();
    api.on("select", onSelect);
    return () => {
      api.off("select", onSelect);
    };
  }, [api]);

  return (
    <Carousel
      opts={{ loop: true }}
      plugins={[autoplay.current]}
      setApi={setApi}
      aria-label={`Fotos de ${finalist.name}`}
      className={cn("relative", className)}
    >
      <CarouselContent className="ml-0">
        {finalist.photos.map((ratio, i) => (
          <CarouselItem key={i} className="pl-0">
            <FakePhoto
              ratio={ratio}
              hue={finalist.hue}
              variant={i}
              className="aspect-video"
            />
          </CarouselItem>
        ))}
      </CarouselContent>
      {children}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-3 left-1/2 flex -translate-x-1/2 gap-1.5 rounded-full bg-black/40 px-2 py-1"
      >
        {finalist.photos.map((_, i) => (
          <span
            key={i}
            className={cn(
              "size-1.5 rounded-full bg-white/50 transition-colors",
              i === current && "bg-white",
            )}
          />
        ))}
      </div>
    </Carousel>
  );
}

type VariantProps = { onVote: (finalistId: string) => void };

// ---------------------------------------------------------------------------
// Variant A: stacked full-width cards, 16:9 photo carousel, sticky confirm bar
// ---------------------------------------------------------------------------

export function VariantA({ onVote }: VariantProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = finalists.find((finalist) => finalist.id === selectedId);

  return (
    <PublicVoteShell>
      <PageIntro />
      <RatioCaption>
        las fotos se recortan a <strong>16:9 (horizontal)</strong> y pasan
        solas, una por vez; pedile al admin fotos horizontales de al menos 1280
        × 720 px.
      </RatioCaption>

      <ul className={cn("flex flex-col gap-4 p-4", selected && "pb-28")}>
        {finalists.map((finalist) => {
          const isSelected = finalist.id === selectedId;
          return (
            <li key={finalist.id}>
              <Card className={cn("pt-0", isSelected && "ring-2 ring-primary")}>
                <PhotoCarousel finalist={finalist}>
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-0.5 bg-linear-to-t from-black/75 to-transparent px-4 pt-10 pb-3 text-white">
                    <span className="text-lg leading-tight font-semibold text-balance">
                      {finalist.name}
                    </span>
                    <span className="text-sm opacity-90">{finalist.city}</span>
                  </div>
                  {isSelected ? (
                    <span className="pointer-events-none absolute top-3 right-3 flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check aria-hidden="true" className="size-5" />
                    </span>
                  ) : null}
                </PhotoCarousel>
                <CardContent>
                  <Button
                    type="button"
                    size="lg"
                    variant={isSelected ? "default" : "outline"}
                    className="w-full"
                    aria-pressed={isSelected}
                    onClick={() =>
                      setSelectedId(isSelected ? null : finalist.id)
                    }
                  >
                    {isSelected ? (
                      <>
                        <Check aria-hidden="true" data-icon="inline-start" />
                        Elegida
                      </>
                    ) : (
                      "Elegir esta academia"
                    )}
                  </Button>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>

      {selected ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur">
          <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
            <div className="grid min-w-0 flex-1 text-sm leading-tight">
              <span className="text-xs text-muted-foreground">Tu voto</span>
              <span className="truncate font-medium" title={selected.name}>
                {selected.name}
              </span>
            </div>
            <Button type="button" size="lg" onClick={() => onVote(selected.id)}>
              <Vote aria-hidden="true" data-icon="inline-start" />
              Confirmar voto
            </Button>
          </div>
        </div>
      ) : null}
    </PublicVoteShell>
  );
}

// ---------------------------------------------------------------------------
// After voting
// ---------------------------------------------------------------------------

export function VotedState({ finalistId }: { finalistId: string | null }) {
  const finalist = finalists.find((candidate) => candidate.id === finalistId);

  return (
    <PublicVoteShell>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-10 text-center">
        <CircleCheck aria-hidden="true" className="size-12 text-brand" />
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold">Tu voto fue registrado</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Gracias por votar en la Gran final. El resultado se anuncia al
            cierre de la gala.
          </p>
        </div>
        {finalist ? (
          <Card size="sm" className="w-full max-w-sm pt-0">
            <PhotoCarousel finalist={finalist} />
            <CardContent className="flex flex-col gap-0.5 text-left">
              <CardDescription>Votaste a</CardDescription>
              <CardTitle>{finalist.name}</CardTitle>
              <CardDescription>{finalist.city}</CardDescription>
            </CardContent>
          </Card>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Ya podés cerrar esta página.
        </p>
      </div>
    </PublicVoteShell>
  );
}

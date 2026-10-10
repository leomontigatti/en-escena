import Autoplay from "embla-carousel-autoplay";
import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";
import { cn } from "@/lib/shared/utils";

import type { VoteFinalist } from "./shared";

/**
 * A finalist's two banners, 16:9, one at a time, moving on every three
 * seconds in a loop. A swipe or a click stops the autoplay for good, so a
 * person looking at one picture is not pulled to the next. The dots only say
 * a second picture exists; swiping is how to move.
 */
export function FinalistCarousel({
  children,
  finalist,
}: {
  children?: ReactNode;
  finalist: VoteFinalist;
}) {
  const autoplay = useRef(Autoplay({ delay: 3000, stopOnInteraction: true }));
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!api) {
      return;
    }

    const onSelect = () => setCurrent(api.selectedScrollSnap());
    onSelect();
    api.on("select", onSelect);

    return () => {
      api.off("select", onSelect);
    };
  }, [api]);

  return (
    <Carousel
      aria-label={`Fotos de ${finalist.name}`}
      className="relative"
      opts={{ loop: true }}
      plugins={[autoplay.current]}
      setApi={setApi}
    >
      <CarouselContent className="ml-0">
        {finalist.pictureUrls.map((url, index) => (
          <CarouselItem key={url} className="pl-0">
            <img
              alt={`Foto ${index + 1} de ${finalist.name}`}
              className="block aspect-video w-full bg-muted object-cover"
              src={url}
            />
          </CarouselItem>
        ))}
      </CarouselContent>
      {children}
      {finalist.pictureUrls.length > 1 ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-3 left-1/2 flex -translate-x-1/2 gap-1.5 rounded-full bg-black/40 px-2 py-1"
        >
          {finalist.pictureUrls.map((url, index) => (
            <span
              key={url}
              className={cn(
                "size-1.5 rounded-full bg-white/50 transition-colors",
                index === current && "bg-white",
              )}
            />
          ))}
        </div>
      ) : null}
    </Carousel>
  );
}

// PROTOTYPE: throwaway variant switcher for UI prototypes. Not for production.
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect } from "react";
import { useSearchParams } from "react-router";

import { Button } from "@/components/ui/button";

export function PrototypeSwitcher({
  variants,
}: {
  variants: Array<{ key: string; name: string }>;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentKey = searchParams.get("variant") ?? variants[0]?.key;
  const currentIndex = Math.max(
    0,
    variants.findIndex((variant) => variant.key === currentKey),
  );
  const current = variants[currentIndex];

  function go(offset: number) {
    const next =
      variants[(currentIndex + offset + variants.length) % variants.length];
    const params = new URLSearchParams(searchParams);
    params.set("variant", next.key);
    setSearchParams(params, { replace: true });
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target?.closest("input, textarea, [contenteditable]") ||
        (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
      ) {
        return;
      }
      go(event.key === "ArrowLeft" ? -1 : 1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  if (import.meta.env.PROD || !current) {
    return null;
  }

  return (
    <div className="fixed top-3 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-2 rounded-full bg-black px-2 py-1 text-xs text-white shadow-lg">
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="Anterior variante"
        onClick={() => go(-1)}
      >
        <ChevronLeft className="size-4" />
      </Button>
      <span className="whitespace-nowrap">
        {current.key} ({current.name})
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label="Siguiente variante"
        onClick={() => go(1)}
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}

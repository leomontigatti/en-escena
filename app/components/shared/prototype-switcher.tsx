// PROTOTYPE — throwaway. Floating bar that cycles a page's `?variant=` while a
// UI prototype is up; renders nothing outside the dev server.
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect } from "react";
import { useSearchParams } from "react-router";

export function PrototypeSwitcher({
  variants,
}: {
  variants: readonly { key: string; name: string }[];
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const current = searchParams.get("variant") ?? variants[0].key;
  const index = Math.max(
    0,
    variants.findIndex((variant) => variant.key === current),
  );

  const go = (step: number) => {
    const next = variants[(index + step + variants.length) % variants.length];
    const params = new URLSearchParams(searchParams);
    params.set("variant", next.key);
    setSearchParams(params, { replace: true, preventScrollReset: true });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.closest("input, textarea, [contenteditable]") ||
        (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
      ) {
        return;
      }
      go(event.key === "ArrowLeft" ? -1 : 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!import.meta.env.DEV) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-fuchsia-600 px-2 py-1 text-sm font-medium text-white shadow-lg">
      <button
        type="button"
        aria-label="Variante anterior"
        className="p-1"
        onClick={() => go(-1)}
      >
        <ChevronLeft className="size-4" />
      </button>
      <span className="whitespace-nowrap">
        {variants[index].key} ({variants[index].name})
      </span>
      <button
        type="button"
        aria-label="Variante siguiente"
        className="p-1"
        onClick={() => go(1)}
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}

/**
 * PROTOTIPO #339 — barra flotante para cambiar el escenario del detalle. Oculta
 * en producción. Throwaway.
 */

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect } from "react";
import { useSearchParams } from "react-router";

import { cn } from "@/lib/shared/utils";

import { scenarioOptions, type ScenarioKey } from "./stub";

export function useScenario(): ScenarioKey {
  const [params] = useSearchParams();
  const raw = params.get("scenario") as ScenarioKey | null;
  return raw && scenarioOptions.some((s) => s.key === raw) ? raw : "impaga";
}

export function ScenarioSwitcher() {
  const [params, setParams] = useSearchParams();
  const scenario = useScenario();
  const keys = scenarioOptions.map((o) => o.key);
  const current = scenarioOptions.find((o) => o.key === scenario);

  function setScenario(next: ScenarioKey) {
    const p = new URLSearchParams(params);
    p.set("scenario", next);
    setParams(p, { replace: true });
  }

  function cycle(dir: 1 | -1) {
    const i = keys.indexOf(scenario);
    setScenario(keys[(i + dir + keys.length) % keys.length]);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement;
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable)
      ) {
        return;
      }
      if (e.key === "ArrowLeft") cycle(-1);
      if (e.key === "ArrowRight") cycle(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (import.meta.env.PROD) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center">
      <div className="pointer-events-auto flex flex-col items-stretch gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-foreground shadow-lg backdrop-blur">
        <div className="flex items-center gap-2">
          <span className="rounded bg-warning/25 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-warning uppercase">
            Proto #339
          </span>
          <button
            type="button"
            onClick={() => cycle(-1)}
            className="rounded p-1 hover:bg-warning/20"
            aria-label="Escenario anterior"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="min-w-52 text-center text-sm font-medium">
            {current?.label}
          </span>
          <button
            type="button"
            onClick={() => cycle(1)}
            className="rounded p-1 hover:bg-warning/20"
            aria-label="Escenario siguiente"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-1">
          {scenarioOptions.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setScenario(opt.key)}
              className={cn(
                "rounded px-2 py-0.5 text-[11px]",
                scenario === opt.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/70",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

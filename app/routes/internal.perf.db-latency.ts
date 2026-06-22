import { data } from "react-router";

import { client } from "@/db";

import type { Route } from "./+types/internal.perf.db-latency";

const defaultSampleCount = 20;
const maxSampleCount = 100;

export async function loader({ request }: Route.LoaderArgs) {
  const configuredToken = process.env.EN_ESCENA_PERF_TOKEN;

  if (!configuredToken) {
    throw new Response("Not Found", { status: 404 });
  }

  const providedToken = request.headers.get("x-en-escena-perf-token");

  if (providedToken !== configuredToken) {
    throw new Response("Not Found", { status: 404 });
  }

  const url = new URL(request.url);
  const sampleCount = readSampleCount(url.searchParams.get("samples"));
  const samples = [];

  for (let index = 0; index < sampleCount; index += 1) {
    const start = performance.now();

    await client`select 1`;

    samples.push(performance.now() - start);
  }

  return data(
    {
      samples,
      summary: summarizeSamples(samples),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

function readSampleCount(value: string | null) {
  if (!value) {
    return defaultSampleCount;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return defaultSampleCount;
  }

  return Math.min(parsed, maxSampleCount);
}

function summarizeSamples(samples: number[]) {
  return {
    minMs: percentile(samples, 0),
    p50Ms: percentile(samples, 0.5),
    p95Ms: percentile(samples, 0.95),
    maxMs: percentile(samples, 1),
  };
}

function percentile(values: number[], p: number) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * p) - 1),
  );

  return Math.round((sorted[index] ?? 0) * 100) / 100;
}

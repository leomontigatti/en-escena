import { useEffect } from "react";
import { useFetcher } from "react-router";

import { createDataTableShouldRevalidate } from "@/components/shared/data-table-revalidation";
import { createKeptProgram } from "@/features/program/public/kept-program";
import {
  loadPublicProgram,
  publicProgramCacheSeconds,
} from "@/features/program/public/server";
import { PublicProgramView } from "@/features/program/public/view";
import { dayTabParam } from "@/lib/shared/url-tab";

type ProgramRouteProps = {
  loaderData: Awaited<ReturnType<typeof loader>>;
};

export const meta = () => [{ title: "Programa | En Escena" }];

// The list is whole in the browser: its day tab and its search only narrow it.
export const shouldRevalidate = createDataTableShouldRevalidate({
  filterParamNames: [dayTabParam],
});

// The browser may keep the page as long as the server keeps the program in
// memory. Private, because the top bar follows the reader's own session: no
// shared cache — Cloudflare's included — may hand it to someone else.
export const headers = () => ({
  "Cache-Control": `private, max-age=${publicProgramCacheSeconds}`,
});

export async function loader({ request }: { request: Request }) {
  return await loadPublicProgram(request);
}

const keptProgram =
  createKeptProgram<Awaited<ReturnType<typeof loadPublicProgram>>>();

export async function clientLoader({
  serverLoader,
}: {
  serverLoader: () => Promise<Awaited<ReturnType<typeof loader>>>;
}) {
  return await keptProgram.reload(serverLoader);
}

export default function ProgramRoute({ loaderData }: ProgramRouteProps) {
  // The live day's poll goes through a fetcher and not the revalidator, which
  // would reload the root's data too, outside `clientLoader`'s keeping: one
  // failed root load would still trade the page for the error boundary. Only
  // the tab and the search change on this page, and neither reloads, so the
  // fetcher's answer is always the newest program.
  const poll = useFetcher<typeof clientLoader>();
  const program = poll.data ?? loaderData;

  // The page as the server rendered it is the first program to keep.
  useEffect(() => {
    keptProgram.remember(program);
  }, [program]);

  return (
    <PublicProgramView
      loaderData={program}
      // A failed reload has nothing to report: `clientLoader` keeps the
      // program on screen, and the next minute tries again.
      onLivePoll={() => void poll.load("/programa")}
    />
  );
}

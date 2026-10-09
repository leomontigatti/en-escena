import type { ReactNode } from "react";

import { EnEscenaAvatar } from "@/components/shared/en-escena-avatar";

/**
 * The frame of the `Gran final`'s public pages, outside both panels: the
 * brand and what the page is for, over a phone-width column. The vote page
 * and the audit page share it.
 */
export function PublicVoteShell({
  children,
  subtitle,
}: {
  children: ReactNode;
  subtitle: string;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex min-h-14 max-w-2xl items-center gap-2 px-4 py-2">
          <EnEscenaAvatar />
          <div className="grid text-sm leading-tight">
            <span className="font-medium">En Escena</span>
            <span className="text-xs text-muted-foreground">{subtitle}</span>
          </div>
        </div>
      </header>
      <main
        id="contenido-principal"
        className="mx-auto flex w-full max-w-2xl flex-1 flex-col"
      >
        {children}
      </main>
    </div>
  );
}

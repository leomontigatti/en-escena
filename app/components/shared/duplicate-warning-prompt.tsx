import type { ReactNode } from "react";

import { AccessNotice } from "@/components/auth/access-ui";
import { Button } from "@/components/ui/button";
import { acknowledgedDuplicateIdsField } from "@/lib/shared/duplicate-warning";

type DuplicateWarningPromptProps = {
  children: ReactNode;
  matchIds: readonly string[];
};

/**
 * The form side of the duplicate warning: the records the server found, and a
 * submit that repeats the same values carrying their ids. The server warns
 * again when a match those ids do not cover appeared meanwhile.
 */
export function DuplicateWarningPrompt({
  children,
  matchIds,
}: DuplicateWarningPromptProps) {
  return (
    <div className="flex flex-col gap-4">
      <AccessNotice variant="warning">{children}</AccessNotice>

      {matchIds.map((matchId) => (
        <input
          key={matchId}
          name={acknowledgedDuplicateIdsField}
          type="hidden"
          value={matchId}
        />
      ))}

      <Button className="w-full" type="submit" variant="outline">
        Continuar de todos modos
      </Button>
    </div>
  );
}

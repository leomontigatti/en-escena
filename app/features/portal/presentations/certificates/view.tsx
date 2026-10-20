import { Download } from "lucide-react";
import { useState } from "react";

import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import type { CertificateRecipient } from "@/lib/certificates/certificates.server";

import { portalCertificatesPath } from "./shared";

/**
 * The evaluation detail's `Acciones`: `Descargar certificados` opens a dialog
 * with a row per dancer, each opening that dancer's certificate, and
 * `Descargar todos`, one PDF with a page each in the same order. Every link
 * opens the PDF in a new tab. Absent when the choreography issues none.
 */
export function PortalCertificatesActions({
  choreographyId,
  choreographyName,
  recipients,
}: {
  choreographyId: string;
  choreographyName: string;
  recipients: CertificateRecipient[];
}) {
  const [open, setOpen] = useState(false);

  if (recipients.length === 0) {
    return null;
  }

  return (
    <>
      <ResourceActionsMenu>
        <DropdownMenuItem onSelect={() => setOpen(true)}>
          Descargar certificados
        </DropdownMenuItem>
      </ResourceActionsMenu>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Certificados</DialogTitle>
            <DialogDescription>{choreographyName}</DialogDescription>
          </DialogHeader>
          <ul className="max-h-80 divide-y overflow-y-auto">
            {recipients.map((recipient) => (
              <li
                key={recipient.dancerId}
                className="flex items-center justify-between gap-3 py-2"
              >
                <span className="min-w-0 text-sm wrap-break-word">
                  {recipient.name}
                </span>
                <Button asChild variant="ghost" size="sm">
                  <a
                    href={portalCertificatesPath(
                      choreographyId,
                      recipient.dancerId,
                    )}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Descargar el certificado de ${recipient.name}`}
                  >
                    <Download aria-hidden="true" data-icon="inline-start" />
                    Descargar
                  </a>
                </Button>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button asChild>
              <a
                href={portalCertificatesPath(choreographyId)}
                target="_blank"
                rel="noreferrer"
              >
                <Download aria-hidden="true" data-icon="inline-start" />
                Descargar todos
              </a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

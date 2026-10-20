// PROTOTYPE (#1652) — throwaway. Where an academy downloads its dancers'
// certificates. Three variants switched with `?variant=`:
//   A — a `Certificados` card on the evaluation page, one row per dancer;
//   B — a `Certificados` menu in the evaluation page header;
//   C — a column on `Resultados`, which opens a dialog per choreography.
// The buttons download nothing.
import { ChevronDown, Download, FileBadge } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";

import { ResourceActionsMenu } from "@/components/shared/resource-actions-menu";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Dancer = { id: string; name: string };

export const certificateVariants = [
  { key: "A", name: "Tarjeta en la evaluación" },
  { key: "B", name: "Menú en el encabezado" },
  { key: "C", name: "Columna en Resultados" },
  { key: "D", name: "Acciones + diálogo (elegida)" },
] as const;

export function useCertificateVariant() {
  const [searchParams] = useSearchParams();
  return searchParams.get("variant") ?? "A";
}

/** A: a card under the judges, one download per dancer and one for all. */
export function CertificatesCard({ dancers }: { dancers: Dancer[] }) {
  if (dancers.length === 0) {
    return null;
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Certificados</CardTitle>
        <CardDescription>
          Un certificado por bailarín, con el premio de esta coreografía.
        </CardDescription>
        <CardAction>
          <Button type="button" variant="outline">
            <Download aria-hidden="true" data-icon="inline-start" />
            Descargar todos ({dancers.length})
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {dancers.map((dancer) => (
            <li
              key={dancer.id}
              className="flex items-center justify-between gap-3 py-2"
            >
              <span className="text-sm">{dancer.name}</span>
              <Button type="button" variant="ghost" size="sm">
                <Download aria-hidden="true" data-icon="inline-start" />
                Descargar
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** B: one header button; the menu holds every dancer and "all". */
export function CertificatesMenu({ dancers }: { dancers: Dancer[] }) {
  if (dancers.length === 0) {
    return null;
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline">
          <FileBadge aria-hidden="true" data-icon="inline-start" />
          Certificados
          <ChevronDown aria-hidden="true" data-icon="inline-end" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80">
        <DropdownMenuItem>
          <Download aria-hidden="true" />
          Todos los bailarines ({dancers.length})
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Uno por bailarín</DropdownMenuLabel>
        {dancers.map((dancer) => (
          <DropdownMenuItem key={dancer.id}>{dancer.name}</DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** C, on the evaluation page: says where C lives. */
export function CertificatesElsewhereNote() {
  return (
    <p className="text-sm text-muted-foreground">
      En la variante C los certificados se descargan desde{" "}
      <Link
        className="underline underline-offset-4"
        to="/portal/resultados?variant=C"
      >
        Resultados
      </Link>
      .
    </p>
  );
}

/** C, on `Resultados`: a row button that opens the choreography's dancers. */
export function CertificatesRowButton({
  choreographyName,
  dancers,
}: {
  choreographyName: string;
  dancers: Dancer[];
}) {
  const [open, setOpen] = useState(false);
  if (dancers.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        <FileBadge aria-hidden="true" data-icon="inline-start" />
        {dancers.length}
      </Button>
      <CertificatesDialog
        choreographyName={choreographyName}
        dancers={dancers}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

/** D: the page's `Acciones` menu, whose one item opens C's dialog. */
export function CertificatesActions({
  choreographyName,
  dancers,
}: {
  choreographyName: string;
  dancers: Dancer[];
}) {
  const [open, setOpen] = useState(false);
  if (dancers.length === 0) {
    return null;
  }
  return (
    <>
      <ResourceActionsMenu>
        <DropdownMenuItem onSelect={() => setOpen(true)}>
          Descargar certificados
        </DropdownMenuItem>
      </ResourceActionsMenu>
      <CertificatesDialog
        choreographyName={choreographyName}
        dancers={dancers}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

function CertificatesDialog({
  choreographyName,
  dancers,
  onOpenChange,
  open,
}: {
  choreographyName: string;
  dancers: Dancer[];
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Certificados</DialogTitle>
          <DialogDescription>{choreographyName}</DialogDescription>
        </DialogHeader>
        <ul className="max-h-80 divide-y overflow-y-auto">
          {dancers.map((dancer) => (
            <li
              key={dancer.id}
              className="flex items-center justify-between gap-3 py-2"
            >
              <span className="text-sm">{dancer.name}</span>
              <Button type="button" variant="ghost" size="sm">
                <Download aria-hidden="true" data-icon="inline-start" />
                Descargar
              </Button>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button type="button">
            <Download aria-hidden="true" data-icon="inline-start" />
            Descargar todos
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

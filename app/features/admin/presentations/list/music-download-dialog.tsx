import { zodResolver } from "@hookform/resolvers/zod";
import { Download } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { SelectField } from "@/components/shared/select-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatScheduleDayTabLabel } from "@/lib/choreographies/schedule-formatters";

import {
  buildMusicDownloadHref,
  musicDownloadDayParam,
  musicDownloadSchema,
  type MusicDownloadDay,
  type MusicDownloadFormValues,
} from "../music-download/shared";

/**
 * Picks the day whose music is zipped, and starts the download in place: the
 * answer is an attachment, so the list stays where it is. A day without any
 * music is turned down here, since a download that fails has no page to say so.
 */
export function MusicDownloadDialog({
  days,
  defaultDay,
  onOpenChange,
  open,
}: {
  /** In date order, only the days with presentations. */
  days: MusicDownloadDay[];
  /** The day the list is showing, if it is showing one. */
  defaultDay: string | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const form = useForm<MusicDownloadFormValues>({
    defaultValues: {
      [musicDownloadDayParam]: days.some((entry) => entry.day === defaultDay)
        ? (defaultDay ?? "")
        : "",
    },
    resolver: zodResolver(musicDownloadSchema),
  });

  const download = form.handleSubmit((values) => {
    const day = values[musicDownloadDayParam];

    if (!days.some((entry) => entry.day === day && entry.hasMusic)) {
      toast.error("Ningún audio cargado para ese día.");
      return;
    }

    window.open(buildMusicDownloadHref(day), "_self");
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Descargar audios</DialogTitle>
          <DialogDescription>
            Elegí el día. Se descarga un archivo .zip con la música de cada
            presentación, nombrada por su número de orden.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={download} className="flex flex-col gap-4">
          <SelectField
            control={form.control}
            label="Día"
            name={musicDownloadDayParam}
            options={days.map((entry) => ({
              label: formatScheduleDayTabLabel(entry.day),
              value: entry.day,
            }))}
            placeholder="Elegí un día"
          />

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit">
              <Download aria-hidden="true" data-icon="inline-start" />
              Descargar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

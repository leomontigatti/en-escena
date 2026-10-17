import { and, eq, inArray, isNotNull } from "drizzle-orm";

import { db } from "@/db";
import { academies, choreographies, user } from "@/db/schema";
import { updateChoreographyMusic } from "@/lib/portal/choreography-music.server";
import type { ChoreographyMusicStorage } from "@/lib/storage/choreography-music.server";

// The dev seed's music: what lets its choreographies read `Completa`, and the
// player on their detail pages play something (docs/local-auth.md).

/**
 * The music files of the previous run's choreographies. Their rows are about
 * to be deleted, and the next upload names its file after the new ids, so
 * these would stay on the volume with nothing pointing at them.
 */
export async function removeSeededMusic(input: {
  emails: string[];
  storage: ChoreographyMusicStorage;
}) {
  const stored = await db
    .select({ musicStorageKey: choreographies.musicStorageKey })
    .from(choreographies)
    .innerJoin(academies, eq(academies.id, choreographies.academyId))
    .innerJoin(user, eq(user.id, academies.userId))
    .where(
      and(
        inArray(user.email, input.emails),
        isNotNull(choreographies.musicStorageKey),
      ),
    );

  for (const { musicStorageKey } of stored) {
    if (musicStorageKey) {
      await input.storage.removeMusic(musicStorageKey);
    }
  }
}

/**
 * Loads the music as the portal's editor does, so the key, the file on the
 * volume and the player reading it are the ones an academy's upload makes.
 */
export async function uploadDemoMusic(input: {
  academyId: string;
  choreographyId: string;
  eventId: string;
  storage: ChoreographyMusicStorage;
}) {
  const result = await updateChoreographyMusic({
    ...input,
    file: new File([createDemoTone()], "musica-demo.wav", {
      type: "audio/wav",
    }),
    submittedStorageKey: "",
  });

  if (!result.ok) {
    throw new Error(
      `Dev seed could not upload the demo music: ${result.message}`,
    );
  }
}

/**
 * Three seconds of a quiet 440 Hz tone as a WAV: 8-bit mono PCM at 8 kHz, small
 * enough to write on every run and audible enough to tell the player works.
 */
function createDemoTone() {
  const sampleRate = 8000;
  const sampleCount = sampleRate * 3;
  const buffer = new ArrayBuffer(44 + sampleCount);
  const view = new DataView(buffer);
  const writeAscii = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + sampleCount, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true); // byte rate: one byte per sample
  view.setUint16(32, 1, true); // block align
  view.setUint16(34, 8, true); // bits per sample
  writeAscii(36, "data");
  view.setUint32(40, sampleCount, true);
  for (let index = 0; index < sampleCount; index += 1) {
    const wave = Math.sin((2 * Math.PI * 440 * index) / sampleRate);
    view.setUint8(44 + index, Math.round(128 + 24 * wave));
  }

  return buffer;
}

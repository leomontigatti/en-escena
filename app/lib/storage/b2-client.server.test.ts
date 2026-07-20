import { describe, expect, test } from "vitest";

import {
  type B2S3Client,
  b2List,
  createDefaultB2S3Client,
  getRequiredB2StorageEnv,
} from "./b2-client.server";
import { createB2ChoreographyMusicStorage } from "./choreography-music.server";
import { createB2DancerDocumentStorage } from "./dancer-documents.server";

type RecordedCommand = { input: Record<string, unknown>; name: string };

function createRecordingClient(
  responses: { list?: Array<Record<string, unknown>> } = {},
) {
  const commands: RecordedCommand[] = [];
  const listResponses = responses.list ?? [{ Contents: [] }];
  let listCallIndex = 0;

  const client: B2S3Client = {
    send: async (command) => {
      const typedCommand = command as {
        constructor: { name: string };
        input: Record<string, unknown>;
      };

      commands.push({
        input: typedCommand.input,
        name: typedCommand.constructor.name,
      });

      if (typedCommand.constructor.name === "ListObjectsV2Command") {
        const response =
          listResponses[Math.min(listCallIndex, listResponses.length - 1)];
        listCallIndex += 1;

        return response;
      }

      return {};
    },
  };

  return { client, commands };
}

describe("B2 storage env", () => {
  test("requires each B2 storage variable", () => {
    expect(() => getRequiredB2StorageEnv("B2_S3_ENDPOINT", {})).toThrow(
      "B2_S3_ENDPOINT is required.",
    );
    expect(
      getRequiredB2StorageEnv("B2_S3_ENDPOINT", {
        B2_S3_ENDPOINT: "https://s3.us-east-005.backblazeb2.com",
      }),
    ).toBe("https://s3.us-east-005.backblazeb2.com");
  });

  test("the default client fails fast when credentials are missing", () => {
    expect(() => createDefaultB2S3Client({})).toThrow(
      "B2_S3_ACCESS_KEY_ID is required.",
    );
  });
});

describe("B2 choreography music storage", () => {
  test("uploads music with a PutObject to the B2 bucket", async () => {
    const { client, commands } = createRecordingClient();
    const storage = createB2ChoreographyMusicStorage(client);
    const file = new Blob(["song"], { type: "audio/mpeg" });

    const storageKey = await storage.uploadMusic({
      academyId: "academy-1",
      choreographyId: "choreography-1",
      file,
    });

    expect(storageKey).toBe(
      "academies/academy-1/choreographies/choreography-1/music.mp3",
    );
    expect(commands).toHaveLength(1);
    expect(commands[0].name).toBe("PutObjectCommand");
    expect(commands[0].input.Bucket).toBe("en-escena-choreography-music");
    expect(commands[0].input.Key).toBe(
      "academies/academy-1/choreographies/choreography-1/music.mp3",
    );
    expect(commands[0].input.ContentType).toBe("audio/mpeg");
    expect(new TextDecoder().decode(commands[0].input.Body as Uint8Array)).toBe(
      "song",
    );
  });

  test("removes a single music object with a DeleteObject", async () => {
    const { client, commands } = createRecordingClient();
    const storage = createB2ChoreographyMusicStorage(client);

    await storage.removeMusic(
      "academies/academy-1/choreographies/choreography-1/music.mp3",
    );

    expect(commands).toEqual([
      {
        input: {
          Bucket: "en-escena-choreography-music",
          Key: "academies/academy-1/choreographies/choreography-1/music.mp3",
        },
        name: "DeleteObjectCommand",
      },
    ]);
  });

  test("signs music URLs with an injected presigner", async () => {
    const { client } = createRecordingClient();
    const presignCalls: Array<Record<string, unknown>> = [];
    const storage = createB2ChoreographyMusicStorage(client, {
      presign: async (_client, command, options) => {
        presignCalls.push({ input: command.input, options });

        return "https://b2.example.com/signed/music";
      },
    });

    await expect(
      storage.createMusicSignedUrl(
        "academies/academy-1/choreographies/choreography-1/music.mp3",
      ),
    ).resolves.toBe("https://b2.example.com/signed/music");
    expect(presignCalls).toEqual([
      {
        input: {
          Bucket: "en-escena-choreography-music",
          Key: "academies/academy-1/choreographies/choreography-1/music.mp3",
        },
        options: { expiresIn: 300 },
      },
    ]);
  });
});

describe("B2 dancer document storage", () => {
  test("lists, uploads, then batch-deletes stale document sides", async () => {
    const { client, commands } = createRecordingClient({
      list: [
        {
          Contents: [
            {
              Key: "academies/academy-1/dancers/dancer-1/document-front.jpg",
            },
            {
              Key: "academies/academy-1/dancers/dancer-1/document-front.webp",
            },
            {
              Key: "academies/academy-1/dancers/dancer-1/document-back.jpg",
            },
          ],
          IsTruncated: false,
        },
      ],
    });
    const storage = createB2DancerDocumentStorage(client);
    const file = new Blob(["front"], { type: "image/png" });

    const storageKey = await storage.uploadDocumentImage({
      academyId: "academy-1",
      dancerId: "dancer-1",
      file,
      side: "front",
    });

    expect(storageKey).toBe(
      "academies/academy-1/dancers/dancer-1/document-front.png",
    );
    expect(commands.map((command) => command.name)).toEqual([
      "ListObjectsV2Command",
      "PutObjectCommand",
      "DeleteObjectsCommand",
    ]);
    expect(commands[0].input).toMatchObject({
      Bucket: "en-escena-dancer-documents",
      Delimiter: "/",
      Prefix: "academies/academy-1/dancers/dancer-1/",
    });
    expect(commands[2].input).toEqual({
      Bucket: "en-escena-dancer-documents",
      Delete: {
        Objects: [
          { Key: "academies/academy-1/dancers/dancer-1/document-front.jpg" },
          { Key: "academies/academy-1/dancers/dancer-1/document-front.webp" },
        ],
      },
    });
  });
});

describe("b2List", () => {
  test("strips the prefix and follows pagination", async () => {
    const { client, commands } = createRecordingClient({
      list: [
        {
          Contents: [
            { Key: "academies/academy-1/dancers/dancer-1/document-front.jpg" },
          ],
          IsTruncated: true,
          NextContinuationToken: "token-2",
        },
        {
          Contents: [
            { Key: "academies/academy-1/dancers/dancer-1/document-back.png" },
          ],
          IsTruncated: false,
        },
      ],
    });

    const files = await b2List({
      bucket: "en-escena-dancer-documents",
      client,
      prefix: "academies/academy-1/dancers/dancer-1",
    });

    expect(files).toEqual([
      { name: "document-front.jpg" },
      { name: "document-back.png" },
    ]);
    expect(commands).toHaveLength(2);
    expect(commands[0].input.ContinuationToken).toBeUndefined();
    expect(commands[1].input.ContinuationToken).toBe("token-2");
  });
});

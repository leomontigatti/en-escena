import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

type B2StorageEnvName =
  | "B2_S3_ACCESS_KEY_ID"
  | "B2_S3_ENDPOINT"
  | "B2_S3_REGION"
  | "B2_S3_SECRET_ACCESS_KEY";

export function getRequiredB2StorageEnv(
  name: B2StorageEnvName,
  env: NodeJS.ProcessEnv,
) {
  const value = env[name];

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

export function createDefaultB2S3Client(env: NodeJS.ProcessEnv = process.env) {
  return new S3Client({
    credentials: {
      accessKeyId: getRequiredB2StorageEnv("B2_S3_ACCESS_KEY_ID", env),
      secretAccessKey: getRequiredB2StorageEnv("B2_S3_SECRET_ACCESS_KEY", env),
    },
    endpoint: getRequiredB2StorageEnv("B2_S3_ENDPOINT", env),
    forcePathStyle: true,
    region: getRequiredB2StorageEnv("B2_S3_REGION", env),
  });
}

// Minimal S3 client surface used by the storage adapters, so tests can inject a
// fake `send` that captures the emitted commands without hitting the network.
export type B2S3Client = {
  send(command: unknown): Promise<unknown>;
};

// Signature of `getSignedUrl` from `@aws-sdk/s3-request-presigner`, injectable
// so the adapters can be exercised without generating a real signature.
export type B2PresignSignedUrl = (
  client: B2S3Client,
  command: GetObjectCommand,
  options: { expiresIn: number },
) => Promise<string>;

export const defaultB2PresignSignedUrl: B2PresignSignedUrl = (
  client,
  command,
  options,
) =>
  getSignedUrl(
    client as unknown as S3Client,
    command as GetObjectCommand,
    options,
  );

export async function b2Upload(input: {
  bucket: string;
  client: B2S3Client;
  contentType: string;
  file: Blob;
  key: string;
}) {
  // PutObject always overwrites, so the port's `upsert` flag is a no-op.
  const body = new Uint8Array(await input.file.arrayBuffer());

  await input.client.send(
    new PutObjectCommand({
      Body: body,
      Bucket: input.bucket,
      ContentType: input.contentType,
      Key: input.key,
    }),
  );
}

export async function b2Remove(input: {
  bucket: string;
  client: B2S3Client;
  keys: string[];
}) {
  if (input.keys.length === 0) {
    return;
  }

  if (input.keys.length === 1) {
    await input.client.send(
      new DeleteObjectCommand({ Bucket: input.bucket, Key: input.keys[0] }),
    );

    return;
  }

  await input.client.send(
    new DeleteObjectsCommand({
      Bucket: input.bucket,
      Delete: { Objects: input.keys.map((Key) => ({ Key })) },
    }),
  );
}

export async function b2CreateSignedUrl(input: {
  bucket: string;
  client: B2S3Client;
  expiresInSeconds: number;
  key: string;
  presign: B2PresignSignedUrl;
}) {
  return input.presign(
    input.client,
    new GetObjectCommand({ Bucket: input.bucket, Key: input.key }),
    { expiresIn: input.expiresInSeconds },
  );
}

type ListObjectsV2Response = {
  Contents?: Array<{ Key?: string }>;
  IsTruncated?: boolean;
  NextContinuationToken?: string;
};

export async function b2List(input: {
  bucket: string;
  client: B2S3Client;
  prefix: string;
}): Promise<Array<{ name: string }>> {
  // The caller passes a folder without a trailing slash; documents live flat
  // under it, so a `/` delimiter keeps the listing to a single level.
  const prefix = `${input.prefix}/`;
  const files: Array<{ name: string }> = [];
  let continuationToken: string | undefined;

  do {
    const response = (await input.client.send(
      new ListObjectsV2Command({
        Bucket: input.bucket,
        ContinuationToken: continuationToken,
        Delimiter: "/",
        Prefix: prefix,
      }),
    )) as ListObjectsV2Response;

    for (const object of response.Contents ?? []) {
      if (object.Key && object.Key.startsWith(prefix)) {
        files.push({ name: object.Key.slice(prefix.length) });
      }
    }

    continuationToken = response.IsTruncated
      ? response.NextContinuationToken
      : undefined;
  } while (continuationToken);

  return files;
}

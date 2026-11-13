import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from './env';

let client: S3Client | undefined;
let signer: S3Client | undefined;

function makeClient(endpoint: string) {
  const e = env();
  return new S3Client({
    endpoint,
    region: e.S3_REGION,
    forcePathStyle: true,
    credentials: { accessKeyId: e.S3_ACCESS_KEY, secretAccessKey: e.S3_SECRET_KEY },
  });
}

export function s3(): S3Client {
  client ??= makeClient(env().S3_ENDPOINT);
  return client;
}

function presigner(): S3Client {
  const e = env();
  signer ??= e.S3_PUBLIC_ENDPOINT ? makeClient(e.S3_PUBLIC_ENDPOINT) : s3();
  return signer;
}

const bucket = () => env().S3_BUCKET;

export async function putObject(
  key: string,
  body: Buffer | Uint8Array | string,
  contentType?: string,
) {
  await s3().send(
    new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }),
  );
}

export async function uploadStream(key: string, body: Readable, contentType?: string) {
  await new Upload({
    client: s3(),
    params: { Bucket: bucket(), Key: key, Body: body, ContentType: contentType },
  }).done();
}

export async function getObject(key: string): Promise<Buffer> {
  const res = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  return Buffer.from(await res.Body!.transformToByteArray());
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return true;
  } catch (err) {
    if ((err as { name?: string }).name === 'NotFound') return false;
    throw err;
  }
}

export async function deleteObject(key: string) {
  await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

export async function listObjects(prefix: string) {
  const out: { key: string; size: number }[] = [];
  let token: string | undefined;
  do {
    const page = await s3().send(
      new ListObjectsV2Command({ Bucket: bucket(), Prefix: prefix, ContinuationToken: token }),
    );
    for (const o of page.Contents ?? []) if (o.Key) out.push({ key: o.Key, size: o.Size ?? 0 });
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return out;
}

export async function deleteObjects(keys: string[]) {
  for (let i = 0; i < keys.length; i += 1000) {
    const batch = keys.slice(i, i + 1000);
    const res = await s3().send(
      new DeleteObjectsCommand({
        Bucket: bucket(),
        Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
      }),
    );
    if (res.Errors?.length)
      throw new Error(`could not delete ${res.Errors.length} objects: ${res.Errors[0]?.Message}`);
  }
}

export async function hashObject(key: string): Promise<string> {
  const res = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  const hash = createHash('sha256');
  for await (const chunk of res.Body as Readable) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

export function presignGet(key: string, expiresIn = 3600) {
  return getSignedUrl(presigner(), new GetObjectCommand({ Bucket: bucket(), Key: key }), {
    expiresIn,
  });
}

export function presignPut(key: string, contentType: string, expiresIn = 3600) {
  return getSignedUrl(
    presigner(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }),
    {
      expiresIn,
    },
  );
}

import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "./env";

let client: S3Client | undefined;

export function s3(): S3Client {
  const e = env();
  client ??= new S3Client({
    endpoint: e.S3_ENDPOINT,
    region: e.S3_REGION,
    forcePathStyle: true,
    credentials: { accessKeyId: e.S3_ACCESS_KEY, secretAccessKey: e.S3_SECRET_KEY },
  });
  return client;
}

const bucket = () => env().S3_BUCKET;

export async function putObject(key: string, body: Buffer | Uint8Array | string, contentType?: string) {
  await s3().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }));
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
    if ((err as { name?: string }).name === "NotFound") return false;
    throw err;
  }
}

export function presignGet(key: string, expiresIn = 3600) {
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: bucket(), Key: key }), { expiresIn });
}

export function presignPut(key: string, contentType: string, expiresIn = 3600) {
  return getSignedUrl(s3(), new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }), {
    expiresIn,
  });
}

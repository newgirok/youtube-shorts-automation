import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import type { Readable } from 'node:stream';

const s3 = new S3Client({
  region: process.env.AWS_REGION ?? 'ap-northeast-2',
  ...(process.env.AWS_ENDPOINT_URL
    ? { endpoint: process.env.AWS_ENDPOINT_URL, forcePathStyle: true }
    : {}),
});

const BUCKET = process.env.S3_BUCKET_NAME ?? '';

export function jobKey(jobId: string, filename: string): string {
  return `jobs/${jobId}/${filename}`;
}

function getContentType(key: string): string {
  if (key.endsWith('.mp4')) return 'video/mp4';
  if (key.endsWith('.mp3')) return 'audio/mpeg';
  if (key.endsWith('.srt')) return 'text/plain';
  if (key.endsWith('.json')) return 'application/json';
  return 'application/octet-stream';
}

export async function uploadToS3(key: string, body: Buffer | string | Readable): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: getContentType(key),
    })
  );
}

export async function downloadFromS3(key: string): Promise<Buffer> {
  const response = await s3.send(
    new GetObjectCommand({ Bucket: BUCKET, Key: key })
  );
  const stream = response.Body as Readable;
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

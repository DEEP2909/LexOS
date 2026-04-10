/**
 * EvidentIS Storage Module
 * S3/MinIO abstraction for file storage
 */

import fs from 'fs';
import path from 'path';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from './config.js';
import { logger } from './logger.js';

// ============================================================
// TYPES
// ============================================================

export interface StorageFile {
  key: string;
  bucket: string;
  size: number;
  contentType: string;
  lastModified: Date;
}

export interface UploadOptions {
  contentType: string;
  metadata?: Record<string, string>;
}

// ============================================================
// S3 CLIENT
// ============================================================

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (s3Client) return s3Client;

  if (config.STORAGE_BACKEND === 's3') {
    s3Client = new S3Client({
      region: config.S3_REGION,
      endpoint: config.S3_ENDPOINT || undefined,
      forcePathStyle: config.S3_FORCE_PATH_STYLE === 'true',
      credentials: config.S3_ACCESS_KEY
        ? {
            accessKeyId: config.S3_ACCESS_KEY,
            secretAccessKey: config.S3_SECRET_KEY || '',
          }
        : undefined,
    });
    logger.info('S3 client initialized');
  } else {
    throw new Error('S3 client requested but STORAGE_BACKEND is not s3');
  }

  return s3Client;
}

// ============================================================
// LOCAL STORAGE (Development)
// ============================================================

function ensureLocalDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getLocalPath(key: string): string {
  return path.join(config.LOCAL_STORAGE_PATH, key);
}

// ============================================================
// STORAGE OPERATIONS
// ============================================================

/**
 * Upload a file to storage
 */
export async function uploadFile(
  key: string,
  data: Buffer | NodeJS.ReadableStream,
  options: UploadOptions
): Promise<void> {
  if (config.STORAGE_BACKEND === 'local') {
    const filePath = getLocalPath(key);
    ensureLocalDir(path.dirname(filePath));

    if (Buffer.isBuffer(data)) {
      fs.writeFileSync(filePath, data);
    } else {
      const writeStream = fs.createWriteStream(filePath);
      await new Promise<void>((resolve, reject) => {
        data.pipe(writeStream);
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });
    }

    // Store metadata in a sidecar file
    const metaPath = `${filePath}.meta`;
    fs.writeFileSync(
      metaPath,
      JSON.stringify({
        contentType: options.contentType,
        metadata: options.metadata || {},
        uploadedAt: new Date().toISOString(),
      })
    );

    logger.debug({ key }, 'File uploaded to local storage');
    return;
  }

  // S3 storage
  const client = getS3Client();
  const bodyData = Buffer.isBuffer(data) ? data : await streamToBuffer(data);

  await client.send(
    new PutObjectCommand({
      Bucket: config.S3_BUCKET,
      Key: key,
      Body: bodyData,
      ContentType: options.contentType,
      Metadata: options.metadata,
    })
  );

  logger.debug({ key, bucket: config.S3_BUCKET }, 'File uploaded to S3');
}

/**
 * Download a file from storage
 */
export async function downloadFile(key: string): Promise<Buffer> {
  if (config.STORAGE_BACKEND === 'local') {
    const filePath = getLocalPath(key);
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${key}`);
    }
    return fs.readFileSync(filePath);
  }

  const client = getS3Client();
  const response = await client.send(
    new GetObjectCommand({
      Bucket: config.S3_BUCKET,
      Key: key,
    })
  );

  if (!response.Body) {
    throw new Error(`Empty response for file: ${key}`);
  }

  return streamToBuffer(response.Body as NodeJS.ReadableStream);
}

/**
 * Get a readable stream for a file
 */
export async function getFileStream(key: string): Promise<NodeJS.ReadableStream> {
  if (config.STORAGE_BACKEND === 'local') {
    const filePath = getLocalPath(key);
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${key}`);
    }
    return fs.createReadStream(filePath);
  }

  const client = getS3Client();
  const response = await client.send(
    new GetObjectCommand({
      Bucket: config.S3_BUCKET,
      Key: key,
    })
  );

  if (!response.Body) {
    throw new Error(`Empty response for file: ${key}`);
  }

  return response.Body as NodeJS.ReadableStream;
}

/**
 * Delete a file from storage
 */
export async function deleteFile(key: string): Promise<void> {
  if (config.STORAGE_BACKEND === 'local') {
    const filePath = getLocalPath(key);
    const metaPath = `${filePath}.meta`;

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    if (fs.existsSync(metaPath)) {
      fs.unlinkSync(metaPath);
    }

    logger.debug({ key }, 'File deleted from local storage');
    return;
  }

  const client = getS3Client();
  await client.send(
    new DeleteObjectCommand({
      Bucket: config.S3_BUCKET,
      Key: key,
    })
  );

  logger.debug({ key, bucket: config.S3_BUCKET }, 'File deleted from S3');
}

/**
 * Check if a file exists
 */
export async function fileExists(key: string): Promise<boolean> {
  if (config.STORAGE_BACKEND === 'local') {
    return fs.existsSync(getLocalPath(key));
  }

  const client = getS3Client();
  try {
    await client.send(
      new HeadObjectCommand({
        Bucket: config.S3_BUCKET,
        Key: key,
      })
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Move a file from one key to another (copy + delete)
 */
export async function moveFile(sourceKey: string, destKey: string): Promise<void> {
  if (config.STORAGE_BACKEND === 'local') {
    const sourcePath = getLocalPath(sourceKey);
    const destPath = getLocalPath(destKey);
    const sourceMetaPath = `${sourcePath}.meta`;
    const destMetaPath = `${destPath}.meta`;

    ensureLocalDir(path.dirname(destPath));
    fs.renameSync(sourcePath, destPath);

    if (fs.existsSync(sourceMetaPath)) {
      fs.renameSync(sourceMetaPath, destMetaPath);
    }

    logger.debug({ sourceKey, destKey }, 'File moved in local storage');
    return;
  }

  // For S3, we need to copy then delete
  const data = await downloadFile(sourceKey);
  const client = getS3Client();

  // Get original metadata
  const headResponse = await client.send(
    new HeadObjectCommand({
      Bucket: config.S3_BUCKET,
      Key: sourceKey,
    })
  );

  await uploadFile(destKey, data, {
    contentType: headResponse.ContentType || 'application/octet-stream',
    metadata: headResponse.Metadata,
  });

  await deleteFile(sourceKey);
  logger.debug({ sourceKey, destKey, bucket: config.S3_BUCKET }, 'File moved in S3');
}

/**
 * Generate a pre-signed URL for direct upload/download
 */
export async function getSignedDownloadUrl(key: string, expiresInSeconds = 3600): Promise<string> {
  if (config.STORAGE_BACKEND === 'local') {
    throw new Error('Signed URLs not supported for local storage');
  }

  const client = getS3Client();
  const command = new GetObjectCommand({
    Bucket: config.S3_BUCKET,
    Key: key,
  });

  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

// ============================================================
// HELPERS
// ============================================================

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Generate storage key for a document
 * Format: {prefix}/{tenantId}/{documentId}/{filename}
 */
export function generateDocumentKey(
  tenantId: string,
  documentId: string,
  filename: string,
  prefix: 'quarantine' | 'uploads' = 'uploads'
): string {
  // Sanitize filename
  const sanitized = filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_');

  return `${prefix}/${tenantId}/${documentId}/${sanitized}`;
}

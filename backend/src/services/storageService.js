const { pipeline } = require('stream/promises');

const materialVariantKeyPatterns = {
  original: /^materials\/original\/[0-9a-f-]{36}\.pdf$/i,
  watermarked: /^materials\/watermarked\/[0-9a-f-]{36}\.pdf$/i
};

function getStorageClient() {
  const {
    R2_ENDPOINT,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_BUCKET
  } = process.env;
  if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) {
    const error = new Error('Downloads are unavailable until private Cloudflare R2 storage is configured.');
    error.statusCode = 503;
    throw error;
  }
  if (R2_ACCESS_KEY_ID.length !== 32 || R2_SECRET_ACCESS_KEY.length !== 64) {
    const error = new Error('Cloudflare R2 credentials are invalid: set R2_ACCESS_KEY_ID to the 32-character Access Key ID and R2_SECRET_ACCESS_KEY to its 64-character Secret Access Key from the same R2 API token.');
    error.statusCode = 503;
    throw error;
  }
  const endpointHost = new URL(R2_ENDPOINT).hostname;
  const accountId = endpointHost.split('.')[0];
  if (R2_ACCESS_KEY_ID === accountId) {
    const error = new Error('R2_ACCESS_KEY_ID is set to the Cloudflare account ID. Use the Access Key ID from an R2 S3 API token instead.');
    error.statusCode = 503;
    throw error;
  }
  const { S3Client } = require('@aws-sdk/client-s3');
  return new S3Client({
    region: 'auto',
    endpoint: R2_ENDPOINT,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY
    }
  });
}

function getBucket() {
  if (!process.env.R2_BUCKET) {
    const error = new Error('Private Cloudflare R2 storage is not configured.');
    error.statusCode = 503;
    throw error;
  }
  return process.env.R2_BUCKET;
}

async function createMaterialDownloadUrl(material) {
  if (material.processingStatus !== 'complete' ||
      !materialVariantKeyPatterns.original.test(material.originalFileKey || '') ||
      !materialVariantKeyPatterns.watermarked.test(material.downloadUrl || '') ||
      material.downloadUrl === material.originalFileKey) {
    const error = new Error('This document is not ready for download because watermark processing is incomplete.');
    error.statusCode = 409;
    throw error;
  }
  const client = getStorageClient();

  const { GetObjectCommand } = require('@aws-sdk/client-s3');
  const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
  const command = new GetObjectCommand({
    Bucket: getBucket(),
    Key: material.downloadUrl,
    ResponseContentDisposition: `attachment; filename="${material.id}.${(material.fileFormat || 'pdf').toLowerCase()}"`
  });
  return getSignedUrl(client, command, { expiresIn: 300 });
}

async function createMaterialUploadUrl() {
  const client = getStorageClient();
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
  const key = `materials/uploads/${require('crypto').randomUUID()}.pdf`;
  const url = await getSignedUrl(client, new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    ContentType: 'application/pdf'
  }), { expiresIn: 300 });
  return { key, url, expiresIn: 300 };
}

async function getPrivateObjectBuffer(key, maxBytes = 20 * 1024 * 1024) {
  const { GetObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
  const client = getStorageClient();
  const head = await client.send(new HeadObjectCommand({ Bucket: getBucket(), Key: key }));
  if (!Number.isSafeInteger(head.ContentLength) || head.ContentLength < 1 || head.ContentLength > maxBytes) {
    const error = new Error('The uploaded PDF is empty or exceeds the 20 MB processing limit.');
    error.statusCode = 413;
    throw error;
  }
  const response = await client.send(new GetObjectCommand({ Bucket: getBucket(), Key: key }));
  if (!response.Body) throw new Error('The uploaded PDF could not be read from private storage.');
  return Buffer.from(await response.Body.transformToByteArray());
}

async function pipePrivateObject(key, request, response) {
  const { GetObjectCommand } = require('@aws-sdk/client-s3');
  const object = await getStorageClient().send(new GetObjectCommand({
    Bucket: getBucket(),
    Key: key,
    ...(request.headers.range ? { Range: request.headers.range } : {})
  }));
  if (!object.Body) throw new Error('The processed preview is unavailable in private storage.');
  response.status(object.$metadata.httpStatusCode || 200);
  response.setHeader('Content-Type', 'application/pdf');
  response.setHeader('Content-Disposition', 'inline; filename="study-material-preview.pdf"');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Cache-Control', 'private, no-store');
  response.setHeader('Accept-Ranges', 'bytes');
  response.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
  if (object.ContentLength !== undefined) response.setHeader('Content-Length', object.ContentLength);
  if (object.ContentRange) response.setHeader('Content-Range', object.ContentRange);
  await pipeline(object.Body, response);
}

async function putPrivateObject(key, body) {
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  await getStorageClient().send(new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    Body: body,
    ContentType: 'application/pdf'
  }));
}

async function deletePrivateObjects(keys) {
  const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
  const outcomes = await Promise.allSettled(keys.filter(Boolean).map((Key) =>
    getStorageClient().send(new DeleteObjectCommand({ Bucket: getBucket(), Key }))
  ));
  const failures = outcomes.filter((outcome) => outcome.status === 'rejected');
  if (failures.length) {
    failures.forEach((failure) => console.error('Could not clean up a private PDF object:', failure.reason));
    throw new Error(`Could not clean up ${failures.length} private PDF object(s).`);
  }
}

module.exports = {
  createMaterialDownloadUrl,
  createMaterialUploadUrl,
  deletePrivateObjects,
  getPrivateObjectBuffer,
  pipePrivateObject,
  putPrivateObject
};

/**
 * Dispcam R2 upload worker
 * ------------------------
 * Generates presigned S3 URLs so the browser can upload JPEGs directly to
 * Cloudflare R2 (and read them back) without ever exposing API keys.
 *
 * File bytes never pass through this Worker — it only signs URLs.
 *
 * Deploy:
 *   cd workers
 *   npm install
 *   npx wrangler secret put R2_ACCESS_KEY_ID
 *   npx wrangler secret put R2_SECRET_ACCESS_KEY
 *   npx wrangler deploy
 */
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
      // The AWS SDK (>= 3.600) adds CRC32 checksums to every S3 request by
      // default. In presigned URLs that leaks x-amz-checksum-crc32 query params
      // which Cloudflare R2 rejects (400) on direct browser uploads. Only add
      // checksums when the operation actually requires one.
      requestChecksumCalculation: 'WHEN_REQUIRED',
    });

    // POST /upload-url  body: { path, contentType }  ->  { url }
    // Returns a URL valid for 5 minutes to PUT the photo straight into R2.
    if (url.pathname === '/upload-url' && request.method === 'POST') {
      try {
        const { path, contentType } = await request.json();
        if (!path || !path.startsWith('once-films/')) return json({ error: 'Invalid path' }, 400);
        const command = new PutObjectCommand({
          Bucket: env.R2_BUCKET_NAME,
          Key: path,
          ContentType: contentType || 'image/jpeg',
        });
        const signed = await getSignedUrl(s3, command, { expiresIn: 300 });
        return json({ url: signed });
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    // GET /download-url?path=...  ->  { url }
    // Only needed when no public custom domain is bound to the bucket.
    if (url.pathname === '/download-url' && request.method === 'GET') {
      try {
        const path = url.searchParams.get('path');
        if (!path || !path.startsWith('once-films/')) return json({ error: 'Invalid path' }, 400);
        const command = new GetObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: path });
        const signed = await getSignedUrl(s3, command, { expiresIn: 3600 });
        return json({ url: signed });
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    return json({ error: 'Not found' }, 404);
  },
};

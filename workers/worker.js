/**
 * Dispcam R2 upload + delivery worker
 * -----------------------------------
 * 1. /upload-url    Generates presigned S3 URLs so the browser can upload JPEGs
 *                   directly to Cloudflare R2 without ever exposing API keys.
 * 2. /download-url  Returns a 1-hour presigned GET URL for reading a photo.
 * 3. /deliver       Builds a per-recipient album (PDF + ZIP of original JPEGs)
 *                   from photos in R2 and emails download links via MailerSend.
 *                   Idempotent: a marker object in R2 prevents duplicate emails.
 *
 * File bytes never pass through this Worker for uploads — it only signs URLs.
 * For delivery, photos are read from R2, assembled into albums, stored back in
 * R2, and the recipient receives links (never attachments).
 *
 * Deploy:
 *   cd workers
 *   npm install
 *   npx wrangler secret put R2_ACCESS_KEY_ID
 *   npx wrangler secret put R2_SECRET_ACCESS_KEY
 *   npx wrangler secret put BREVO_API_KEY
 *   npx wrangler deploy
 */
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { zipSync } from 'fflate';
import { PDFDocument } from 'pdf-lib';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Pricing tiers — free forever up to 10 guests, then paid capacity with 25 shots
// per guest at a declining per-guest price (approved by the founder).
// ⚠️ Mirrored in src/pages/index.js (TIERS) — keep both in sync when pricing changes.
const TIERS = {
  free: { guests: 10, shots: 10, price: 0 },
  t50: { guests: 50, shots: 25, price: 1799 },
  t100: { guests: 100, shots: 25, price: 3499 },
  t150: { guests: 150, shots: 25, price: 4799 },
  t200: { guests: 200, shots: 25, price: 5799 },
  t250: { guests: 250, shots: 25, price: 6899 },
  t300: { guests: 300, shots: 25, price: 7999 },
  t350: { guests: 350, shots: 25, price: 8999 },
};

// Verify a Razorpay checkout signature: HMAC-SHA256(order_id|payment_id, key_secret) in hex.
async function verifyRazorpaySignature(secret, orderId, paymentId, signature) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const data = new TextEncoder().encode(`${orderId}|${paymentId}`);
  const sig = await crypto.subtle.sign('HMAC', key, data);
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return hex === signature;
}

async function razorpayGet(env, path) {
  const basic = btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`);
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    headers: { Authorization: `Basic ${basic}` },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error?.description || 'Razorpay request failed');
  return body;
}

async function createRazorpayOrder(env, { tier, eventName }) {
  const basic = btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`);
  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: TIERS[tier].price * 100, // paise
      currency: 'INR',
      receipt: `dispocam_${Date.now()}`,
      notes: { tier, eventName },
    }),
  });
  const order = await res.json();
  if (!res.ok) throw new Error(order?.error?.description || 'Razorpay order failed');
  return order;
}
// Cap album size: keeps the Worker under memory/CPU limits for huge events.
// The email notes when an album is truncated — the in-app gallery still has everything.
const MAX_ALBUM_PHOTOS = 100;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

// Escape user-controlled text before it enters the email HTML (no injection).
const esc = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const slugify = (s) =>
  String(s || 'event')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'event';

function makeS3(env) {
  return new S3Client({
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
}

async function objectExists(s3, env, key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key }));
    return true;
  } catch (e) {
    return false; // NoSuchKey / 404
  }
}

async function readObject(s3, env, key) {
  const res = await s3.send(new GetObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key }));
  return new Uint8Array(await res.Body.transformToByteArray());
}

async function putObject(s3, env, key, bytes, contentType) {
  await s3.send(
    new PutObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key, Body: bytes, ContentType: contentType })
  );
}

async function signGetUrl(s3, env, key, expiresIn) {
  const cmd = new GetObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key });
  return getSignedUrl(s3, cmd, { expiresIn });
}

/** Build a ZIP of the original-quality JPEGs. */
function buildZip(photos) {
  const files = {};
  photos.forEach((p, i) => {
    files[`photo-${String(i + 1).padStart(3, '0')}.jpg`] = new Uint8Array(p.bytes);
  });
  return zipSync(files, { level: 6 });
}

/** Build a one-photo-per-page PDF album (JPEGs embed natively — no quality loss). */
async function buildPdf(photos) {
  const pdf = await PDFDocument.create();
  pdf.setTitle('DispoCam Album');
  for (const p of photos) {
    let img;
    try {
      img = await pdf.embedJpg(p.bytes);
    } catch (e) {
      continue; // skip corrupt/non-JPEG objects
    }
    const { width, height } = img.scaleToFit(1800, 1800);
    const page = pdf.addPage([width, height]);
    page.drawImage(img, { x: 0, y: 0, width, height });
  }
  if (pdf.getPageCount() === 0) return null;
  return pdf.save();
}

/** Send the album download links via Brevo (free tier: 300 emails/day). */
async function sendAlbumEmail(env, { recipientName, recipientEmail, eventName, pdfUrl, zipUrl, truncated, count }) {
  const fromEmail = env.BREVO_FROM_EMAIL;
  if (!fromEmail) throw new Error('BREVO_FROM_EMAIL not configured');
  const first = esc(recipientName ? recipientName.split(' ')[0] : 'there');
  const ev = esc(eventName);
  const noteStyle = 'margin:0 0 8px;font-size:13px;line-height:1.6;color:#9ca3af';
  const note = truncated
    ? `<p style="${noteStyle}">This album contains the first <b>${count}</b> photos of a larger film — the full gallery is available in the app.</p>`
    : `<p style="${noteStyle}">${count} photo${count === 1 ? '' : 's'} in this album.</p>`;
  const pdfButton = pdfUrl
    ? `<td style="border-radius:10px;background:#fbbf24;padding:12px 22px"><a href="${pdfUrl}" style="color:#0a0a0a;font-size:14px;font-weight:700;text-decoration:none">📄 PDF album</a></td><td style="width:12px"></td>`
    : '';

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#0a0a0a;font-family:'Helvetica Neue',Arial,sans-serif">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;color:#e5e5e5">
    <p style="margin:0 0 20px;font-size:12px;letter-spacing:3px;color:#fbbf24;text-transform:uppercase">DispoCam · No previews. No retakes.</p>
    <h1 style="margin:0 0 8px;font-family:Georgia,serif;font-weight:400;font-size:28px;color:#ffffff">Your film developed, ${first} 🎞️</h1>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#a1a1aa"><b style="color:#fafafa">${ev}</b> is ready. Your exposures are below — download once, keep forever.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 24px"><tr>
      ${pdfButton}
      <td style="border-radius:10px;background:#1c1c22;border:1px solid #2a2a2a;padding:12px 22px"><a href="${zipUrl}" style="color:#fafafa;font-size:14px;font-weight:600;text-decoration:none">📦 Original-quality ZIP</a></td>
    </tr></table>
    <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#9ca3af">The <b style="color:#d4d4d8">PDF album</b> is perfect for sharing and printing. The <b style="color:#d4d4d8">ZIP</b> holds the original, full-resolution JPEGs — zero compression, one download.</p>
    ${note}
    <p style="margin:28px 0 0;padding-top:20px;border-top:1px solid #1f1f1f;font-size:12px;color:#6b7280">Sent by DispoCam — life happens once, don't let it fade away.</p>
  </div></body></html>`;

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': env.BREVO_API_KEY,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'DispoCam', email: fromEmail },
      to: [{ email: recipientEmail, name: recipientName || 'DispoCam guest' }],
      subject: `Your DispoCam album is ready — ${eventName}`,
      htmlContent: html,
      textContent: `Hi ${first},\n\n${eventName} developed — your album is ready.\n\n${pdfUrl ? '📄 PDF album: ' + pdfUrl + '\n' : ''}📦 Original-quality ZIP: ${zipUrl}\n\nDispoCam — no previews, no retakes.`,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Brevo ${res.status}: ${body.slice(0, 300)}`);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const s3 = makeS3(env);

    // POST /upload-url  body: { path, contentType }  ->  { url }
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

    // POST /create-order  body: { tier, eventName }  ->  { orderId, amount, currency, keyId, tier }
    if (url.pathname === '/create-order' && request.method === 'POST') {
      try {
        const { tier, eventName } = await request.json();
        const t = TIERS[tier];
        if (!t || t.price <= 0) return json({ error: 'Invalid tier' }, 400);
        if (!eventName || typeof eventName !== 'string' || eventName.length > 60) {
          return json({ error: 'Invalid event name' }, 400);
        }
        const order = await createRazorpayOrder(env, { tier, eventName: String(eventName).slice(0, 60) });
        return json({ orderId: order.id, amount: order.amount, currency: order.currency, keyId: env.RAZORPAY_KEY_ID, tier: t });
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    // POST /verify-payment  body: { eventName, revealAt, tier, orderId, paymentId, signature }
    // Verifies the Razorpay signature server-side, then creates the PAID event
    // (capacity is server-set from the tier — clients can't inflate it).
    if (url.pathname === '/verify-payment' && request.method === 'POST') {
      try {
        const { eventName, revealAt, tier, orderId, paymentId, signature } = await request.json();
        const t = TIERS[tier];
        if (!t || t.price <= 0) return json({ error: 'Invalid tier' }, 400);
        if (!eventName || typeof eventName !== 'string' || eventName.length > 60) {
          return json({ error: 'Invalid event name' }, 400);
        }
        if (!orderId || !paymentId || !signature) return json({ error: 'Missing payment fields' }, 400);

        const revealDate = new Date(revealAt);
        if (Number.isNaN(revealDate.getTime()) || revealDate.getTime() <= Date.now()) {
          return json({ error: 'revealAt must be in the future' }, 400);
        }

        const valid = await verifyRazorpaySignature(env.RAZORPAY_KEY_SECRET, orderId, paymentId, signature);
        if (!valid) return json({ error: 'Payment verification failed' }, 403);

        // Defense-in-depth: confirm the Razorpay order's amount matches the tier
        // and that it was actually paid in full before granting the event.
        const order = await razorpayGet(env, `/orders/${orderId}`);
        if (order.amount !== t.price * 100 || (order.amount_paid || 0) < order.amount) {
          return json({ error: 'Order not fully paid' }, 403);
        }

        // Idempotency: one event per payment — reuse an existing one if the
        // client retried after a network hiccup.
        const existingRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/events?select=id&payment_id=eq.${encodeURIComponent(paymentId)}`,
          { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SUPABASE_ANON_KEY}` } }
        );
        const existing = await existingRes.json();
        if (existingRes.ok && existing?.[0]?.id) {
          return json({ event: existing[0] });
        }

        // Create the event via Supabase REST (public insert policy).
        const insertRes = await fetch(`${env.SUPABASE_URL}/rest/v1/events`, {
          method: 'POST',
          headers: {
            apikey: env.SUPABASE_ANON_KEY,
            Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
          },
          body: JSON.stringify({
            name: String(eventName).slice(0, 60),
            reveal_at: revealDate.toISOString(),
            max_photos_limit: t.shots,
            max_guests: t.guests,
            plan: tier,
            payment_id: paymentId,
          }),
        });
        const rows = await insertRes.json();
        if (!insertRes.ok || !rows?.[0]) {
          throw new Error(rows?.message || 'Failed to create event');
        }
        return json({ event: rows[0] });
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    // GET /download-url?path=...  ->  { url }
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

    // POST /deliver  body: { eventId, eventName, recipientName, recipientEmail,
    //                       kind, photos: [{ storagePath, guestName }] }
    if (url.pathname === '/deliver' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { eventId, eventName, recipientName, recipientEmail, photos } = body || {};

        if (!UUID_RE.test(eventId || '')) return json({ error: 'Invalid eventId' }, 400);
        if (!EMAIL_RE.test(recipientEmail || '')) return json({ error: 'Invalid recipientEmail' }, 400);
        if (!Array.isArray(photos) || photos.length === 0) return json({ error: 'No photos' }, 400);

        const safeEmail = recipientEmail.toLowerCase();
        const albumKeyBase = `once-films/_deliveries/${eventId}/${safeEmail}`;
        const markerKey = `${albumKeyBase}/sent.marker`;

        // Idempotency fast path — one email per recipient per event, forever.
        if (await objectExists(s3, env, markerKey)) {
          return json({ delivered: true, duplicate: true });
        }

        // Validate + fetch photo bytes from R2 (cap for Worker memory/CPU limits)
        const validPhotos = photos
          .filter((p) => typeof p?.storagePath === 'string' && p.storagePath.startsWith(`once-films/${eventId}/`))
          .slice(0, MAX_ALBUM_PHOTOS);
        if (validPhotos.length === 0) return json({ error: 'No valid photos' }, 400);

        const fetched = [];
        for (const p of validPhotos) {
          try {
            const bytes = await readObject(s3, env, p.storagePath);
            fetched.push({ bytes, guestName: p.guestName, storagePath: p.storagePath });
          } catch (e) {
            // skip objects that failed to read (deleted / mid-upload)
          }
        }
        if (fetched.length === 0) return json({ error: 'Photos unreadable' }, 500);
        const truncated = validPhotos.length > fetched.length || validPhotos.length < photos.length;

        // Build albums
        const zipBytes = buildZip(fetched);
        const pdfBytes = await buildPdf(fetched);

        const slug = slugify(eventName);
        const zipKey = `${albumKeyBase}/${slug}-album.zip`;
        const pdfKey = `${albumKeyBase}/${slug}-album.pdf`;
        await putObject(s3, env, zipKey, zipBytes, 'application/zip');
        if (pdfBytes) await putObject(s3, env, pdfKey, pdfBytes, 'application/pdf');

        // 7-day download links for the email (PDF button omitted when the PDF
        // couldn't be built — sendAlbumEmail handles a null pdfUrl gracefully)
        const zipUrl = await signGetUrl(s3, env, zipKey, 604800);
        const pdfUrl = pdfBytes ? await signGetUrl(s3, env, pdfKey, 604800) : null;
        await sendAlbumEmail(env, {
          recipientName, recipientEmail: safeEmail, eventName,
          pdfUrl, zipUrl, truncated, count: fetched.length,
        });

        // Mark delivered only after a successful send. Best-effort conditional
        // PUT as a race backstop (two simultaneous requests for the same recipient).
        // Any failure here (e.g. R2 412 on the marker, or the AWS SDK failing to
        // deserialize the error XML in Workers) is treated as "someone already
        // claimed it" — the marker itself is only written by the first caller.
        try {
          await s3.send(
            new PutObjectCommand({
              Bucket: env.R2_BUCKET_NAME,
              Key: markerKey,
              Body: new Uint8Array([1]),
              ContentType: 'text/plain',
              IfNoneMatch: '*',
            })
          );
        } catch (markerErr) {
          return json({ delivered: true, duplicate: true });
        }

        return json({ delivered: true, photos: fetched.length, truncated });
      } catch (err) {
        return json({ error: err.message }, 500);
      }
    }

    return json({ error: 'Not found' }, 404);
  },
};

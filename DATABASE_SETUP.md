# Dispcam Data Setup Guide

Dispcam used to run on Firebase (Firestore + Storage). It now runs on:

- **Supabase** — PostgreSQL database (replaces Firestore)
- **Cloudflare R2** — object storage for photos (replaces Firebase Storage)
- **Cloudflare Worker** — signs presigned URLs so the browser can upload straight to R2

---

## 1. Supabase (database)

1. Create a free project at https://supabase.com → **New project** (free plan: 500 MB DB).
2. Open **SQL Editor** and run the contents of `supabase/schema.sql`.
   This creates the `events` and `photos` tables plus the Row-Level Security policies.
3. Go to **Project Settings → API** and copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 2. Cloudflare R2 (photo storage)

1. Create a free account at https://dash.cloudflare.com (R2 free tier: 10 GB-month).
2. **R2 → Create bucket** named `once-films`.
3. **My Profile → API Tokens → Create Token** with *Object Read & Write* permission on that bucket. Save the **Access Key ID** and **Secret Access Key**.

## 3. R2 bucket CORS (required for browser uploads)

The browser uploads the JPEG **directly to R2** — that request is cross-origin and
is not a "simple request" (PUT + Content-Type triggers a preflight). The Worker's
CORS headers do **not** apply to it, so the bucket itself needs a CORS policy:

**R2 → once-films → Settings → CORS Policy** → add:

```json
[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["Content-Type"]
  }
]
```

(Tighten `AllowedOrigins` to your app's domain before production.)

## 4. Cloudflare Worker (signed URLs)

```bash
cd workers
npm install
npx wrangler login
npx wrangler secret put R2_ACCESS_KEY_ID
npx wrangler secret put R2_SECRET_ACCESS_KEY
npx wrangler deploy
```

- `wrangler.toml` already points at bucket `once-films`.
- Set `R2_ACCOUNT_ID` in `wrangler.toml` (your 32-char Cloudflare account ID).
- The deploy output prints the Worker URL → use it for `NEXT_PUBLIC_R2_WORKER_URL`.

Optional: bind a public custom domain (e.g. `media.yourdomain.com`) to the bucket in
**R2 → once-films → Settings → Custom Domains**. Then set `NEXT_PUBLIC_MEDIA_BASE_URL`
and gallery images load as plain public URLs instead of signed URLs.

## 5. App configuration

```bash
cp .env.local.example .env.local
```

Fill in the four `NEXT_PUBLIC_*` values, then build:

```bash
npm run build
```

## 6. How the pieces fit together

| App flow | Old (Firebase) | New (Supabase + R2) |
|---|---|---|
| Create event | Firestore `events` doc | `supabase.from('events').insert(...)` |
| Open room link | Firestore `getDoc` | `supabase.from('events').select().eq('id', ...)` |
| Upload photo | Firebase Storage `uploadBytes` | Worker-signed PUT URL → direct upload to R2 |
| Save photo row | Firestore `photos` doc | `supabase.from('photos').insert(...)` |
| Show gallery | Firestore query + `getDownloadURL` | Supabase query + public/signed R2 URL |

## 7. Notes

- Event IDs are now UUIDs (longer room links — still fine in `?room=...`).
- The RLS policies in `supabase/schema.sql` are deliberately open (read/write for all),
  matching the old Firestore rules. Tighten them before production.
- Free-tier gotchas: Supabase projects pause after ~1 week of inactivity (reactivate
  from the dashboard), and R2 free usage is capped at 10 GB-month / 1M writes / 10M reads.

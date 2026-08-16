import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <title>DispoCam — No Previews. No Retakes.</title>
        <meta name="description" content="DispoCam turns your event into a disposable camera every guest can shoot. No previews, no retakes — developed in time." />
        <meta property="og:title" content="DispoCam — No Previews. No Retakes." />
        <meta property="og:description" content="Turn your event into a disposable camera every guest can shoot. The film develops for everyone at reveal time." />
        <script src="https://cdn.tailwindcss.com"></script>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..700;1,9..144,300..700&family=Manrope:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        {/* Cloudflare Web Analytics — cookie-less, free, unlimited. Activated only
            when NEXT_PUBLIC_CLOUDFLARE_WA_TOKEN is set. "spa": true makes the beacon
            track route changes in this single-page app automatically. */}
        {process.env.NEXT_PUBLIC_CLOUDFLARE_WA_TOKEN && (
          <script
            defer
            src="https://static.cloudflareinsights.com/beacon.min.js"
            data-cf-beacon={`{"token": ${JSON.stringify(process.env.NEXT_PUBLIC_CLOUDFLARE_WA_TOKEN)}, "spa": true}`}
          />
        )}
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}

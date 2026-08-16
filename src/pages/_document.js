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
        {/* PostHog analytics — activated only when NEXT_PUBLIC_POSTHOG_KEY is set.
            capture_pageview:false — the app fires $pageview itself on view changes. */}
        {process.env.NEXT_PUBLIC_POSTHOG_KEY && process.env.NEXT_PUBLIC_POSTHOG_HOST && (
          <script
            dangerouslySetInnerHTML={{
              __html: `!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.async=!0,p.src=s.api_host+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=e[a]||[]:a="_i",u.push(a),u.init=function(){var t=arguments[0],e=arguments[1],o=arguments[2],n=function(t,e){var o=e.split(".");2==o.length&&(u.init[o[0]]=e[o[0]],t=o[0]);for(var n=0;n<t.length;n++)t[n]=t[n]||{};u.init[t[0]]=function(){u.push([t[0]+".init"].concat(Array.prototype.slice.call(arguments,0)))}};for(var r=0;r<o.length;r++)n(o[r],e);return u}(t,e,i,s)},u.init("capture_pageview","capture_pageleave","set_config","identify","register","register_once","unregister","people","set","set_once","unset","opt_in_capturing_snippets","opt_out_capturing_snippets"),u.set_config={}})(document,window.posthog||[]);window.posthog.init(${JSON.stringify(process.env.NEXT_PUBLIC_POSTHOG_KEY)},{api_host:${JSON.stringify(process.env.NEXT_PUBLIC_POSTHOG_HOST)},capture_pageview:false,capture_pageleave:false,disable_session_recording:true,disable_surveys:true});`,
            }}
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

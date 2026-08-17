import Head from 'next/head';

const sections = [
  {
    h: '1. Overview',
    body: 'DispoCam ("we", "us") runs a web platform that turns events into shared digital film rolls. This Privacy Policy explains what information we collect when you use the Service, how we use it, where it is stored, and the choices you have. We keep things minimal: we collect the least information needed to run the Service, and we never sell your data.',
  },
  {
    h: '2. What We Collect',
    body: 'Account information — when you sign in with Google, we receive your email address and display name. Host details — when you create an event we store the event name, reveal time, shot limit, and the email address you choose for album delivery. Guest details — guests provide their name when joining an event, and may optionally add an email to receive their own developed photos. Photos — the photos taken at an event, which are uploaded to our object storage and associated with the event. Payment information — we do not store card or bank details; payments are processed by Razorpay on your behalf.',
  },
  {
    h: '3. How We Use Information',
    body: 'We use your information solely to operate the Service: to create and manage events, to enforce shot limits and reveal timers, to store and deliver photos, to send developed albums by email (via our email provider), to process payments (via Razorpay), to keep the Service secure, and to comply with the law. We do not use photos for advertising, profiling, or any purpose other than the event they belong to.',
  },
  {
    h: '4. Where Data Lives',
    body: 'Your data is stored with the infrastructure providers that power DispoCam: event and account records live in Supabase Postgres (with row-level security), photos live in Cloudflare R2 object storage, uploads flow through a Cloudflare Worker, and emails are sent through Brevo. Each provider processes data only as needed to run the Service.',
  },
  {
    h: '5. Sharing & Disclosure',
    body: 'We do not sell, rent, or trade your personal information. We share data only with the service providers listed above, and only to the extent needed to operate the Service. We may disclose information if required by law, or to protect the rights, safety, and property of DispoCam, our users, or the public.',
  },
  {
    h: '6. Retention & Deletion',
    body: 'Event records and their photos are retained while the event exists. You can ask us to delete an event (and its photos) at any time by contacting us, and we will remove it from our database and object storage. Account records can be deleted by contacting us or by closing your Google sign-in; photos you took remain part of the event host\u2019s roll until that event is deleted.',
  },
  {
    h: '7. Your Rights',
    body: 'You may request access to, correction of, or deletion of your personal information at any time by emailing us. Where the law gives you a right to data portability, we will provide your data in a structured, commonly used format on request. We respond to verified requests within 30 days.',
  },
  {
    h: '8. Cookies & Analytics',
    body: 'DispoCam uses Cloudflare Web Analytics, which is cookieless — it does not set tracking cookies and does not use fingerprinting to identify individuals. It helps us understand, in aggregate, how many people visit and which parts of the app they use. We do not use third-party advertising cookies.',
  },
  {
    h: '9. Children\u2019s Privacy',
    body: 'The Service is not directed at children under 13, and we do not knowingly collect personal information from them. If you believe a child under 13 has provided us personal information, contact us and we will delete it.',
  },
  {
    h: '10. Security',
    body: 'We protect your data with row-level security on the database, server-side validation of photo uploads (including shot-limit and reveal-time enforcement), encrypted transport, and secrets stored as encrypted worker secrets rather than in code. No system is perfectly secure, but we follow industry-standard practices for a service of this size.',
  },
  {
    h: '11. Changes to this Policy',
    body: 'We may update this Privacy Policy from time to time. Material changes will be reflected by an updated "Last updated" date on this page. Continued use of the Service after changes take effect constitutes acceptance of the updated policy.',
  },
  {
    h: '12. Contact',
    body: 'Questions or privacy requests? Email us at varnityadav02001@gmail.com.',
  },
];

export default function Privacy() {
  return (
    <>
      <Head>
        <title>Privacy Policy — DispoCam</title>
        <meta name="description" content="DispoCam Privacy Policy — what we collect, how we use it, and the choices you have." />
        <meta property="og:title" content="Privacy Policy — DispoCam" />
      </Head>
      <div className="min-h-screen bg-[#0A0A0A] text-[#F5F5F7] antialiased">
        <style>{`
          body { font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif; background-color: #0A0A0A; }
          .font-display { font-family: 'Fraunces', Georgia, serif; font-optical-sizing: auto; }
          .font-serif-accent { font-family: 'Fraunces', Georgia, serif; font-style: italic; font-optical-sizing: auto; }
        `}</style>

        {/* nav */}
        <header className="sticky top-0 z-50 bg-[#0A0A0A]/85 backdrop-blur-md border-b border-[#1C1C1E]">
          <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
            <a href="/" className="font-display text-lg tracking-tight text-white">
              Dispo<span className="text-amber-500">Cam</span>.
            </a>
            <a href="/" className="text-xs uppercase tracking-[0.2em] text-neutral-500 hover:text-white transition-colors">
              ← Back to app
            </a>
          </div>
        </header>

        {/* body */}
        <main className="max-w-3xl mx-auto px-6 py-16 md:py-24">
          <p className="text-[11px] uppercase tracking-[0.3em] text-amber-500/90 mb-4">Legal</p>
          <h1 className="font-display text-4xl md:text-5xl tracking-tight text-white">
            Privacy <span className="font-serif-accent text-amber-400/90">Policy</span>
          </h1>
          <p className="mt-4 text-sm text-neutral-500">Last updated: August 17, 2026</p>

          <div className="mt-12 space-y-10">
            {sections.map((s) => (
              <section key={s.h}>
                <h2 className="font-display text-xl text-amber-400/90 tracking-tight">{s.h}</h2>
                <p className="mt-3 text-[15px] leading-relaxed text-neutral-400">{s.body}</p>
              </section>
            ))}
          </div>
        </main>

        {/* footer */}
        <footer className="border-t border-[#1C1C1E] py-10">
          <div className="max-w-3xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-xs text-neutral-600">© 2026 DispoCam — No Previews. No Retakes.</p>
            <div className="flex gap-6 text-xs text-neutral-500">
              <a href="/terms.html" className="hover:text-white transition-colors">Terms</a>
              <a href="/privacy.html" className="text-amber-500/90 hover:text-amber-400 transition-colors">Privacy</a>
              <a href="/" className="hover:text-white transition-colors">Home</a>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}

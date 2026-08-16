import Head from 'next/head';

const sections = [
  {
    h: '1. Agreement to these Terms',
    body: 'These Terms of Service ("Terms") govern your access to and use of DispoCam ("the Service", "we", "us"), a web platform that turns events into shared digital film rolls. By creating an event, joining an event, uploading a photo, or otherwise using the Service, you agree to these Terms. If you do not agree, please do not use the Service.',
  },
  {
    h: '2. The Service',
    body: 'DispoCam lets a host create an event with a reveal time and a fixed shot limit. Guests join by scanning a permanent QR code or opening a shared link, take photos from their own phones, and the gallery "develops" for everyone when the timer ends — no previews, no retakes, exactly like a real disposable camera. Developed photos are delivered to the host by email and can be shared with guests.',
  },
  {
    h: '3. Accounts & Eligibility',
    body: 'You must be at least 13 years old to use the Service. Creating an event requires a signed-in account (via Google sign-in or phone verification). You are responsible for keeping your login credentials secure and for everything done through your account. Guests do not need an account to take photos, but provide their name to join an event and may optionally add an email to receive their own developed photos.',
  },
  {
    h: '4. Events, Shots & Reveal Timers',
    body: 'The host chooses the shot limit and reveal time when creating an event. A database-enforced rule prevents photos from being taken after the reveal time or beyond the shot limit. We are not responsible if you exceed your plan limits, and additional capacity is available through paid tiers described on the Service.',
  },
  {
    h: '5. Your Photos & Content',
    body: 'You retain ownership of the photos you take. By uploading a photo to the Service you grant DispoCam a limited, non-exclusive license to store, process and deliver that photo solely to operate the Service (for example, storing it in object storage, applying filters, and emailing developed albums). You confirm that you have the right to share the photos you upload, and that they do not violate anyone\u2019s rights, privacy, or any applicable law.',
  },
  {
    h: '6. Payments & Refunds',
    body: 'Paid tiers are processed through Razorpay, our payment partner, in Indian Rupees via UPI, cards or other methods Razorpay supports. Payment details are collected and handled by Razorpay under its own terms and privacy policy — we never store your card or bank details. If an event you paid for cannot be delivered (for example, no photos were taken before the reveal time), you may request a refund within 7 days of purchase by contacting us; refunds are processed back to the original payment method.',
  },
  {
    h: '7. Acceptable Use',
    body: 'You agree not to: upload illegal, infringing, harassing or obscene content; attempt to access events or photos you are not authorised to view; interfere with or disrupt the Service, its databases or infrastructure; bypass shot limits, reveal timers or security controls; or use the Service to collect photos of people without their consent where the law requires it.',
  },
  {
    h: '8. Intellectual Property',
    body: 'The DispoCam name, logo, design, and software are owned by DispoCam. Nothing in these Terms grants you any right to use our branding without our written permission.',
  },
  {
    h: '9. Disclaimer of Warranties',
    body: 'The Service is provided "as is" and "as available" without warranties of any kind, whether express or implied. We do not warrant that the Service will be uninterrupted, error-free, or that photos will be preserved indefinitely. While we take reasonable care of your photos, we recommend hosts keep their own copies of anything important.',
  },
  {
    h: '10. Limitation of Liability',
    body: 'To the maximum extent permitted by law, DispoCam shall not be liable for indirect, incidental, special or consequential damages, or for loss of data or photos, arising out of your use of the Service. Our total liability for any claim relating to the Service shall not exceed the amount you paid us in the 30 days before the claim.',
  },
  {
    h: '11. Termination',
    body: 'We may suspend or terminate access to the Service, or delete content, if we reasonably believe you have violated these Terms or the law. You may stop using the Service at any time; deleting your account removes your ability to sign in, though event and photo data you shared with others is managed by each event\u2019s host.',
  },
  {
    h: '12. Changes to these Terms',
    body: 'We may update these Terms from time to time. Material changes will be noted on this page with an updated "Last updated" date. Continued use of the Service after changes take effect means you accept the updated Terms.',
  },
  {
    h: '13. Governing Law',
    body: 'These Terms are governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of the courts of Delhi, India.',
  },
  {
    h: '14. Contact',
    body: 'Questions about these Terms? Reach us at varnityadav02001@gmail.com.',
  },
];

export default function Terms() {
  return (
    <>
      <Head>
        <title>Terms of Service — DispoCam</title>
        <meta name="description" content="DispoCam Terms of Service — how the shared digital film roll platform works." />
        <meta property="og:title" content="Terms of Service — DispoCam" />
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
            Terms of <span className="font-serif-accent text-amber-400/90">Service</span>
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
              <a href="/terms.html" className="text-amber-500/90 hover:text-amber-400 transition-colors">Terms</a>
              <a href="/privacy.html" className="hover:text-white transition-colors">Privacy</a>
              <a href="/" className="hover:text-white transition-colors">Home</a>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}

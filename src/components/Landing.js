import { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';

// ─────────────────────────────────────────────────────────────────────────────
// Placeholder photography — swap these for real R2 photos later.
// Each URL is a verified Unsplash image ID.
// ─────────────────────────────────────────────────────────────────────────────
const IMG = (id, w = 1000) => `https://images.unsplash.com/${id}?w=${w}&q=80&auto=format&fit=crop`;

const PHOTOS = {
  wedding:  IMG('photo-1519741497674-611481863552'),
  birthday: IMG('photo-1558636508-e0db3814bd1d'),
  party:    IMG('photo-1513151233558-d860c5398176'),
  trip:     IMG('photo-1507525428034-b723cf961d3e'),
  everyday: IMG('photo-1495954484750-af469f2f9be5'),
  heroConfetti: IMG('photo-1492684223066-81342ee5ff30'),
  heroToast:    IMG('photo-1469371670807-013ccf25f16a'),
  heroCrowd:    IMG('photo-1470225620780-dba8ba36b745'),
  heroRoad:     IMG('photo-1500530855697-b586d89ba3ee'),
};

const NAV_LINKS = [
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Use cases',    href: '#use-cases' },
  { label: 'FAQ',          href: '#faq' },
];

const USE_CASES = [
  { name: 'Wedding',   photo: PHOTOS.wedding,   note: 'Every guest becomes your second photographer.' },
  { name: 'Birthday',  photo: PHOTOS.birthday,  note: 'Candles, chaos, and the shots you’d never take.' },
  { name: 'Party',     photo: PHOTOS.party,     note: 'The dance floor through thirty pairs of eyes.' },
  { name: 'Trip',      photo: PHOTOS.trip,      note: 'One roll shared across the whole crew.' },
  { name: 'Everyday',  photo: PHOTOS.everyday,  note: 'The unremarkable days worth remembering.' },
];

const STEPS = [
  { n: '01', title: 'Create a film', body: 'Name your event, set the reveal timer, and cap how many shots the roll holds.' },
  { n: '02', title: 'Invite your people', body: 'Share the link or the permanent QR code. Guests join instantly — no app, no accounts.' },
  { n: '03', title: 'Capture together', body: 'Every guest shoots into the same shared roll. No previews, no retakes — it all develops at reveal.' },
];

const FAQS = [
  { q: 'How does Dispcam work?', a: 'You create an event and get a link plus a permanent QR code. Guests open it, add their name, and shoot into a shared film roll with a fixed number of shots. When the reveal timer ends, the gallery develops for everyone.' },
  { q: 'Do guests need to install anything?', a: 'No. Everything runs in the browser — scan the QR or tap the link and they’re in. No app stores, no accounts, no downloads.' },
  { q: 'When do the photos reveal?', a: 'You set a timer when creating the event. Until it runs out, every shot stays sealed — no previews for anyone, not even you.' },
  { q: 'Can guests see their photos before reveal?', a: 'No previews, no retakes. A shot is committed the instant the shutter fires. That’s what makes it feel like real film.' },
  { q: 'Who can see the photos afterwards?', a: 'Anyone with the event link. After the reveal, the developed gallery opens, and you can share it anywhere.' },
  { q: 'Why is it called Dispcam?', a: 'A disposable camera, reborn. Life happens once — don’t let it fade away.' },
];

const MARQUEE_ITEMS = ['NO PREVIEWS', 'NO RETAKES', 'SHARED FILM ROLL', 'ONE DAY — ONE ROLL', 'DEVELOPED IN TIME'];

// ─────────────────────────────────────────────────────────────────────────────

export default function Landing({ onCreateEvent }) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);
  const [siteQr, setSiteQr] = useState('');
  const progressRef = useRef(null);

  // Real QR code for the site (decorative touch inside "Invite your people")
  useEffect(() => {
    if (typeof window !== 'undefined') {
      QRCode.toDataURL(window.location.origin, { width: 240, margin: 1, color: { dark: '#0A0A0A', light: '#FFFFFF' } })
        .then(setSiteQr)
        .catch(() => {});
    }
  }, []);

  // Scroll-driven state: nav blur, progress bar, parallax, hero zoom
  useEffect(() => {
    let raf = null;
    const update = () => {
      const y = window.scrollY || 0;
      setScrolled(y > 24);
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (progressRef.current) {
        progressRef.current.style.width = `${max > 0 ? Math.min((y / max) * 100, 100) : 0}%`;
      }

      const hero = document.querySelector('[data-hero-zoom]');
      if (hero) hero.style.transform = `scale(${Math.max(1.08 - (y / 700) * 0.08, 1)})`;

      document.querySelectorAll('[data-parallax]').forEach((el) => {
        el.style.transform = `translateY(${(y * parseFloat(el.dataset.parallax)).toFixed(1)}px)`;
      });
      raf = null;
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    window.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Loewe-style reveals: clip-path unmask + rise, staggered via data-delay
  useEffect(() => {
    const els = document.querySelectorAll('[data-reveal-clip], [data-reveal-rise]');
    const timers = [];
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const delay = parseInt(entry.target.dataset.delay || '0', 10);
            timers.push(setTimeout(() => entry.target.classList.add('is-visible'), delay));
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -8% 0px' }
    );
    els.forEach((el) => io.observe(el));
    return () => {
      io.disconnect();
      timers.forEach((t) => clearTimeout(t));
    };
  }, []);

  const scrollTo = (href) => {
    setMenuOpen(false);
    document.querySelector(href)?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleCreate = () => {
    if (typeof window !== 'undefined') window.scrollTo(0, 0);
    onCreateEvent();
  };

  return (
    <div className="relative min-h-screen bg-[#0A0A0A] text-[#F5F5F7] font-body antialiased overflow-x-hidden">
      <style>{`
        body { font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; }
        .font-display { font-family: 'Space Grotesk', ui-sans-serif, system-ui, sans-serif; }
        .font-serif-accent { font-family: 'Instrument Serif', Georgia, serif; font-style: italic; }
        html { scroll-behavior: smooth; }

        .marquee-track { display: flex; width: max-content; animation: marquee 32s linear infinite; }
        @keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }

        .reveal-clip { clip-path: inset(0 0 100% 0); transition: clip-path 1.2s cubic-bezier(0.16, 1, 0.3, 1); }
        .reveal-clip.is-visible { clip-path: inset(0 0 0% 0); }

        .reveal-rise { opacity: 0; transform: translateY(34px); transition: opacity 0.9s ease, transform 0.9s cubic-bezier(0.16, 1, 0.3, 1); }
        .reveal-rise.is-visible { opacity: 1; transform: translateY(0); }

        .grain-overlay {
          position: fixed; inset: 0; z-index: 70; pointer-events: none; opacity: 0.05; mix-blend-mode: overlay;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
        }

        .sprockets {
          background-image: radial-gradient(circle at center, rgba(245, 245, 247, 0.35) 2.5px, transparent 3px);
          background-size: 26px 20px; background-position: center 50%;
        }

        .outline-text { color: transparent; -webkit-text-stroke: 1px rgba(245, 245, 247, 0.28); }

        .faq-answer { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 0.5s cubic-bezier(0.16, 1, 0.3, 1); }
        .faq-answer.open { grid-template-rows: 1fr; }
        .faq-answer > div { overflow: hidden; }

        @media (prefers-reduced-motion: reduce) {
          .reveal-clip, .reveal-rise { transition: none; clip-path: none; opacity: 1; transform: none; }
          .marquee-track { animation: none; }
        }
      `}</style>

      <div className="grain-overlay" aria-hidden="true" />

      {/* Scroll progress bar */}
      <div className="fixed top-0 left-0 right-0 z-[60] h-[2px] bg-transparent">
        <div ref={progressRef} className="h-full bg-amber-500 origin-left" style={{ width: '0%' }} />
      </div>

      {/* ── NAV ─────────────────────────────────────────────────────────── */}
      <nav className={`fixed top-0 inset-x-0 z-50 transition-all duration-500 ${scrolled ? 'bg-[#0A0A0A]/85 backdrop-blur-md border-b border-[#1C1C1E]' : 'bg-transparent'}`}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <button onClick={handleCreate} className="font-display text-lg tracking-tight text-white">
            Disp<span className="text-amber-500">cam</span>.
          </button>

          <div className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map((l) => (
              <button key={l.href} onClick={() => scrollTo(l.href)} className="text-[13px] tracking-wide text-neutral-400 hover:text-white transition-colors uppercase">
                {l.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleCreate}
              className="hidden md:inline-block bg-white text-black text-[13px] font-medium px-5 py-2.5 rounded-full hover:bg-amber-400 transition-colors shadow-lg"
            >
              Create an Event
            </button>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Menu"
              className="md:hidden w-10 h-10 flex flex-col items-center justify-center gap-1.5 border border-[#2C2C2E] rounded-full"
            >
              <span className={`block w-4 h-px bg-white transition-transform ${menuOpen ? 'rotate-45 translate-y-[3.5px]' : ''}`} />
              <span className={`block w-4 h-px bg-white transition-transform ${menuOpen ? '-rotate-45 -translate-y-[3.5px]' : ''}`} />
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="md:hidden bg-[#0D0D0F] border-t border-[#1C1C1E] px-6 py-6 space-y-4">
            {NAV_LINKS.map((l) => (
              <button key={l.href} onClick={() => scrollTo(l.href)} className="block text-sm text-neutral-300 uppercase tracking-wide">
                {l.label}
              </button>
            ))}
            <button onClick={handleCreate} className="w-full bg-white text-black text-sm font-medium py-3 rounded-full">
              Create an Event
            </button>
          </div>
        )}
      </nav>

      {/* ── HERO ────────────────────────────────────────────────────────── */}
      <section className="relative pt-32 md:pt-40 pb-16 md:pb-24">
        <div className="max-w-6xl mx-auto px-6 grid md:grid-cols-2 gap-14 items-center">
          {/* Copy */}
          <div>
            <p data-reveal-rise className="text-[11px] uppercase tracking-[0.3em] text-amber-500/90 mb-6 font-medium">
              A shared film roll for your event
            </p>
            <h1 data-reveal-rise data-delay="100" className="font-display text-[42px] leading-[1.02] md:text-[64px] tracking-tight text-white">
              Capture your day through{' '}
              <span className="font-serif-accent text-amber-400/90">everyone’s eyes.</span>
            </h1>
            <p data-reveal-rise data-delay="220" className="mt-7 text-base md:text-lg text-neutral-400 leading-relaxed max-w-md">
              Dispcam turns your event into a disposable camera every guest can shoot.
              Scan the QR — no app, no signup — snap a limited roll of shots, and the
              film develops for everyone at reveal time.
            </p>
            <div data-reveal-rise data-delay="340" className="mt-9 flex flex-wrap items-center gap-4">
              <button onClick={handleCreate} className="bg-white text-black text-sm font-semibold px-8 py-4 rounded-full hover:bg-amber-400 hover:scale-[1.03] active:scale-[0.98] transition-all shadow-2xl">
                Create an Event
              </button>
              <button onClick={() => scrollTo('#how-it-works')} className="text-sm text-neutral-300 border border-[#2C2C2E] px-8 py-4 rounded-full hover:border-amber-500/60 hover:text-amber-400 transition-colors">
                See how it works
              </button>
            </div>
            <p data-reveal-rise data-delay="460" className="mt-6 text-xs text-neutral-600">
              Free to create · Guests need nothing to install
            </p>
          </div>

          {/* Loewe-style photo collage */}
          <div className="relative h-[440px] md:h-[520px] select-none" data-hero-zoom>
            <div className="absolute left-0 top-6 w-[58%] rotate-[-3deg]" data-parallax="0.06">
              <div className="bg-[#1C1C1E] border border-[#2C2C2E] p-2 pb-3 rounded-lg shadow-2xl">
                <img src={PHOTOS.heroConfetti} alt="Confetti over a crowd" loading="lazy" className="w-full aspect-[4/5] object-cover rounded" />
                <p className="mt-2 pl-1 text-[10px] uppercase tracking-widest text-neutral-500">Shot 07 · the toast</p>
              </div>
            </div>
            <div className="absolute right-0 top-0 w-[50%] rotate-[4deg] z-10" data-parallax="-0.04">
              <div className="bg-[#1C1C1E] border border-[#2C2C2E] p-2 pb-3 rounded-lg shadow-2xl">
                <img src={PHOTOS.heroToast} alt="Wedding toast glasses" loading="lazy" className="w-full aspect-[4/5] object-cover rounded" />
                <p className="mt-2 pl-1 text-[10px] uppercase tracking-widest text-neutral-500">Shot 02 · everyone’s eyes</p>
              </div>
            </div>
            <div className="absolute left-[8%] bottom-0 w-[42%] rotate-[2deg] z-20" data-parallax="0.12">
              <div className="bg-[#1C1C1E] border border-[#2C2C2E] p-2 pb-3 rounded-lg shadow-2xl">
                <img src={PHOTOS.heroCrowd} alt="Concert crowd" loading="lazy" className="w-full aspect-[4/5] object-cover rounded" />
                <p className="mt-2 pl-1 text-[10px] uppercase tracking-widest text-neutral-500">Shot 13 · the dance floor</p>
              </div>
            </div>
            <div className="absolute right-[6%] bottom-[12%] w-[36%] rotate-[-5deg] z-30" data-parallax="0.02">
              <div className="bg-[#1C1C1E] border border-[#2C2C2E] p-2 pb-3 rounded-lg shadow-2xl">
                <img src={PHOTOS.heroRoad} alt="Open road trip" loading="lazy" className="w-full aspect-[4/5] object-cover rounded" />
                <p className="mt-2 pl-1 text-[10px] uppercase tracking-widest text-neutral-500">Shot 19 · out the window</p>
              </div>
            </div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40">
              <div className="bg-amber-500 text-black font-display text-xs font-bold px-4 py-2 rounded-full rotate-[-4deg] shadow-xl">
                12 SHOTS LEFT
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── MARQUEE ─────────────────────────────────────────────────────── */}
      <section className="border-y border-[#1C1C1E] py-5 overflow-hidden" aria-hidden="true">
        <div className="marquee-track">
          {[0, 1].map((dup) => (
            <div key={dup} className="flex shrink-0">
              {MARQUEE_ITEMS.map((item, i) => (
                <span key={i} className="flex items-center gap-6 px-6">
                  <span className="outline-text font-display text-2xl md:text-3xl font-semibold whitespace-nowrap">{item}</span>
                  <span className="text-amber-500 text-lg">✦</span>
                </span>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* ── NEUTRAL STATS BAND ──────────────────────────────────────────── */}
      <section className="py-20 md:py-28 border-b border-[#1C1C1E]">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-10">
          {[
            { v: '0', l: 'Previews', d: 'Every shot stays sealed until the reveal.' },
            { v: '0', l: 'Retakes', d: 'One shutter press per moment — that’s the point.' },
            { v: '0', l: 'Installs', d: 'Guests join from the link or QR, right in the browser.' },
            { v: '∞', l: 'Memories', d: 'Your developed gallery lives on, forever.' },
          ].map((s, i) => (
            <div key={s.l} data-reveal-rise data-delay={i * 100} className="text-center md:text-left">
              <p className="font-display text-5xl md:text-6xl font-semibold text-white">{s.v}</p>
              <p className="mt-2 text-[11px] uppercase tracking-[0.25em] text-amber-500 font-medium">{s.l}</p>
              <p className="mt-2 text-sm text-neutral-500 leading-relaxed">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── USE CASES ───────────────────────────────────────────────────── */}
      <section id="use-cases" className="py-24 md:py-32">
        <div className="max-w-6xl mx-auto px-6">
          <p data-reveal-rise className="text-[11px] uppercase tracking-[0.3em] text-amber-500/90 mb-4 font-medium">Use cases</p>
          <h2 data-reveal-rise data-delay="80" className="font-display text-4xl md:text-6xl tracking-tight text-white max-w-2xl">
            “Your guests captured moments{' '}
            <span className="font-serif-accent text-amber-400/90">you never saw.</span>”
          </h2>

          <div className="mt-16 grid md:grid-cols-6 gap-4">
            {USE_CASES.map((uc, i) => (
              <div
                key={uc.name}
                data-reveal-clip
                data-delay={i * 120}
                className={`group relative overflow-hidden rounded-2xl bg-[#121214] border border-[#1C1C1E] ${i === 0 ? 'md:col-span-4 md:row-span-2' : 'md:col-span-2'}`}
              >
                <div className={`${i === 0 ? 'aspect-[16/10] md:h-full md:aspect-auto' : 'aspect-[4/5]'} overflow-hidden`}>
                  <img
                    src={uc.photo}
                    alt={uc.name}
                    loading="lazy"
                    className="w-full h-full object-cover grayscale-[35%] group-hover:grayscale-0 group-hover:scale-[1.05] transition-all duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
                  />
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent flex flex-col justify-end p-6">
                  <p className="font-display text-2xl md:text-3xl text-white tracking-tight">{uc.name}</p>
                  <p className="mt-1 text-xs text-neutral-400 opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-500 max-w-[240px]">
                    {uc.note}
                  </p>
                </div>
                <span className="absolute top-4 left-4 text-[10px] uppercase tracking-widest text-neutral-500 bg-black/50 backdrop-blur px-2.5 py-1 rounded-full border border-white/10">
                  Film {String(i + 1).padStart(2, '0')}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ────────────────────────────────────────────────── */}
      <section id="how-it-works" className="py-24 md:py-32 bg-[#0D0D0F] border-y border-[#1C1C1E]">
        <div className="max-w-6xl mx-auto px-6">
          <p data-reveal-rise className="text-[11px] uppercase tracking-[0.3em] text-amber-500/90 mb-4 font-medium">How it works</p>
          <h2 data-reveal-rise data-delay="80" className="font-display text-4xl md:text-6xl tracking-tight text-white">
            How a day becomes{' '}
            <span className="font-serif-accent text-amber-400/90">a film.</span>
          </h2>

          <div className="mt-16 grid md:grid-cols-3 gap-5">
            {STEPS.map((s, i) => (
              <div key={s.n} data-reveal-rise data-delay={i * 150} className="relative bg-[#121214] border border-[#1C1C1E] rounded-2xl p-8 overflow-hidden group hover:border-amber-500/40 transition-colors duration-500">
                <p className="font-display text-5xl font-semibold text-white/10 group-hover:text-amber-500/30 transition-colors duration-500">STEP {s.n}</p>
                <div className="mt-6">
                  {i === 1 && siteQr ? (
                    <div className="inline-block bg-white p-3 rounded-xl rotate-[-2deg] shadow-xl mb-6">
                      <img src={siteQr} alt="Event QR code" className="w-24 h-24 block" />
                    </div>
                  ) : (
                    <div className={`mb-6 w-14 h-14 rounded-2xl border border-amber-500/30 bg-amber-500/10 flex items-center justify-center text-amber-400 ${i === 0 ? '' : i === 2 ? 'rotate-[4deg]' : 'rotate-[-4deg]'}`}>
                      {i === 0 ? (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
                      ) : i === 2 ? (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg>
                      ) : null}
                    </div>
                  )}
                  <h3 className="font-display text-xl text-white tracking-tight">{s.title}</h3>
                  <p className="mt-3 text-sm text-neutral-400 leading-relaxed">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────────────────── */}
      <section id="faq" className="py-24 md:py-32">
        <div className="max-w-3xl mx-auto px-6">
          <p data-reveal-rise className="text-[11px] uppercase tracking-[0.3em] text-amber-500/90 mb-4 font-medium">FAQ</p>
          <h2 data-reveal-rise data-delay="80" className="font-display text-4xl md:text-5xl tracking-tight text-white">
            Frequently asked{' '}
            <span className="font-serif-accent text-amber-400/90">questions.</span>
          </h2>

          <div className="mt-12 divide-y divide-[#1C1C1E] border-y border-[#1C1C1E]">
            {FAQS.map((f, i) => (
              <div key={f.q}>
                <button
                  onClick={() => setOpenFaq(openFaq === i ? -1 : i)}
                  aria-expanded={openFaq === i}
                  className="w-full flex items-center justify-between gap-6 py-6 text-left group"
                >
                  <span className={`font-display text-base md:text-lg tracking-tight transition-colors ${openFaq === i ? 'text-amber-400' : 'text-white group-hover:text-amber-400/80'}`}>
                    {f.q}
                  </span>
                  <span className={`shrink-0 w-8 h-8 rounded-full border border-[#2C2C2E] flex items-center justify-center text-neutral-400 transition-transform duration-500 ${openFaq === i ? 'rotate-45 border-amber-500/50 text-amber-400' : ''}`}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7 1v12M1 7h12"/></svg>
                  </span>
                </button>
                <div className={`faq-answer ${openFaq === i ? 'open' : ''}`}>
                  <div>
                    <p className="pb-6 pr-10 text-sm text-neutral-400 leading-relaxed">{f.a}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ───────────────────────────────────────────────────── */}
      <section className="relative py-28 md:py-40 overflow-hidden border-t border-[#1C1C1E]">
        <div className="absolute inset-0">
          <img src={PHOTOS.heroConfetti} alt="" loading="lazy" className="w-full h-full object-cover opacity-20 blur-[2px]" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#0A0A0A] via-[#0A0A0A]/70 to-[#0A0A0A]" />
        </div>
        <div className="relative max-w-3xl mx-auto px-6 text-center">
          <p data-reveal-rise className="font-serif-accent text-4xl md:text-6xl text-white leading-tight">
            Life happens once.
            <br />
            <span className="text-amber-400/90">Don’t let it fade away.</span>
          </p>
          <div data-reveal-rise data-delay="150" className="mt-10">
            <button onClick={handleCreate} className="bg-white text-black text-sm font-semibold px-10 py-4 rounded-full hover:bg-amber-400 hover:scale-[1.03] active:scale-[0.98] transition-all shadow-2xl">
              Create your event
            </button>
          </div>
          <p data-reveal-rise data-delay="280" className="mt-6 text-xs text-neutral-500">
            Your camera is already waiting. No download needed.
          </p>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────────────── */}
      <footer className="bg-[#080808] border-t border-[#1C1C1E] pt-16 pb-10">
        <div className="max-w-6xl mx-auto px-6">
          <p data-reveal-rise className="font-serif-accent text-2xl md:text-3xl text-neutral-300 max-w-xl">
            “A single day becomes timeless, when remembered together.”
          </p>
          <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-10">
            <div>
              <p className="text-[11px] uppercase tracking-[0.25em] text-neutral-600 mb-4">Product</p>
              <button onClick={() => scrollTo('#how-it-works')} className="block text-sm text-neutral-400 hover:text-white py-1 transition-colors">How it works</button>
              <button onClick={() => scrollTo('#faq')} className="block text-sm text-neutral-400 hover:text-white py-1 transition-colors">FAQ</button>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.25em] text-neutral-600 mb-4">Use cases</p>
              {['Wedding', 'Party', 'Trip', 'Everyday'].map((u) => (
                <button key={u} onClick={() => scrollTo('#use-cases')} className="block text-sm text-neutral-400 hover:text-white py-1 transition-colors">{u}</button>
              ))}
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.25em] text-neutral-600 mb-4">Company</p>
              <button onClick={handleCreate} className="block text-sm text-neutral-400 hover:text-white py-1 transition-colors">Create an event</button>
              <p className="block text-sm text-neutral-600 py-1">Privacy</p>
              <p className="block text-sm text-neutral-600 py-1">Terms</p>
            </div>
            <div className="col-span-2 md:col-span-1">
              <p className="text-[11px] uppercase tracking-[0.25em] text-neutral-600 mb-4">Dispcam</p>
              <p className="text-sm text-neutral-500 leading-relaxed">No Previews. No Retakes. One roll per event, developed in time.</p>
            </div>
          </div>
          <div className="mt-14 pt-6 border-t border-[#1C1C1E] flex flex-col md:flex-row items-center justify-between gap-4">
            <button onClick={handleCreate} className="font-display text-base tracking-tight text-white">
              Disp<span className="text-amber-500">cam</span>.
            </button>
            <p className="text-xs text-neutral-600">© 2026 Dispcam — No Previews. No Retakes.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

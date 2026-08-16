import { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { TIER_LIST as PRICING } from '../lib/pricing';

// ─────────────────────────────────────────────────────────────────────────────
// Photography:
//  - ONCE_HERO: once.film's actual hero cutouts (hand holding phone + phone + photo), Framer CDN
//  - LOEWE: photos taken from the Loewe website (Demandware CDN, all verified live)
// Swap these for real R2 photos later.
// ─────────────────────────────────────────────────────────────────────────────
const LOEWE = {
  campaign1: 'https://www.loewe.com/dw/image/v2/BBPC_PRD/on/demandware.static/-/Library-Sites-LOW_SharedLibrary/default/dw465c85a3/00000%20FW26%20PRECO/MAIN%20CAMPAIGN/LOEWE_FW26_PRECO_CAMPAIGN_ISLA_JOHNSTON_sRGB_CROPPED_36_3x4.jpg?sw=900&sfrm=jpg',
  campaign2: 'https://www.loewe.com/dw/image/v2/BBPC_PRD/on/demandware.static/-/Library-Sites-LOW_SharedLibrary/default/dw120a234d/00000%20FW26%20PRECO/MAIN%20CAMPAIGN/LOEWE_FW26_PRECO_CAMPAIGN_SEYDOU_SARR_sRGB_CROPPED_33_3x4.jpg?sw=900&sfrm=jpg',
  rtw: 'https://www.loewe.com/dw/image/v2/BBPC_PRD/on/demandware.static/-/Library-Sites-LOW_SharedLibrary/default/dw04049853/00000%20FW26%20PRECO/SECONDARY%20CONTENT/LOEWE_FW26_PRECO_NEW_RTW_AND_SHOES_RGB_CROPPED_1_3x4.jpg?sw=900&sfrm=jpg',
  amazona: 'https://www.loewe.com/dw/image/v2/BBPC_PRD/on/demandware.static/-/Sites-Loewe_master/default/dw23813955/images_rd/H526Y18LBA/H526Y18LBA-3110/H526Y18LBA_3110_1A.jpg?sw=900&q=90',
  puzzle: 'https://www.loewe.com/dw/image/v2/BBPC_PRD/on/demandware.static/-/Sites-Loewe_master/default/dw65f74ffd/images_rd/H526Y14KOG/H526Y14KOG-2999/H526Y14KOG_2999_1A.jpg?sw=900&q=90',
};

const ONCE_HERO = {
  hand: 'https://framerusercontent.com/images/A2ETSqowwVCip7gmjzRg3HUf38U.png',
  phone: 'https://framerusercontent.com/images/xuNve9xG0Hr2fNU3RQQanJvL0bg.png',
};

// Ambient party-lights backdrop — no people, just the bokeh vibes. Swap anytime.
const PARTY_BG = 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=1920&q=70';

// Sample frames spooling through the marquee film reel
const REEL_FRAMES = [LOEWE.campaign1, LOEWE.amazona, LOEWE.campaign2, LOEWE.rtw];

const NAV_LINKS = [
  { label: 'Events',      href: '#events', app: true },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Pricing',      href: '#pricing' },
  { label: 'Use cases',    href: '#use-cases' },
  { label: 'FAQ',          href: '#faq' },
];

const USE_CASES = [
  { name: 'Wedding',   photo: LOEWE.campaign1, note: 'Every guest becomes your second photographer.' },
  { name: 'Birthday',  photo: LOEWE.campaign2, note: 'Candles, chaos, and the shots you’d never take.' },
  { name: 'Party',     photo: LOEWE.rtw,       note: 'The dance floor through thirty pairs of eyes.' },
  { name: 'Trip',      photo: LOEWE.amazona,   note: 'One roll shared across the whole crew.' },
  { name: 'Everyday',  photo: LOEWE.puzzle,    note: 'The unremarkable days worth remembering.' },
];

const STEPS = [
  { n: '01', title: 'Create a film', body: 'Name your event, set the reveal timer, and cap how many shots the roll holds.' },
  { n: '02', title: 'Invite your people', body: 'Share the link or the permanent QR code. Guests join instantly — no app, no accounts.' },
  { n: '03', title: 'Capture together', body: 'Every guest shoots into the same shared roll. No previews, no retakes — it all develops at reveal.' },
];

// Pricing bundles now come from src/lib/pricing.js (single source of truth,
// shared with the host form) — prices can't drift between the landing page
// and the app anymore.

const FAQS = [
  { q: 'How does DispoCam work?', a: 'You create an event and get a link plus a permanent QR code. Guests open it, add their name, and shoot into a shared film roll with a fixed number of shots. When the reveal timer ends, the gallery develops for everyone.' },
  { q: 'Do guests need to install anything?', a: 'No. Everything runs in the browser — scan the QR or tap the link and they’re in. No app stores, no accounts, no downloads.' },
  { q: 'When do the photos reveal?', a: 'You set a timer when creating the event. Until it runs out, every shot stays sealed — no previews for anyone, not even you.' },
  { q: 'Can guests see their photos before reveal?', a: 'No previews, no retakes. A shot is committed the instant the shutter fires. That’s what makes it feel like real film.' },
  { q: 'Who can see the photos afterwards?', a: 'Anyone with the event link. After the reveal, the developed gallery opens, and you can share it anywhere.' },
  { q: 'Why is it called DispoCam?', a: 'A disposable camera, reborn. Life happens once — don’t let it fade away.' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Marquee scene: a DSLR that flashes every 3s, then a hand holding a phone
// with a film reel of sample photos spooling out of its right side.
// ─────────────────────────────────────────────────────────────────────────────

function DslrSvg() {
  return (
    <svg width="150" height="112" viewBox="0 0 150 112" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-2xl">
      <defs>
        <linearGradient id="dslrBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2c2c33" />
          <stop offset="100%" stopColor="#0b0b0d" />
        </linearGradient>
        <linearGradient id="dslrLens" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3d3d45" />
          <stop offset="100%" stopColor="#101013" />
        </linearGradient>
      </defs>
      {/* pentaprism hump */}
      <path d="M48 34 V24 Q48 17 55 17 H95 Q102 17 102 24 V34 Z" fill="url(#dslrBody)" stroke="#4a4a52" strokeWidth="1.5" />
      {/* body */}
      <rect x="14" y="32" width="122" height="66" rx="12" fill="url(#dslrBody)" stroke="#4a4a52" strokeWidth="1.5" />
      {/* flash bulb */}
      <rect x="104" y="12" width="20" height="20" rx="5" fill="#1a1a1e" stroke="#4a4a52" strokeWidth="1.5" />
      {/* lens mount + rings */}
      <circle cx="62" cy="65" r="30" fill="url(#dslrLens)" stroke="#56565e" strokeWidth="2" />
      <circle cx="62" cy="65" r="23" fill="#0a0a0c" stroke="#3a3a42" strokeWidth="1.5" />
      <circle cx="62" cy="65" r="14" fill="#121216" stroke="#56565e" strokeWidth="1.5" />
      <circle cx="62" cy="65" r="5" fill="#1e1e24" />
      {/* grip texture */}
      <line x1="120" y1="46" x2="120" y2="84" stroke="#3a3a42" strokeWidth="2" strokeLinecap="round" />
      <line x1="124" y1="46" x2="124" y2="84" stroke="#3a3a42" strokeWidth="2" strokeLinecap="round" />
      {/* status led */}
      <circle cx="26" cy="46" r="2.5" fill="#f59e0b" />
      <text x="33" y="92" fill="#4a4a52" fontSize="8" letterSpacing="1.5" fontFamily="ui-monospace, monospace">DISPO*CAM</text>
    </svg>
  );
}

function MarqueeScene() {
  return (
    <div className="flex items-center gap-10 md:gap-14 px-8 md:px-12">
      {/* DSLR — flashes a little every 3 seconds */}
      <div className="relative flex items-center">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="dslr-flash w-40 h-40 rounded-full" />
        </div>
        <div className="dslr-kick">
          <DslrSvg />
        </div>
      </div>

      {/* hand holding the phone, with a film reel spooling out of its right side */}
      <div className="relative w-[320px] h-[160px]">
        {/* horizontal film strip emerging from the phone's right edge, spooling away */}
        <div className="absolute left-[206px] top-1/2 -translate-y-1/2 w-[110px] h-[56px] z-10">
          <div className="absolute left-0 right-0 top-0 h-[8px] sprockets-h" />
          <div className="absolute left-0 right-0 bottom-0 h-[8px] sprockets-h" />
          <div className="absolute left-0 right-0 top-[8px] bottom-[8px] overflow-hidden bg-[#141416] rounded-[3px] border border-[#26262b]">
            <div className="film-reel-run h-full flex items-stretch">
              {[0, 1].map((dup) => (
                <div key={dup} className="flex flex-row shrink-0 items-stretch">
                  {REEL_FRAMES.map((src, i) => (
                    <div key={i} className="shrink-0 m-[4px] rounded-[2px] overflow-hidden bg-black">
                      <img src={src} alt="" loading="lazy" className="h-full aspect-[3/4] object-cover" />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
        <img src={ONCE_HERO.hand} alt="" loading="lazy" className="absolute left-0 bottom-0 w-[128px] rotate-[-5deg] z-20 drop-shadow-2xl" />
        <img src={ONCE_HERO.phone} alt="" loading="lazy" className="absolute left-[100px] bottom-0 w-[112px] rotate-[4deg] z-30 drop-shadow-2xl" />
      </div>

      <span className="text-amber-500 text-2xl drop-shadow-[0_0_12px_rgba(245,158,11,0.6)]">✦</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function Landing({ onCreateEvent, onChooseTier, onOpenEvents, onOpenAuth, user, onSignOut }) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
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

  const handleChooseTier = (id) => {
    if (typeof window !== 'undefined') window.scrollTo(0, 0);
    onChooseTier?.(id);
  };

  return (
    <div className="relative min-h-screen text-[#F5F5F7] font-body antialiased overflow-x-hidden">
      {/* Fixed ambient party-lights backdrop — no people, just bokeh vibes */}
      <div className="fixed inset-0 -z-10 bg-[#0A0A0A]">
        <img src={PARTY_BG} alt="" aria-hidden="true" className="w-full h-full object-cover opacity-60 blur-[5px] scale-105" />
        <div className="absolute inset-0 bg-[#0A0A0A]/70" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0A0A0A]/70 via-[#0A0A0A]/20 to-[#0A0A0A]/90" />
      </div>
      <style>{`
        body { font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif; background-color: #0A0A0A; }
        .font-display { font-family: 'Fraunces', Georgia, serif; font-optical-sizing: auto; }
        .font-serif-accent { font-family: 'Fraunces', Georgia, serif; font-style: italic; font-optical-sizing: auto; }
        html { scroll-behavior: smooth; }

        .marquee-track { display: flex; width: max-content; animation: marquee 32s linear infinite; }
        @keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }

        /* DSLR flash — one quick pop every 3 seconds */
        .dslr-flash {
          background: radial-gradient(circle, rgba(255, 244, 214, 0.95) 0%, rgba(255, 232, 170, 0.45) 34%, transparent 70%);
          opacity: 0;
          animation: cameraFlash 3s ease-out infinite;
        }
        @keyframes cameraFlash {
          0%, 5.2%, 100% { opacity: 0; transform: scale(0.5); }
          1.6% { opacity: 0.95; transform: scale(1); }
          3.4% { opacity: 0.12; transform: scale(1.22); }
        }
        .dslr-kick { animation: dslrKick 3s ease-out infinite; }
        @keyframes dslrKick {
          0%, 5.2%, 100% { transform: translateY(0); }
          1.6% { transform: translateY(2px) scale(1.02); }
        }

        /* film reel spooling out of the right side of the phone */
        .film-reel-run { animation: reelScrollX 6s linear infinite; }
        @keyframes reelScrollX { from { transform: translateX(-50%); } to { transform: translateX(0); } }
        .sprockets-h {
          background-image: radial-gradient(circle at center, rgba(245, 245, 247, 0.5) 2px, transparent 2.6px);
          background-size: 22px 8px;
          background-position: center;
        }

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

        .faq-answer { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 0.5s cubic-bezier(0.16, 1, 0.3, 1); }
        .faq-answer.open { grid-template-rows: 1fr; }
        .faq-answer > div { overflow: hidden; }

        @media (prefers-reduced-motion: reduce) {
          .reveal-clip, .reveal-rise { transition: none; clip-path: none; opacity: 1; transform: none; }
          .marquee-track, .dslr-flash, .dslr-kick, .film-reel-run { animation: none; }
        }
      `}</style>

      <div className="grain-overlay" aria-hidden="true" />

      {/* Scroll progress bar */}
      <div className="fixed top-0 left-0 right-0 z-[60] h-[2px] bg-transparent">
        <div ref={progressRef} className="h-full bg-amber-500 origin-left" style={{ width: '0%' }} />
      </div>

      {/* ── NAV ─────────────────────────────────────────────────────────── */}
      <nav className={`fixed top-0 inset-x-0 z-50 transition-all duration-500 ${scrolled ? 'bg-[#0A0A0A]/85 backdrop-blur-md border-b border-[#1C1C1E]' : 'bg-transparent'}`}>
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">            <button onClick={handleCreate} className="font-display text-lg tracking-tight text-white">
            Dispo<span className="text-amber-500">Cam</span>.
          </button>

          <div className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map((l) => (
              <button key={l.href} onClick={() => (l.app ? onOpenEvents?.() : scrollTo(l.href))} className="text-[13px] tracking-wide text-neutral-400 hover:text-white transition-colors uppercase">
                {l.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <div className="relative">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  aria-label="Account menu"
                  className="hidden md:flex items-center gap-2 border border-[#2C2C2E] rounded-full pl-1.5 pr-4 py-1.5 hover:border-amber-500/50 transition-colors"
                >
                  {user.user_metadata?.avatar_url ? (
                    <img src={user.user_metadata.avatar_url} alt="" className="w-7 h-7 rounded-full" />
                  ) : (
                    <span className="w-7 h-7 rounded-full bg-amber-500/15 border border-amber-500/40 text-amber-400 text-xs font-semibold flex items-center justify-center">
                      {(user.email || 'U').charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="text-[13px] text-white max-w-[110px] truncate">
                    {user.user_metadata?.full_name || user.email?.split('@')[0] || 'Account'}
                  </span>
                </button>
                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-52 bg-[#121214] border border-[#2C2C2E] rounded-xl shadow-2xl py-1 z-50">
                    <p className="px-4 py-2 text-xs text-neutral-500 truncate border-b border-[#1C1C1E]">{user.email}</p>
                    <button
                      onClick={onSignOut}
                      className="w-full text-left px-4 py-2.5 text-[13px] text-red-400/90 hover:bg-[#1A1A1E] transition-colors"
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={onOpenAuth}
                className="hidden md:inline-block border border-[#2C2C2E] text-neutral-300 text-[13px] font-medium px-5 py-2.5 rounded-full hover:border-amber-500/50 hover:text-amber-400 transition-colors"
              >
                Sign in
              </button>
            )}
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
          <div className="md:hidden bg-[#0D0D0F]/95 backdrop-blur-xl border-t border-[#1C1C1E] px-6 py-6 space-y-4">
            {NAV_LINKS.map((l) => (
              <button
                key={l.href}
                onClick={() => {
                  setMenuOpen(false);
                  if (l.app) onOpenEvents?.();
                  else scrollTo(l.href);
                }}
                className="block text-sm text-neutral-300 uppercase tracking-wide"
              >
                {l.label}
              </button>
            ))}
            {user ? (
              <div className="flex items-center justify-between border border-[#2C2C2E] rounded-full px-4 py-2">
                <span className="text-sm text-white truncate max-w-[210px]">{user.email}</span>
                <button onClick={onSignOut} className="text-xs text-red-400 ml-3">Sign out</button>
              </div>
            ) : (
              <button onClick={() => { setMenuOpen(false); onOpenAuth?.(); }} className="w-full border border-[#2C2C2E] text-sm text-neutral-300 py-3 rounded-full hover:border-amber-500/50 transition-colors">
                Sign in — Google or phone
              </button>
            )}
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
              DispoCam turns your event into a disposable camera every guest can shoot.
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

          {/* once.film-style hero: hand + phone cutouts, developed photos from Loewe */}
          <div className="relative h-[480px] md:h-[560px] select-none" data-hero-zoom>
            {/* hand holding the phone */}
            <div className="absolute left-0 top-2 w-[52%] md:w-[42%] rotate-[-4deg]" data-parallax="0.07">
              <img src={ONCE_HERO.hand} alt="Guest hand holding the camera phone" loading="lazy" className="w-full drop-shadow-2xl" />
            </div>

            {/* the phone */}
            <div className="absolute right-0 top-6 w-[52%] md:w-[42%] rotate-[3deg]" data-parallax="-0.05">
              <img src={ONCE_HERO.phone} alt="The shared camera phone" loading="lazy" className="w-full drop-shadow-2xl" />
            </div>

            {/* developed photo — Loewe campaign */}
            <div className="absolute right-[2%] bottom-0 w-[46%] md:w-[38%] rotate-[2deg] z-10" data-parallax="0.11">
              <div className="bg-[#1C1C1E] border border-[#2C2C2E] p-2 pb-3 rounded-lg shadow-2xl">
                <img src={LOEWE.campaign1} alt="Loewe campaign photograph" loading="lazy" className="w-full aspect-[3/4] object-cover rounded" />
                <p className="mt-2 pl-1 text-[10px] uppercase tracking-widest text-neutral-500">Shot 07 · developed</p>
              </div>
            </div>

            {/* developed photo — Loewe product */}
            <div className="absolute left-[2%] bottom-6 w-[40%] md:w-[32%] rotate-[-6deg] z-20" data-parallax="0.14">
              <div className="bg-[#1C1C1E] border border-[#2C2C2E] p-2 pb-3 rounded-lg shadow-2xl">
                <img src={LOEWE.amazona} alt="Loewe product photograph" loading="lazy" className="w-full aspect-[3/4] object-cover rounded" />
                <p className="mt-2 pl-1 text-[10px] uppercase tracking-widest text-neutral-500">Shot 19 · developed</p>
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

      {/* ── MARQUEE — CINEMATIC FILM SCENE ─────────────────────────────── */}
      <section className="border-y border-[#1C1C1E] bg-[#0A0A0A]/60 backdrop-blur-md py-7 overflow-hidden" aria-hidden="true">
        <div className="marquee-track items-center">
          {[0, 1].map((dup) => (
            <div key={dup} className="flex shrink-0 items-center">
              <MarqueeScene />
              <MarqueeScene />
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
      <section id="how-it-works" className="py-24 md:py-32 bg-[#0D0D0F]/75 backdrop-blur-xl border-y border-[#1C1C1E]">
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

      {/* ── PRICING — every bundle has its own button ───────────────────── */}
      <section id="pricing" className="py-24 md:py-32 border-b border-[#1C1C1E]">
        <div className="max-w-6xl mx-auto px-6">
          <p data-reveal-rise className="text-[11px] uppercase tracking-[0.3em] text-amber-500/90 mb-4 font-medium">Pricing</p>
          <h2 data-reveal-rise data-delay="80" className="font-display text-4xl md:text-6xl tracking-tight text-white">
            One roll.{' '}
            <span className="font-serif-accent text-amber-400/90">Priced for the size of your day.</span>
          </h2>
          <p data-reveal-rise data-delay="160" className="mt-5 text-neutral-400 max-w-xl text-sm md:text-base leading-relaxed">
            Events up to 5 guests are free forever. Beyond that everyone gets 25 shots each — and the bigger
            the event, the less each guest costs you.
          </p>

          <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {PRICING.map((p, i) => (
              <div
                key={p.id}
                data-reveal-rise
                data-delay={i * 80}
                className={`relative rounded-2xl border p-6 flex flex-col transition-colors duration-500 ${p.price === 0 ? 'border-emerald-500/40 bg-emerald-500/[0.04]' : 'border-[#1C1C1E] bg-[#121214] hover:border-amber-500/40'}`}
              >
                {p.price === 0 && (
                  <span className="absolute -top-2.5 left-5 text-[10px] uppercase tracking-widest bg-emerald-500 text-black font-bold px-2.5 py-1 rounded-full">
                    Free forever
                  </span>
                )}
                <p className="font-display text-2xl text-white">{p.guests} guests</p>
                <p className="mt-1 text-xs text-neutral-500">{p.shots} shots per guest</p>
                <div className="mt-5 flex items-baseline gap-1">
                  <p className={`font-display text-3xl ${p.price === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {p.price === 0 ? '₹0' : `₹${p.price.toLocaleString('en-IN')}`}
                  </p>
                  {p.price > 0 && <p className="text-[11px] text-neutral-500">/event</p>}
                </div>
                <p className="mt-1 text-[11px] text-neutral-600">
                  {p.price === 0 ? '5 shots each · ₹0 forever' : `≈ ₹${Math.round(p.price / p.guests)} per guest`}
                </p>
                <button
                  onClick={() => handleChooseTier(p.id)}
                  className={`mt-6 w-full text-sm font-semibold py-3 rounded-full transition-all active:scale-[0.98] ${p.price === 0 ? 'bg-emerald-500 text-black hover:bg-emerald-400 hover:scale-[1.02]' : 'bg-white text-black hover:bg-amber-400 hover:scale-[1.02]'}`}
                >
                  {p.price === 0 ? 'Start free' : `Choose ${p.guests} guests`}
                </button>
              </div>
            ))}
          </div>
          <p data-reveal-rise className="mt-8 text-[11px] text-neutral-600 text-center max-w-2xl mx-auto leading-relaxed">
            Every plan includes the permanent QR, the shared film roll, album emails, and the full gallery.
            Prices in INR — paid once per event via UPI or card.
          </p>
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
          <img src={LOEWE.campaign2} alt="" loading="lazy" className="w-full h-full object-cover opacity-20 blur-[2px]" />
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
      <footer className="bg-[#080808]/70 backdrop-blur-xl border-t border-[#1C1C1E] pt-16 pb-10">
        <div className="max-w-6xl mx-auto px-6">
          <p data-reveal-rise className="font-serif-accent text-2xl md:text-3xl text-neutral-300 max-w-xl">
            “A single day becomes timeless, when remembered together.”
          </p>
          <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-10">
            <div>
              <p className="text-[11px] uppercase tracking-[0.25em] text-neutral-600 mb-4">Product</p>
              <button onClick={() => scrollTo('#how-it-works')} className="block text-sm text-neutral-400 hover:text-white py-1 transition-colors">How it works</button>
              <button onClick={() => scrollTo('#pricing')} className="block text-sm text-neutral-400 hover:text-white py-1 transition-colors">Pricing</button>
              <button onClick={onOpenEvents} className="block text-sm text-neutral-400 hover:text-white py-1 transition-colors">Events</button>
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
              <p className="text-[11px] uppercase tracking-[0.25em] text-neutral-600 mb-4">DispoCam</p>
              <p className="text-sm text-neutral-500 leading-relaxed">No Previews. No Retakes. One roll per event, developed in time.</p>
            </div>
          </div>
          <div className="mt-14 pt-6 border-t border-[#1C1C1E] flex flex-col md:flex-row items-center justify-between gap-4">
            <button onClick={handleCreate} className="font-display text-base tracking-tight text-white">
              Dispo<span className="text-amber-500">Cam</span>.
            </button>
            <p className="text-xs text-neutral-600">© 2026 DispoCam — No Previews. No Retakes.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

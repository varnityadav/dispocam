import { useState, useEffect, useRef, Fragment } from 'react';
import QRCode from 'qrcode';
import { supabase } from '../lib/supabase';
import Landing from '../components/Landing';
import { TIERS, TIER_LIST } from '../lib/pricing';

// Cloudflare R2 upload worker — signs presigned URLs for direct browser uploads.
// Set via NEXT_PUBLIC_R2_WORKER_URL in .env.local (deploy from /workers).
const R2_WORKER_URL = process.env.NEXT_PUBLIC_R2_WORKER_URL;

// Optional: public custom domain bound to the R2 bucket (e.g. https://media.example.com).
// When set, gallery images load from plain public URLs instead of signed URLs.
const MEDIA_BASE_URL = process.env.NEXT_PUBLIC_MEDIA_BASE_URL || '';

const NOT_CONFIGURED = 'Missing Supabase or R2 configuration. Check your .env.local and build.';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Pricing tiers come from src/lib/pricing.js (single source of truth).
// ⚠️ workers/worker.js mirrors them for server-side amounts — keep in sync.

// Inject Razorpay's checkout script on demand (static-export safe).
const loadRazorpayScript = () => new Promise((resolve) => {
  if (typeof window !== 'undefined' && window.Razorpay) return resolve(true);
  const s = document.createElement('script');
  s.src = 'https://checkout.razorpay.com/v1/checkout.js';
  s.onload = () => resolve(true);
  s.onerror = () => resolve(false);
  document.head.appendChild(s);
});

// ─────────────────────────────────────────────────────────────────────────────
// Live camera filters — previewed on the <video> (CSS filter + overlay layers)
// and baked into the captured JPEG (ctx.filter + canvas overlays), so the saved
// photo always matches what the guest saw. Looks are modeled on the most-used
// Instagram/creator trends: retro faded, studio flash, film burn & light leaks,
// X-Pro II, soft monotone gray, golden hour, and crisp black & white.
// css/overlay are functions of intensity t (0 = subtle, 1 = most dramatic) so
// guests can dial any filter from barely-there to full-strength.
// ─────────────────────────────────────────────────────────────────────────────
const FILTERS = [
  { id: 'none', name: 'Original', swatch: '#9ca3af', css: 'saturate(1.05) contrast(1.02)', overlay: null },
  {
    id: 'retro', name: 'Retro', swatch: '#d4a853',
    css: (t) => `sepia(${(0.3 + 0.45 * t).toFixed(2)}) saturate(${(1.15 + 0.45 * t).toFixed(2)}) contrast(${(0.95 - 0.3 * t).toFixed(2)}) brightness(${(1.06 + 0.08 * t).toFixed(2)})`,
    overlay: (t) => ({ vignette: 0.18 + 0.38 * t, tint: `rgba(255,170,90,${(0.05 + 0.11 * t).toFixed(3)})`, grain: 0.03 + 0.06 * t }),
  },
  {
    id: 'flash', name: 'Studio Flash', swatch: '#e8e6f0',
    css: (t) => `brightness(${(1.15 + 0.35 * t).toFixed(2)}) contrast(${(1.0 - 0.12 * t).toFixed(2)}) saturate(${(0.95 - 0.15 * t).toFixed(2)})`,
    overlay: (t) => ({ vignette: 0.3 + 0.3 * t, tint: `rgba(190,215,255,${(0.02 + 0.05 * t).toFixed(3)})` }),
  },
  {
    id: 'burn', name: 'Film Burn', swatch: '#e05b3c',
    css: (t) => `sepia(${(0.15 + 0.4 * t).toFixed(2)}) saturate(${(1.25 + 0.5 * t).toFixed(2)}) contrast(${(1.02 + 0.18 * t).toFixed(2)}) brightness(${(0.97 - 0.06 * t).toFixed(2)})`,
    overlay: (t) => ({
      vignette: 0.15 + 0.2 * t,
      leaks: [
        { x: 0, y: 0, rgb: '255,84,44', alpha: 0.15 + 0.5 * t, size: 0.5 + 0.15 * t },
        { x: 1, y: 1, rgb: '255,150,40', alpha: 0.1 + 0.42 * t, size: 0.45 + 0.15 * t },
      ],
      grain: 0.04 + 0.1 * t,
    }),
  },
  {
    id: 'xpro', name: 'X-Pro II', swatch: '#b5651d',
    css: (t) => `sepia(${(0.1 + 0.3 * t).toFixed(2)}) saturate(${(1.1 + 0.4 * t).toFixed(2)}) contrast(${(1.08 + 0.3 * t).toFixed(2)}) brightness(${(1.0 - 0.06 * t).toFixed(2)})`,
    overlay: (t) => ({ vignette: 0.25 + 0.45 * t, grain: 0.03 + 0.05 * t }),
  },
  {
    id: 'mono', name: 'Monotone Gray', swatch: '#8a8a8a',
    css: (t) => `grayscale(1) contrast(${(0.95 - 0.25 * t).toFixed(2)}) brightness(${(1.06 + 0.08 * t).toFixed(2)})`,
    overlay: (t) => ({ vignette: 0.08 + 0.12 * t, grain: 0.02 + 0.04 * t }),
  },
  {
    id: 'golden', name: 'Golden Hour', swatch: '#f5a623',
    css: (t) => `sepia(${(0.3 + 0.5 * t).toFixed(2)}) saturate(${(1.3 + 0.6 * t).toFixed(2)}) hue-rotate(${(-6 - 14 * t).toFixed(0)}deg) brightness(${(1.06 + 0.14 * t).toFixed(2)}) contrast(${(0.98 - 0.08 * t).toFixed(2)})`,
    overlay: (t) => ({ tint: `rgba(255,150,60,${(0.06 + 0.14 * t).toFixed(3)})` }),
  },
  {
    id: 'bw', name: 'Black & White', swatch: '#e4e4e4',
    css: (t) => `grayscale(1) contrast(${(1.05 + 0.4 * t).toFixed(2)}) brightness(${(1.03 + 0.04 * t).toFixed(2)})`,
    overlay: (t) => ({ vignette: 0.08 + 0.22 * t, grain: 0.03 * t }),
  },
];

// Reusable film-grain tile for the canvas bake (created once, lazily).
let grainCanvasCache = null;
function getGrainCanvas() {
  if (grainCanvasCache) return grainCanvasCache;
  grainCanvasCache = document.createElement('canvas');
  grainCanvasCache.width = 256;
  grainCanvasCache.height = 256;
  const c = grainCanvasCache.getContext('2d');
  const img = c.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = (Math.random() * 255) | 0;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  c.putImageData(img, 0, 0);
  return grainCanvasCache;
}

// Bake a filter's overlay layers (vignette / tint / light leaks / grain) onto
// the capture canvas so the saved JPEG matches the live preview exactly.
function bakeFilterOverlay(ctx, w, h, overlay) {
  if (!overlay) return;
  if (overlay.vignette) {
    const r = Math.max(w, h) * 0.72;
    const g = ctx.createRadialGradient(w / 2, h / 2, r * 0.45, w / 2, h / 2, r);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${overlay.vignette})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  if (overlay.tint) {
    ctx.fillStyle = overlay.tint;
    ctx.fillRect(0, 0, w, h);
  }
  if (overlay.leaks) {
    const R = Math.max(w, h);
    overlay.leaks.forEach((leak) => {
      const cx = leak.x === 0 ? 0 : w;
      const cy = leak.y === 0 ? 0 : h;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * leak.size);
      g.addColorStop(0, `rgba(${leak.rgb},${leak.alpha})`);
      g.addColorStop(1, `rgba(${leak.rgb},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
  }
  if (overlay.grain) {
    ctx.save();
    ctx.globalAlpha = overlay.grain;
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = ctx.createPattern(getGrainCanvas(), 'repeat');
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mechanical split-flap countdown — one digit tumbles at a time, like a
// real departure-board flip clock.
// ─────────────────────────────────────────────────────────────────────────────

function FlipDigit({ value }) {
  const v = String(value % 10);
  const [top, setTop] = useState(v);
  const [bottom, setBottom] = useState(v);
  const [flipping, setFlipping] = useState(false);
  const prevRef = useRef(v);

  useEffect(() => {
    if (v !== prevRef.current) {
      setTop(v); // new digit's top shows at once — the folding flap covers it briefly
      setFlipping(true);
      const t = setTimeout(() => {
        setBottom(v);
        prevRef.current = v;
        setFlipping(false);
      }, 360);
      return () => clearTimeout(t);
    }
  }, [v]);

  return (
    <div className="flip-digit">
      <div className="flip-half top"><span className="flip-digit-value">{top}</span></div>
      <div className="flip-half bottom"><span className="flip-digit-value">{bottom}</span></div>
      <div className="flip-seam" />
      {flipping && (
        <>
          <div className="flip-half flip-flap-top"><span className="flip-digit-value">{prevRef.current}</span></div>
          <div className="flip-half flip-flap-bottom"><span className="flip-digit-value">{v}</span></div>
        </>
      )}
    </div>
  );
}

function FlipClock({ seconds, size = 'md' }) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const dims =
    size === 'sm'
      ? { '--dw': '26px', '--dh': '34px', '--dfs': '20px' }
      : size === 'lg'
      ? { '--dw': '46px', '--dh': '60px', '--dfs': '36px' }
      : { '--dw': '30px', '--dh': '40px', '--dfs': '24px' };
  const units = h > 0 ? [h, m, sec] : [m, sec];
  return (
    <div className="flip-clock" style={dims}>
      {units.map((u, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="flip-sep">:</span>}
          <div className="flex gap-1">
            <FlipDigit value={Math.floor(u / 10)} />
            <FlipDigit value={u % 10} />
          </div>
        </Fragment>
      ))}
    </div>
  );
}

export default function DispcamApp() {
  // Navigation & Session States — 'landing' is the new home page; ?room= deep links are routed by the effect below
  const [view, setView] = useState('landing'); // 'landing' | 'host' | 'join' | 'camera' | 'gallery'
  const [eventId, setEventId] = useState('');
  
  // Host Configuration States
  const [eventName, setEventName] = useState('');
  const [duration, setDuration] = useState('2');
  const [selectedTier, setSelectedTier] = useState('free');
  const [hostEmail, setHostEmail] = useState(''); // where the host's full album goes
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');
  const [generatedLink, setGeneratedLink] = useState('');

  // Gallery delivery actions (guest "get my album" + host "full film")
  const [galleryEmailOpen, setGalleryEmailOpen] = useState(false);
  const [galleryEmail, setGalleryEmail] = useState('');
  const [galleryEmailMsg, setGalleryEmailMsg] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');

  // Guest & Real-time Lens States
  const [eventData, setEventData] = useState(null);
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [wantEmail, setWantEmail] = useState(false); // guest opted into photo delivery by email
  const [photoCount, setPhotoCount] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [rollState, setRollState] = useState('active'); // 'active' | 'collapsing' | 'finished'
  const [activeFilter, setActiveFilter] = useState('none'); // live film filter id (FILTERS)
  const [filterIntensity, setFilterIntensity] = useState(0.6); // 0 (subtle) → 1 (dramatic)
  const [cameraFacing, setCameraFacing] = useState('environment'); // 'environment' | 'user'
  const [flashOn, setFlashOn] = useState(false); // torch on supported devices
  
  // Hardware Camera Viewport Reference Layers
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rollTimerRef = useRef(null);
  // Pre-signed R2 upload URL for the NEXT shot (pre-fetched while idle so the
  // shutter-to-next-shot gap is just the JPEG encode + PUT — no extra round trip).
  const uploadUrlRef = useRef(null); // { url, path }
  const prefetchBusyRef = useRef(false);
  // Live refs for async camera setup (startCameraHardware / flipCamera run in
  // callbacks that can outlive a render — never trust stale state in them).
  const cameraFacingRef = useRef('environment');
  const flashRef = useRef(false);
  // Recipients already attempted this session (the Worker's R2 marker handles cross-session dedupe)
  const deliveredSetRef = useRef(new Set());
  // Set when a host tries to create an event before signing in — the create
  // re-fires automatically the moment auth completes (phone OTP) or the form is
  // restored after the Google redirect returns.
  const pendingCreateRef = useRef(false);
  const handleCreateEventRef = useRef(null);

  // Unlocked Developed Gallery State
  const [photos, setPhotos] = useState([]);

  // Photo delivery status ('idle' | 'sending' | 'sent' | 'partial')
  const [deliveryStatus, setDeliveryStatus] = useState('idle');
  const [deliveryInfo, setDeliveryInfo] = useState({ done: 0, total: 0, failed: 0 });

  // Google sign-in session (Supabase Auth)
  const [user, setUser] = useState(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  // Events library ("Events" view) + auth modal (Google / phone OTP)
  const [eventsList, setEventsList] = useState(null);
  const [eventsBusy, setEventsBusy] = useState(false);
  const [eventsError, setEventsError] = useState('');
  // Host controls — the signed-in host's own rolls
  const [myEvents, setMyEvents] = useState(null);
  const [myEventsBusy, setMyEventsBusy] = useState(false);
  const [revealBusyId, setRevealBusyId] = useState('');
  const [authModal, setAuthModal] = useState('closed'); // 'closed' | 'phone'
  const [phoneStep, setPhoneStep] = useState('input'); // 'input' | 'otp'
  const [authPhone, setAuthPhone] = useState('');
  const [authOtp, setAuthOtp] = useState('');
  const [authMsg, setAuthMsg] = useState('');
  const [authBusy, setAuthBusy] = useState(false);

  // Intercept incoming room deep links
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room) {
      setEventId(room);
      evaluateRoomRoute(room);
    }
  }, []);

  // Restore any existing Google sign-in session (also completes the OAuth callback)
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) setUser(data.session.user);
    });
    const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => authSub?.subscription?.unsubscribe();
  }, []);

  // Prefill the host album email from the signed-in Google account (editable)
  useEffect(() => {
    if (user?.email && !hostEmail) setHostEmail(user.email);
  }, [user]);

  // After a host signs in mid-create: finish the event (phone OTP, in-session)
  // or restore the form they filled in (Google redirect — sessionStorage survives
  // the full-page round-trip).
  useEffect(() => {
    if (!user) return;
    const pendingRaw =
      typeof window !== 'undefined' ? window.sessionStorage.getItem('dispocam_pending_create') : null;
    if (typeof window !== 'undefined' && pendingRaw) window.sessionStorage.removeItem('dispocam_pending_create');

    if (pendingCreateRef.current) {
      pendingCreateRef.current = false;
      handleCreateEventRef.current?.({ preventDefault: () => {} });
      return;
    }
    if (pendingRaw) {
      try {
        const pending = JSON.parse(pendingRaw);
        if (pending.eventName) {
          setEventName(pending.eventName);
          setDuration(pending.duration || '2');
          setSelectedTier(pending.selectedTier || 'free');
          setHostEmail(pending.hostEmail || user.email || '');
          setView('host');
          window.history.pushState({ dispcam: true, view: 'host' }, '');
        }
      } catch (e) { /* corrupt flag — just drop it */ }
    }
  }, [user]);

  // PostHog SPA pageviews — fire $pageview on mount and on every view change.
  // (The snippet in _document.js is initialized with capture_pageview:false so
  // there's exactly one source of truth for pageviews.)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.posthog) {
      window.posthog.capture('$pageview');
    }
  }, [view]);

  const signInWithGoogle = async () => {
    if (!supabase) { alert(NOT_CONFIGURED); return; }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: typeof window !== 'undefined' ? window.location.origin : undefined },
    });
    if (error) alert('Sign in failed: ' + error.message);
  };

  const handleSignOut = async () => {
    setUserMenuOpen(false);
    if (!supabase) return;
    await supabase.auth.signOut();
  };

  // ── Phone (OTP) sign-in — needs phone auth enabled in Supabase ────────────
  const openPhoneAuth = () => {
    setAuthPhone('');
    setAuthOtp('');
    setAuthMsg('');
    setPhoneStep('input');
    setAuthModal('phone');
  };

  const closeAuthModal = () => {
    setAuthModal('closed');
    setAuthMsg('');
    // Don't auto-create later if the host abandoned signing in mid-create
    pendingCreateRef.current = false;
    if (typeof window !== 'undefined') window.sessionStorage.removeItem('dispocam_pending_create');
  };

  const sendPhoneOtp = async (e) => {
    e.preventDefault();
    if (!supabase) { setAuthMsg(NOT_CONFIGURED); return; }
    const phone = authPhone.trim();
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
      setAuthMsg('Enter a valid phone with country code, e.g. +91 98765 43210');
      return;
    }
    setAuthBusy(true); setAuthMsg('');
    try {
      const { error } = await supabase.auth.signInWithOtp({ phone, options: { channel: 'sms' } });
      if (error) throw error;
      setPhoneStep('otp');
      setAuthMsg('Code sent to ' + phone + ' — enter the 6-digit OTP below.');
    } catch (err) {
      setAuthMsg('Could not send the code: ' + err.message);
    } finally {
      setAuthBusy(false);
    }
  };

  const verifyPhoneOtp = async (e) => {
    e.preventDefault();
    if (!supabase) { setAuthMsg(NOT_CONFIGURED); return; }
    if (!authOtp.trim()) { setAuthMsg('Enter the code you received'); return; }
    setAuthBusy(true); setAuthMsg('');
    try {
      const { error } = await supabase.auth.verifyOtp({ phone: authPhone.trim(), token: authOtp.trim(), type: 'sms' });
      if (error) throw error;
      closeAuthModal(); // user state updates via onAuthStateChange
    } catch (err) {
      setAuthMsg('Verification failed: ' + err.message);
    } finally {
      setAuthBusy(false);
    }
  };

  // Make the browser Back button work: each view pushes its own history state,
  // so Back restores the previous view instead of dumping the app to a blank page.
  useEffect(() => {
    const onPop = () => {
      window.scrollTo(0, 0);
      const st = window.history.state;
      if (st && st.dispcam && st.view) {
        if (st.view === 'join' && eventData && new Date() > new Date(eventData.reveal_at)) {
          // Event already developed — don't restore a dead join screen
          loadDevelopedGallery(eventData.id);
        } else {
          setView(st.view);
          if (st.view === 'camera') {
            setRollState(photoCount >= getActiveLimit() ? 'finished' : 'active');
            setTimeout(() => startCameraHardware(), 120);
          }
        }
      } else {
        setView('landing');
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [photoCount, eventData]);

  // Time-lock countdown loop (ticks immediately, then every second)
  useEffect(() => {
    if (!eventData || view !== 'camera') return;
    const tick = () => {
      const now = new Date().getTime();
      const target = new Date(eventData.reveal_at).getTime();
      const diff = target - now;

      if (diff <= 0) {
        clearInterval(interval);
        stopCameraHardware();
        if (rollTimerRef.current) {
          clearTimeout(rollTimerRef.current);
          rollTimerRef.current = null;
        }
        loadDevelopedGallery(eventData.id);
      } else {
        setTimeLeft(Math.floor(diff / 1000));
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [eventData, view]);

  // Clear the 10s "out of films" timer when the camera unmounts
  useEffect(() => () => {
    if (rollTimerRef.current) clearTimeout(rollTimerRef.current);
  }, []);

  // Direct Hardware Stream Activator
  const startCameraHardware = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: cameraFacingRef.current } },
        audio: false
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
      }
      if (flashRef.current) await applyTorch(stream, true);
    } catch (err) {
      alert("Camera access denied. Please grant camera permissions in your browser settings.");
    }
  };

  // Real flashlight (torch) where the browser/device supports it; on devices
  // without torch (e.g. front cameras, iOS) the button is a visual toggle only.
  const applyTorch = async (stream, on) => {
    const track = stream?.getVideoTracks?.()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: on }] });
    } catch (e) {
      // unsupported — the UI toggle still gives feedback
    }
  };

  const toggleFlash = async () => {
    const next = !flashRef.current;
    flashRef.current = next;
    setFlashOn(next);
    if (streamRef.current) await applyTorch(streamRef.current, next);
  };

  // Flip between the rear (environment) and front (selfie) cameras.
  const flipCamera = async () => {
    const next = cameraFacingRef.current === 'environment' ? 'user' : 'environment';
    cameraFacingRef.current = next;
    setCameraFacing(next);
    stopCameraHardware();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: next } },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
      }
      if (flashRef.current) await applyTorch(stream, true);
    } catch (err) {
      cameraFacingRef.current = cameraFacingRef.current === 'environment' ? 'user' : 'environment';
      setCameraFacing(cameraFacingRef.current);
      alert('Could not switch camera: ' + err.message);
      // The old stream was already stopped — bring the original camera back.
      startCameraHardware();
    }
  };

  const stopCameraHardware = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
  };

  const evaluateRoomRoute = async (idToTrack) => {
    try {
      if (!supabase) throw new Error(NOT_CONFIGURED);

      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('id', idToTrack)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        alert("Event not found. Check that the link is correct.");
        return;
      }
      
      const eventData = { id: data.id, ...data };
      setEventData(eventData);
      
      if (new Date() > new Date(eventData.reveal_at)) {
        loadDevelopedGallery(eventData.id);
      } else {
        setView('join');
        window.history.replaceState({ dispcam: true, view: 'join' }, '');
      }
    } catch (e) {
      alert("Error loading event: " + e.message);
    }
  };

  const showShareScreen = (eventId) => {
    const roomUrl = `${window.location.origin}?room=${eventId}`;
    setGeneratedLink(roomUrl);
    // Permanent QR code for this event (works forever, unlocks gallery after reveal)
    QRCode.toDataURL(roomUrl, {
      width: 512,
      margin: 2,
      color: { dark: '#0A0A0A', light: '#FFFFFF' }
    }).then(setQrDataUrl).catch((err) => console.warn('QR generation failed:', err));
  };

  const handleCreateEvent = async (e) => {
    e.preventDefault();
    if (!eventName) return;
    setQrDataUrl('');
    setPayError('');

    // Creating an event now requires sign-in (RLS is owner-scoped). If the host
    // isn't signed in yet, park the form and open auth — Google continues after
    // the redirect, phone OTP continues automatically in-session.
    if (!user) {
      pendingCreateRef.current = true;
      window.sessionStorage.setItem('dispocam_pending_create', JSON.stringify({
        eventName, duration, selectedTier, hostEmail,
      }));
      openPhoneAuth();
      setAuthMsg('Sign in to create your film roll — Google takes 10 seconds.');
      return;
    }

    const revealAt = new Date();
    revealAt.setHours(revealAt.getHours() + parseInt(duration));
    const tier = TIERS[selectedTier];
    const albumEmail = hostEmail.trim() ? hostEmail.trim().toLowerCase() : null;
    if (albumEmail && !EMAIL_RE.test(albumEmail)) {
      setPayError('Please enter a valid album email');
      return;
    }

    try {
      if (!supabase) throw new Error(NOT_CONFIGURED);

      // FREE TIER — event created instantly
      if (tier.price === 0) {
        let { data, error } = await supabase
          .from('events')
          .insert({
            name: eventName,
            reveal_at: revealAt.toISOString(),
            max_photos_limit: tier.shots,
            max_guests: tier.guests,
            plan: 'free',
            host_email: albumEmail,
            owner_id: user.id
          })
          .select('id')
          .single();
        // Graceful guard: if the newer columns aren't in the DB yet
        // (schema.sql / rls_hardening.sql not re-run), retry with the old shape.
        if (error && /owner_id|max_guests|plan|host_email/.test(error.message)) {
          const retry = await supabase
            .from('events')
            .insert({
              name: eventName,
              reveal_at: revealAt.toISOString(),
              max_photos_limit: tier.shots,
              ...(albumEmail ? { host_email: albumEmail } : {})
            })
            .select('id')
            .single();
          data = retry.data;
          error = retry.error;
        }
        if (error) throw error;
        showShareScreen(data.id);
        return;
      }

      // PAID TIER — Razorpay checkout; the event is created server-side only
      // after the Worker verifies the payment signature.
      if (!R2_WORKER_URL) throw new Error(NOT_CONFIGURED);
      setPaying(true);

      const orderRes = await fetch(`${R2_WORKER_URL}/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: selectedTier, eventName }),
      });
      const order = await orderRes.json();
      if (!orderRes.ok || order.error) throw new Error(order.error || 'Could not start payment');

      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) throw new Error('Payment gateway could not be loaded');

      const rzp = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: 'DispoCam',
        description: `${tier.guests} guests · ${tier.shots} shots each`,
        order_id: order.orderId,
        prefill: { name: user?.user_metadata?.full_name || '', email: user?.email || '' },
        theme: { color: '#fbbf24' },
        handler: async (res) => {
          try {
            const vRes = await fetch(`${R2_WORKER_URL}/verify-payment`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                eventName,
                revealAt: revealAt.toISOString(),
                tier: selectedTier,
                orderId: res.razorpay_order_id,
                paymentId: res.razorpay_payment_id,
                signature: res.razorpay_signature,
                hostEmail: albumEmail,
                ownerId: user?.id,
              }),
            });
            const v = await vRes.json();
            if (!vRes.ok || v.error || !v.event) throw new Error(v.error || 'Payment verification failed');
            setPaying(false);
            showShareScreen(v.event.id);
          } catch (err) {
            setPaying(false);
            setPayError('Payment succeeded but event creation failed — contact support with your payment id: ' + err.message);
          }
        },
        modal: { ondismiss: () => setPaying(false) },
      });
      rzp.on('payment.failed', (resp) => {
        setPaying(false);
        setPayError('Payment failed — ' + (resp?.error?.description || 'please try again'));
      });
      rzp.open();
    } catch (err) {
      setPaying(false);
      setPayError(err.message);
    }
  };
  handleCreateEventRef.current = handleCreateEvent;

  // Capture current video stream canvas context framework frame and push raw data payload straight to bucket storage
  const handleShutterSnap = async () => {
    if (uploading) return;
    
    const params = new URLSearchParams(window.location.search);
    const limitConstraint = parseInt(params.get('limit')) || eventData?.max_photos_limit || 5;

    if (photoCount >= limitConstraint) {
      alert("Out of film! All " + getActiveLimit() + " shots have been used.");
      return;
    }

    setUploading(true);

    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      
      const ctx = canvas.getContext('2d');
      // Bake the active filter (at the current intensity) into the captured photo
      // so it matches the live preview.
      const bakeT = activeFilter === 'none' ? 0 : filterIntensity;
      const bakeCss = typeof activeFilterObj.css === 'function' ? activeFilterObj.css(bakeT) : activeFilterObj.css;
      const bakeOverlay = typeof activeFilterObj.overlay === 'function' ? activeFilterObj.overlay(bakeT) : activeFilterObj.overlay;
      if (typeof ctx.filter === 'string') {
        ctx.filter = bakeCss || 'none';
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        ctx.filter = 'none';
      } else {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }
      bakeFilterOverlay(ctx, canvas.width, canvas.height, bakeOverlay);
      
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
      if (!blob) {
        throw new Error("Failed to capture image from camera feed");
      }

      // Use the pre-signed URL if one is ready and still valid (typical),
      // otherwise sign inline.
      const pending = uploadUrlRef.current;
      uploadUrlRef.current = null;
      let storagePath;
      let signedUrl;
      const freshEnough = pending && pending.url && pending.path && pending.expiresAt > Date.now();
      if (freshEnough) {
        storagePath = pending.path;
        signedUrl = pending.url;
      } else {
        const fileId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
        storagePath = `once-films/${eventData.id}/${fileId}.jpg`;
        // Ask the Worker for a presigned URL, then upload the photo straight to R2
        if (!R2_WORKER_URL) throw new Error(NOT_CONFIGURED);
        const signedRes = await fetch(`${R2_WORKER_URL}/upload-url`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: storagePath, contentType: 'image/jpeg' })
        });
        const signedJson = await signedRes.json();
        if (!signedJson.url) throw new Error(signedJson.error || 'Failed to get upload URL');
        signedUrl = signedJson.url;
      }

      // Upload straight to R2. If the pre-signed URL expired between signing and
      // this PUT (a guest sitting on the camera for a few minutes), re-sign
      // inline and retry once before surfacing the error.
      let putRes = await fetch(signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
        body: blob
      });
      if (putRes.status === 401 || putRes.status === 403) {
        if (!R2_WORKER_URL) throw new Error(NOT_CONFIGURED);
        const reSignedRes = await fetch(`${R2_WORKER_URL}/upload-url`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: storagePath, contentType: 'image/jpeg' })
        });
        const reSignedJson = await reSignedRes.json();
        if (!reSignedJson.url) throw new Error(reSignedJson.error || 'Failed to get upload URL');
        putRes = await fetch(reSignedJson.url, {
          method: 'PUT',
          headers: { 'Content-Type': 'image/jpeg' },
          body: blob
        });
      }
      if (!putRes.ok) throw new Error('Upload failed (HTTP ' + putRes.status + ')');

      // Log the shot in the photos table so it can be found at reveal time
      if (!supabase) throw new Error(NOT_CONFIGURED);
      const insertPayload = {
        event_id: eventData.id,
        guest_name: guestName,
        guest_email: (wantEmail && guestEmail.trim()) ? guestEmail.trim().toLowerCase() : null,
        storage_path: storagePath
      };
      let { error: insertError } = await supabase.from('photos').insert(insertPayload);
      // Graceful guard: if the guest_email column hasn't been added to the DB yet
      // (schema.sql not re-run), retry without it so capture still works.
      if (insertError && /guest_email/.test(insertError.message)) {
        const { guest_email, ...minimalPayload } = insertPayload;
        const retry = await supabase.from('photos').insert(minimalPayload);
        insertError = retry.error;
      }
      if (insertError) throw insertError;

      setPhotoCount(prev => prev + 1);
      prefetchUploadUrl(); // fire-and-forget — keep the next shot fast

      // Last shot taken — collapse the camera and show the "out of films" message for 10s
      if (photoCount + 1 >= limitConstraint) {
        stopCameraHardware();
        setRollState('collapsing');
        rollTimerRef.current = setTimeout(() => setRollState('finished'), 10000);
      }
    } catch (err) {
      alert("Failed to capture photo: " + err.message + (err.code ? " (" + err.code + ")" : ""));
    }
    setUploading(false);
  };

  const loadDevelopedGallery = async (idToFetch) => {
    try {
      if (!supabase) throw new Error(NOT_CONFIGURED);

      // guest_email is fetched for album delivery (never rendered in the gallery)
      const { data: rows, error } = await supabase
        .from('photos')
        .select('id, guest_name, guest_email, storage_path, created_at')
        .eq('event_id', idToFetch);
      if (error) throw error;

      const photosList = [];
      for (const row of rows) {
        // Public custom domain if configured, otherwise a signed URL from the Worker
        let downloadUrl;
        if (MEDIA_BASE_URL) {
          downloadUrl = `${MEDIA_BASE_URL}/${row.storage_path}`;
        } else {
          if (!R2_WORKER_URL) throw new Error(NOT_CONFIGURED);
          const signedRes = await fetch(`${R2_WORKER_URL}/download-url?path=${encodeURIComponent(row.storage_path)}`);
          const signedJson = await signedRes.json();
          downloadUrl = signedJson.url;
        }
        photosList.push({ id: row.id, downloadUrl, ...row });
      }
      
      // Sort photos newest-first client-side
      photosList.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      
      setPhotos(photosList);
      setView('gallery');
      window.history.replaceState({ dispcam: true, view: 'gallery' }, '');
    } catch (e) {
      alert("Failed to load gallery: " + e.message);
    }
  };

  // Deliver ONE recipient's album (guest = their shots, host = the full film).
  // The Worker's R2 marker guarantees one email per recipient per event.
  const deliverRecipient = async (evt, { email, kind, recipientName, photos }) => {
    if (!R2_WORKER_URL) return { ok: false, error: NOT_CONFIGURED };
    const key = `${evt.id}|${email}`;
    if (deliveredSetRef.current.has(key)) return { ok: true, duplicate: true };
    try {
      const res = await fetch(`${R2_WORKER_URL}/deliver`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId: evt.id,
          eventName: evt.name,
          recipientName,
          recipientEmail: email,
          kind,
          photos,
        }),
      });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || ('HTTP ' + res.status));
      deliveredSetRef.current.add(key);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  };

  // When the film develops, auto-email every guest who opted in their own album,
  // plus the host (event host_email, else the signed-in user) the full film.
  const deliverAlbums = async (photoList, evt) => {
    if (!R2_WORKER_URL || !photoList || photoList.length === 0) return;

    const guestEmails = [...new Set(
      photoList
        .map((p) => (p.guest_email || '').trim().toLowerCase())
        .filter((e) => EMAIL_RE.test(e))
    )];
    const hostEmail =
      (evt?.host_email && EMAIL_RE.test(evt.host_email) ? evt.host_email.trim().toLowerCase() : null) ||
      (user?.email ? user.email.trim().toLowerCase() : null);

    const tasks = [];
    for (const email of guestEmails) {
      if (hostEmail && email === hostEmail) continue; // host album covers them
      const mine = photoList
        .filter((p) => (p.guest_email || '').trim().toLowerCase() === email)
        .map((p) => ({ storagePath: p.storage_path, guestName: p.guest_name }));
      if (mine.length) tasks.push({ email, kind: 'guest', recipientName: mine[0].guestName, photos: mine });
    }
    if (hostEmail) {
      tasks.push({
        email: hostEmail,
        kind: 'host',
        recipientName: user?.user_metadata?.full_name || 'Host',
        photos: photoList.map((p) => ({ storagePath: p.storage_path, guestName: p.guest_name })),
      });
    }

    const fresh = tasks.filter((t) => !deliveredSetRef.current.has(`${evt.id}|${t.email}`));
    if (fresh.length === 0) {
      // Every recipient was already attempted this session (e.g. gallery revisit
      // via the Back button) — show the sent confirmation instead of going silent.
      if (tasks.length > 0) setDeliveryStatus('sent');
      return;
    }

    setDeliveryStatus('sending');
    setDeliveryInfo({ done: 0, total: fresh.length, failed: 0 });
    let failed = 0;
    for (const t of fresh) {
      const r = await deliverRecipient(evt, t);
      if (!r.ok) failed++;
      setDeliveryInfo((prev) => ({ ...prev, done: prev.done + 1, failed }));
    }
    setDeliveryStatus(failed > 0 ? 'partial' : 'sent');
  };

  // Manual gallery actions — every guest can pull their own album, hosts the full film
  const handleGalleryGuestEmail = async (e) => {
    e.preventDefault();
    const email = galleryEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) { setGalleryEmailMsg('Please enter a valid email'); return; }
    const mine = photos
      .filter((p) => (p.guest_email || '').toLowerCase() === email)
      .map((p) => ({ storagePath: p.storage_path, guestName: p.guest_name }));
    if (mine.length === 0) { setGalleryEmailMsg('No photos are linked to that email — it wasn’t saved when you shot.'); return; }
    setGalleryEmailMsg('Developing your album…');
    const r = await deliverRecipient(eventData, { email, kind: 'guest', recipientName: mine[0].guestName, photos: mine });
    setGalleryEmailMsg(r.ok ? (r.duplicate ? 'Album already sent to that email.' : 'Album sent — check your inbox! 📬') : ('Failed: ' + r.error));
  };

  const handleHostAlbumEmail = async () => {
    const email = (
      eventData?.host_email && EMAIL_RE.test(eventData.host_email)
        ? eventData.host_email
        : (user?.email || '')
    ).trim().toLowerCase();
    if (!EMAIL_RE.test(email)) { setGalleryEmailMsg('No host email on file — add one when creating the event, or sign in.'); return; }
    setGalleryEmailMsg('Developing the full film…');
    const r = await deliverRecipient(eventData, {
      email,
      kind: 'host',
      recipientName: user?.user_metadata?.full_name || 'Host',
      photos: photos.map((p) => ({ storagePath: p.storage_path, guestName: p.guest_name })),
    });
    setGalleryEmailMsg(r.ok ? (r.duplicate ? 'Full album already sent to that email.' : 'Full album sent — check your inbox! 📬') : ('Failed: ' + r.error));
  };

  // Deliver albums once the gallery is on screen. Re-fires when the signed-in
  // user resolves late (async session restore) so the host album is never skipped.
  useEffect(() => {
    if (
      view === 'gallery' &&
      eventData &&
      photos.length > 0 &&
      deliveryStatus !== 'sending' &&
      deliveryStatus !== 'partial'
    ) {
      deliverAlbums(photos, eventData);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, eventData, photos, deliveryStatus, user]);

  const downloadQr = () => {
    if (!qrDataUrl) return;
    const safeName = eventName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'event';
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `dispocam-${safeName}-qr.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleEnterCamera = () => {
    if (!guestName) return;
    if (rollTimerRef.current) {
      clearTimeout(rollTimerRef.current);
      rollTimerRef.current = null;
    }
    const alreadyDone = photoCount >= getActiveLimit();
    setRollState(alreadyDone ? 'finished' : 'active');
    setView('camera');
    window.history.pushState({ dispcam: true, view: 'camera' }, '');
    if (!alreadyDone) {
      setTimeout(() => {
        startCameraHardware();
      }, 100);
    }
  };

  // Pre-sign the upload URL for the next shot while the camera is idle, so each
  // new shot starts uploading instantly. Falls back to inline signing on failure.
  const prefetchUploadUrl = async () => {
    if (prefetchBusyRef.current) return;
    if (!R2_WORKER_URL || !eventData?.id) return;
    prefetchBusyRef.current = true;
    const fileId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const storagePath = `once-films/${eventData.id}/${fileId}.jpg`;
    try {
      const res = await fetch(`${R2_WORKER_URL}/upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: storagePath, contentType: 'image/jpeg' }),
      });
      const j = await res.json();
      // Signed URLs are valid 300s; keep a 60s safety margin before discarding.
      if (j.url) uploadUrlRef.current = { url: j.url, path: storagePath, expiresAt: Date.now() + 240000 };
    } catch (e) {
      // leave the ref empty — the shutter will sign inline as a fallback
    } finally {
      prefetchBusyRef.current = false;
    }
  };

  // Keep a signed URL ready for the whole time the camera view is open
  useEffect(() => {
    if (view === 'camera' && eventData?.id) prefetchUploadUrl();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, eventData]);

  const getActiveLimit = () => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return parseInt(params.get('limit')) || eventData?.max_photos_limit || 5;
    }
    return 5;
  };

  const handleEnterApp = () => {
    if (typeof window !== 'undefined') window.scrollTo(0, 0);
    setView('host');
    if (typeof window !== 'undefined') {
      const st = window.history.state;
      if (!(st && st.dispcam && st.view === 'host')) {
        window.history.pushState({ dispcam: true, view: 'host' }, '');
      }
    }
  };

  // Landing pricing buttons jump straight to the host form with the tier preselected
  const handleChooseTier = (id) => {
    setSelectedTier(TIERS[id] ? id : 'free');
    handleEnterApp();
  };

  // ── Events library — every film, developed or still sealed ────────────────
  const loadEvents = async () => {
    try {
      if (!supabase) throw new Error(NOT_CONFIGURED);
      setEventsBusy(true);
      setEventsError('');
      const { data: evs, error } = await supabase
        .from('events')
        .select('id, name, reveal_at, max_photos_limit, max_guests, plan, host_email, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const { data: photoRows, error: pErr } = await supabase.from('photos').select('event_id');
      if (pErr) throw pErr;
      const counts = {};
      (photoRows || []).forEach((p) => { counts[p.event_id] = (counts[p.event_id] || 0) + 1; });
      setEventsList((evs || []).map((e) => ({ ...e, photoCount: counts[e.id] || 0 })));
    } catch (e) {
      setEventsError(e.message);
      setEventsList(null);
    } finally {
      setEventsBusy(false);
    }
  };

  // ── Host controls — the signed-in host's own film rolls ───────────────────
  const loadMyEvents = async () => {
    try {
      if (!supabase || !user) return;
      setMyEventsBusy(true);
      // Owned by this account, or (legacy events) the album email matches.
      const orFilter = user.email
        ? `owner_id.eq.${user.id},host_email.eq.${user.email.toLowerCase()}`
        : `owner_id.eq.${user.id}`;
      const { data: evs, error } = await supabase
        .from('events')
        .select('id, name, reveal_at, max_photos_limit, max_guests, plan, host_email, owner_id, created_at')
        .or(orFilter)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const ids = (evs || []).map((e) => e.id);
      const counts = {};
      if (ids.length) {
        const { data: photoRows, error: pErr } = await supabase
          .from('photos')
          .select('event_id')
          .in('event_id', ids);
        if (pErr) throw pErr;
        (photoRows || []).forEach((p) => { counts[p.event_id] = (counts[p.event_id] || 0) + 1; });
      }
      setMyEvents((evs || []).map((e) => ({ ...e, photoCount: counts[e.id] || 0 })));
    } catch (e) {
      setEventsError(e.message);
      setMyEvents(null);
    } finally {
      setMyEventsBusy(false);
    }
  };

  // Develop the film early — owner-only (RLS enforces it server-side)
  const revealNow = async (id) => {
    if (!supabase || !user) return;
    setRevealBusyId(id);
    try {
      const { error } = await supabase
        .from('events')
        .update({ reveal_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      await loadMyEvents();
      loadDevelopedGallery(id);
    } catch (e) {
      alert('Could not reveal the film: ' + e.message);
    } finally {
      setRevealBusyId('');
    }
  };

  const openEvents = () => {
    if (typeof window !== 'undefined') window.scrollTo(0, 0);
    setView('events');
    if (typeof window !== 'undefined') {
      const st = window.history.state;
      if (!(st && st.dispcam && st.view === 'events')) {
        window.history.pushState({ dispcam: true, view: 'events' }, '');
      }
    }
    loadEvents();
    if (user) loadMyEvents(); else setMyEvents(null);
  };

  // Share an event link straight to WhatsApp
  const shareOnWhatsApp = (link, name) => {
    const msg = `🎞️ ${name} — shoot into our DispoCam film roll!\n\nTap to join, no app needed:\n${link}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
  };

  // Download a permanent QR for any event (works from the Events page too)
  const downloadEventQr = (link, name) => {
    QRCode.toDataURL(link, {
      width: 512,
      margin: 2,
      color: { dark: '#0A0A0A', light: '#FFFFFF' },
    })
      .then((dataUrl) => {
        const safeName = String(name || 'event').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'event';
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `dispocam-${safeName}-qr.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      })
      .catch((err) => console.warn('QR generation failed:', err));
  };

  // Active filter object shared by the live preview and the capture bake —
  // resolved at the current intensity (slider), so preview always matches photo.
  const activeFilterObj = FILTERS.find((f) => f.id === activeFilter) || FILTERS[0];
  const filterT = activeFilter === 'none' ? 0 : filterIntensity;
  const activeFilterCss = typeof activeFilterObj.css === 'function' ? activeFilterObj.css(filterT) : activeFilterObj.css;
  const activeFilterOverlay = typeof activeFilterObj.overlay === 'function' ? activeFilterObj.overlay(filterT) : activeFilterObj.overlay;

  return (
    <>
      {/* LANDING PAGE — the new home (skipped when arriving via a ?room= link) */}
      {view === 'landing' && (
        <Landing onCreateEvent={handleEnterApp} onChooseTier={handleChooseTier} onOpenEvents={openEvents} onOpenAuth={openPhoneAuth} user={user} onSignOut={handleSignOut} />
      )}

      {/* APP VIEWS */}
      {view !== 'landing' && (
      <div className="min-h-screen bg-[#0A0A0A] text-[#F5F5F7] flex flex-col justify-center items-center p-4 antialiased" style={{ fontFamily: "'Manrope', ui-sans-serif, system-ui, sans-serif" }}>
        <style>{`
          .flip-clock { display: inline-flex; align-items: center; gap: 6px; }
          .flip-sep { color: #b45309; font-size: calc(var(--dfs, 24px) * 0.75); line-height: var(--dh, 40px); font-family: ui-monospace, 'SF Mono', Menlo, monospace; }
          .flip-digit {
            position: relative; width: var(--dw, 30px); height: var(--dh, 40px); border-radius: 7px;
            transform-style: preserve-3d;
            box-shadow: 0 6px 14px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.06);
          }
          .flip-half { position: absolute; left: 0; width: 100%; height: 50%; overflow: hidden; background: linear-gradient(to bottom, #18181c, #101013); }
          .flip-half.top { top: 0; border-radius: 7px 7px 0 0; }
          .flip-half.bottom { bottom: 0; border-radius: 0 0 7px 7px; }
          .flip-digit-value {
            position: absolute; left: 0; top: 0; width: 100%; height: var(--dh, 40px); line-height: var(--dh, 40px);
            text-align: center; font-size: var(--dfs, 24px); font-weight: 500; letter-spacing: 1px;
            font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
            color: #fbbf24;
          }
          .flip-half.bottom .flip-digit-value { top: calc(var(--dh, 40px) / -2); }
          .flip-seam { position: absolute; left: 0; top: 50%; width: 100%; height: 1px; background: #000; z-index: 5; box-shadow: 0 1px 0 rgba(255, 255, 255, 0.05); }
          .flip-flap-top { top: 0; z-index: 4; transform-origin: 50% 100%; animation: flipFold 0.16s ease-in forwards; backface-visibility: hidden; -webkit-backface-visibility: hidden; }
          .flip-flap-bottom { bottom: 0; z-index: 3; transform-origin: 50% 0%; transform: rotateX(90deg); animation: flipUnfold 0.18s ease-out 0.16s forwards; backface-visibility: hidden; -webkit-backface-visibility: hidden; }
          @keyframes flipFold { from { transform: rotateX(0deg); } to { transform: rotateX(-90deg); } }
          @keyframes flipUnfold { from { transform: rotateX(90deg); } to { transform: rotateX(0deg); } }

          /* Black shutter release — protruding from the screen */
          .shutter-3d {
            position: relative; width: 82px; height: 82px; border-radius: 9999px; cursor: pointer;
            background: radial-gradient(130% 130% at 28% 16%, #4a4a52 0%, #1c1c22 42%, #050506 100%);
            box-shadow:
              0 22px 44px rgba(0, 0, 0, 0.9),
              0 10px 20px rgba(0, 0, 0, 0.65),
              0 3px 6px rgba(0, 0, 0, 0.5),
              inset 0 -12px 20px rgba(0, 0, 0, 0.85),
              inset 0 12px 20px rgba(255, 255, 255, 0.06);
          }
          .shutter-3d::before {
            content: ''; position: absolute; inset: 9px; border-radius: 9999px;
            background: radial-gradient(100% 100% at 50% 0%, #0d0d10, #000);
            border: 1px solid #232329;
            box-shadow: inset 0 4px 10px rgba(0, 0, 0, 0.95), inset 0 -1px 3px rgba(255, 255, 255, 0.05);
          }
          .shutter-3d::after {
            content: ''; position: absolute; left: 50%; top: 50%; width: 30px; height: 30px; border-radius: 9999px;
            transform: translate(-50%, -50%);
            background: radial-gradient(circle at 35% 30%, #17171b, #000 70%);
            border: 1px solid #26262d;
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.9), inset 0 1px 2px rgba(255, 255, 255, 0.05);
          }
          .shutter-3d .lip {
            position: absolute; inset: 0; border-radius: 9999px; pointer-events: none;
            background:
              radial-gradient(60% 60% at 18% 14%, rgba(255, 255, 255, 0.16), transparent 70%),
              radial-gradient(50% 50% at 84% 88%, rgba(0, 0, 0, 0.9), transparent 70%);
          }
          .shutter-3d:hover::before { background: radial-gradient(100% 100% at 50% 0%, #141419, #000); }

          /* Film-grain overlay for the live preview (matches the baked capture) */
          .film-grain {
            background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
            mix-blend-mode: overlay;
          }
          .no-scrollbar { scrollbar-width: none; }
          .no-scrollbar::-webkit-scrollbar { display: none; }

          /* Filter intensity slider — amber film-strip on dark */
          .filter-slider {
            -webkit-appearance: none; appearance: none;
            height: 4px; border-radius: 999px;
            background: linear-gradient(to right, #3f3f46, #f59e0b);
            outline: none; cursor: pointer;
          }
          .filter-slider::-webkit-slider-thumb {
            -webkit-appearance: none; appearance: none;
            width: 18px; height: 18px; border-radius: 9999px;
            background: radial-gradient(circle at 35% 30%, #fcd34d, #b45309);
            border: 2px solid #0a0a0a;
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.6);
          }
          .filter-slider::-moz-range-thumb {
            width: 18px; height: 18px; border-radius: 9999px;
            background: radial-gradient(circle at 35% 30%, #fcd34d, #b45309);
            border: 2px solid #0a0a0a;
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.6);
            cursor: pointer;
          }
          @media (prefers-reduced-motion: reduce) {
            .flip-flap-top, .flip-flap-bottom { animation: none; }
          }
        `}</style>
      
      {/* VIEW 1: HOST ENTRY DASHBOARD */}
      {view === 'host' && (
        <div className="w-full max-w-md border border-[#1C1C1E] bg-[#121214] rounded-3xl p-8 shadow-2xl">
          <h1 className="text-3xl font-light tracking-tight text-center mb-1 text-white">DispoCam.</h1>
          <p className="text-xs text-neutral-500 text-center mb-8 uppercase tracking-widest">No Previews. No Retakes.</p>
          {user && (
            <p className="-mt-5 mb-6 text-center text-[11px] text-neutral-600">Signed in as <span className="text-neutral-400">{user.email}</span></p>
          )}

          {!generatedLink ? (
            <form onSubmit={handleCreateEvent} className="space-y-6">
              <div>
                <label className="block text-xs uppercase tracking-wider text-neutral-400 mb-2 font-medium">Event Name</label>
                <input 
                  type="text" required placeholder="e.g., Summer Solstice"
                  className="w-full bg-[#1A1A1E] border border-[#2C2C2E] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-neutral-500 transition"
                  value={eventName} onChange={(e) => setEventName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-neutral-400 mb-2 font-medium">
                  Album Email <span className="normal-case font-normal text-neutral-600">(full film goes here)</span>
                </label>
                <input 
                  type="email"
                  placeholder={user ? user.email : 'you@example.com — where your album lands'}
                  className="w-full bg-[#1A1A1E] border border-[#2C2C2E] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-neutral-500 transition"
                  value={hostEmail} onChange={(e) => setHostEmail(e.target.value)}
                />
                <p className="mt-1.5 text-[11px] text-neutral-500">📬 When the film develops, the full album is emailed here as a PDF + original-quality ZIP.</p>
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-neutral-400 mb-2 font-medium">Timer Lock</label>
                <select 
                  className="w-full bg-[#1A1A1E] border border-[#2C2C2E] rounded-xl px-4 py-3 text-sm text-white focus:outline-none"
                  value={duration} onChange={(e) => setDuration(e.target.value)}
                >
                  <option value="1">1 Hour</option>
                  <option value="2">2 Hours</option>
                  <option value="6">6 Hours</option>
                  <option value="12">12 Hours</option>
                </select>
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-neutral-400 mb-2 font-medium">Event Capacity</label>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {TIER_LIST.map((t) => (
                    <button
                      type="button"
                      key={t.id}
                      onClick={() => setSelectedTier(t.id)}
                      className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl border text-left transition
                        ${selectedTier === t.id ? 'border-amber-500/60 bg-amber-500/5' : 'border-[#2C2C2E] hover:border-neutral-600'}`}
                    >
                      <div>
                        <p className="text-sm text-white font-medium">{t.guests} guests</p>
                        <p className="text-[11px] text-neutral-500">{t.shots} shots per guest</p>
                      </div>
                      <p className={`text-sm font-semibold ${t.price === 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {t.price === 0 ? 'FREE' : `₹${t.price.toLocaleString('en-IN')}`}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={paying}
                className="w-full bg-white text-black font-medium py-3 rounded-xl text-sm shadow-md disabled:opacity-50"
              >
                {paying
                  ? 'Opening secure payment…'
                  : selectedTier === 'free'
                  ? 'Generate Film Roll — Free'
                  : `Pay ₹${TIERS[selectedTier].price.toLocaleString('en-IN')} & Create Event`}
              </button>
              {payError && (
                <p className="text-xs text-red-400 text-center leading-relaxed">{payError}</p>
              )}
            </form>
          ) : (
            <div className="space-y-6 text-center">
              <p className="text-xs text-neutral-400 tracking-wide uppercase">Share this deployment link with guests:</p>
              <div className="p-4 bg-[#1A1A1E] border border-[#2C2C2E] rounded-xl break-all text-sm font-mono text-amber-500 select-all">
                {generatedLink}
              </div>
              {qrDataUrl && (
                <div className="space-y-3">
                  <div className="inline-block p-3 bg-white rounded-2xl shadow-2xl">
                    <img src={qrDataUrl} alt={`QR code for ${eventName}`} className="w-48 h-48 block" />
                  </div>
                  <p className="text-xs text-neutral-500">Scan anytime — this QR works forever.</p>
                </div>
              )}
              <button
                onClick={() => shareOnWhatsApp(generatedLink, eventName)}
                className="w-full flex items-center justify-center gap-2 bg-[#25D366] text-black font-semibold py-3 rounded-xl text-sm hover:bg-[#1fb457] transition shadow-lg"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 14.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.5 0 1.47 1.07 2.9 1.22 3.1.15.2 2.1 3.2 5.1 4.49.71.3 1.27.49 1.7.63.72.23 1.37.2 1.88.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35zM12.04 21.5h-.01a9.4 9.4 0 0 1-4.8-1.32l-.34-.2-3.56.93.95-3.47-.22-.36a9.42 9.42 0 0 1-1.44-5.02c0-5.2 4.24-9.44 9.45-9.44a9.4 9.4 0 0 1 6.68 2.77 9.39 9.39 0 0 1 2.76 6.69c0 5.2-4.24 9.43-9.46 9.43z"/></svg>
                Share on WhatsApp
              </button>
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => { navigator.clipboard.writeText(generatedLink); alert('Link copied!'); }}
                  className="border border-[#2C2C2E] text-white hover:bg-[#1A1A1E] py-3 rounded-xl text-sm transition"
                >
                  Copy Link
                </button>
                <button 
                  onClick={downloadQr}
                  disabled={!qrDataUrl}
                  className="border border-amber-500/40 text-amber-500 hover:bg-amber-500/10 py-3 rounded-xl text-sm transition disabled:opacity-40"
                >
                  Download QR
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: GUEST SIGN-IN */}
      {view === 'join' && eventData && (
        <div className="w-full max-w-sm text-center space-y-6 p-4">
          <div className="space-y-2">
            <h2 className="text-3xl font-light text-white tracking-tight">{eventData.name}</h2>
            <p className="text-xs uppercase tracking-widest text-amber-500 font-mono">Roll Capacity: {getActiveLimit()} Shots Max</p>
          </div>
          <p className="text-sm text-neutral-400 leading-relaxed max-w-xs mx-auto">
            Live mechanical shutter capture only. Zero retakes. Zero instant reviews. Pure memory processing.
          </p>
          <div className="space-y-3 pt-4">
            <input 
              type="text" placeholder="Enter full name"
              className="w-full bg-[#121214] border border-[#2C2C2E] rounded-xl px-4 py-3 text-sm text-center text-white focus:outline-none"
              value={guestName} onChange={(e) => setGuestName(e.target.value)}
            />

            {/* Optional email — lets the guest receive their shots when the film develops */}
            <button
              type="button"
              onClick={() => setWantEmail(v => !v)}
              className={`w-full flex items-center justify-center gap-2 border rounded-xl px-4 py-3 text-sm transition
                ${wantEmail ? 'border-amber-500/50 text-amber-500 bg-amber-500/5' : 'border-[#2C2C2E] text-neutral-400 hover:border-neutral-600 hover:text-neutral-200'}`}
            >
              {wantEmail ? (
                <>
                  <span className="text-base leading-none">✕</span>
                  <span>Hide email — shoot anonymously</span>
                </>
              ) : (
                <>
                  <span className="text-base leading-none">📬</span>
                  <span>Get my photos when the film develops</span>
                </>
              )}
            </button>

            {wantEmail && (
              <div className="space-y-2">
                <input 
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  className="w-full bg-[#121214] border border-[#2C2C2E] rounded-xl px-4 py-3 text-sm text-center text-white focus:outline-none focus:border-amber-500/50"
                  value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)}
                />
                <p className="text-[11px] text-neutral-500 leading-relaxed">
                  When the film develops we'll email your shots as a <span className="text-neutral-300">PDF album</span> plus
                  an <span className="text-neutral-300">original-quality download</span> — no watermarks, no apps.
                </p>
              </div>
            )}

            <button 
              disabled={!guestName || (wantEmail && !EMAIL_RE.test(guestEmail.trim()))}
              onClick={handleEnterCamera}
              className="w-full bg-white text-black font-medium py-3 rounded-xl text-sm disabled:opacity-40 shadow-md"
            >
              Unlock Shutter Camera
            </button>
          </div>
        </div>
      )}

      {/* VIEW 3: LIVE HARDWARE CAMERA STREAM VIEWPORT */}
      {view === 'camera' && eventData && (
        <div className="relative w-full max-w-md h-[92vh] flex flex-col justify-between items-center py-2 px-2">

          {/* LAYER A: ACTIVE CAMERA — collapses away when the roll ends */}
          <div aria-hidden={rollState !== 'active'} className={`w-full h-full flex flex-col justify-between items-center transition-all duration-700 ease-in-out ${rollState !== 'active' ? 'opacity-0 scale-75 pointer-events-none' : ''}`}>
            <header className="text-center w-full">
              <h1 className="text-xs uppercase tracking-widest text-neutral-500">{eventData.name}</h1>
              <div className="mt-1.5 flex justify-center">
                <FlipClock seconds={timeLeft} size="sm" />
              </div>
            </header>

            <div className={`w-full aspect-[3/4] ${activeFilter === 'none' ? 'max-h-[calc(92vh-190px)]' : 'max-h-[calc(92vh-248px)]'} border border-[#1C1C1E] bg-black rounded-2xl relative overflow-hidden shadow-inner flex items-center justify-center`}>
              <video
                ref={videoRef} autoPlay playsInline muted
                className="w-full h-full object-cover"
                style={{ filter: activeFilterCss }}
              />

              {/* live filter overlay layers — mirror the canvas bake so WYSIWYG */}
              {activeFilterOverlay && (
                <>
                  {activeFilterOverlay.vignette ? (
                    <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,${activeFilterOverlay.vignette}) 100%)` }} />
                  ) : null}
                  {activeFilterOverlay.tint ? (
                    <div className="absolute inset-0 pointer-events-none" style={{ background: activeFilterOverlay.tint }} />
                  ) : null}
                  {(activeFilterOverlay.leaks || []).map((leak, i) => (
                    <div key={i} className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(circle at ${leak.x * 100}% ${leak.y * 100}%, rgba(${leak.rgb},${leak.alpha}) 0%, rgba(${leak.rgb},0) 65%)` }} />
                  ))}
                  {activeFilterOverlay.grain ? (
                    <div className="absolute inset-0 pointer-events-none film-grain" style={{ opacity: activeFilterOverlay.grain }} />
                  ) : null}
                </>
              )}

              {/* camera controls — flip + flash (top-left) */}
              <div className="absolute top-6 left-6 flex items-center gap-2 z-20">
                <button
                  onClick={flipCamera}
                  aria-label={cameraFacing === 'environment' ? 'Switch to front camera' : 'Switch to rear camera'}
                  title={cameraFacing === 'environment' ? 'Switch to front camera' : 'Switch to rear camera'}
                  className="w-9 h-9 rounded-full bg-black/70 border border-neutral-700 text-white flex items-center justify-center backdrop-blur-md hover:bg-black/90 active:scale-95 transition"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v5h-5"/></svg>
                </button>
                <button
                  onClick={toggleFlash}
                  aria-pressed={flashOn}
                  aria-label="Toggle flash"
                  title={flashOn ? 'Flash on' : 'Flash off'}
                  className={`w-9 h-9 rounded-full border flex items-center justify-center backdrop-blur-md active:scale-95 transition ${flashOn ? 'bg-amber-500 text-black border-amber-400' : 'bg-black/70 border-neutral-700 text-white hover:bg-black/90'}`}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill={flashOn ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M13 2 4.5 13.5H11L9.5 22 19 10.5h-6.5L13 2z"/></svg>
                </button>
              </div>

              <div className="absolute top-6 right-6 font-mono text-base tracking-wider text-amber-500 bg-black/80 border border-neutral-800 px-3 py-1 rounded-md backdrop-blur-md">
                {photoCount} / {getActiveLimit()}
              </div>

              {uploading && (
                <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                  <p className="text-[11px] tracking-[0.3em] text-amber-500 uppercase">Winding…</p>
                </div>
              )}
            </div>

            {/* Live film filters — picked before the shot, baked into the photo */}
            <div className="w-full flex items-center gap-2 overflow-x-auto no-scrollbar py-1 shrink-0">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setActiveFilter(f.id)}
                  aria-pressed={activeFilter === f.id}
                  className={`shrink-0 flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[10px] uppercase tracking-widest border transition
                    ${activeFilter === f.id ? 'border-amber-500/70 text-amber-400 bg-amber-500/10' : 'border-[#2C2C2E] text-neutral-500 hover:border-neutral-600 hover:text-neutral-300'}`}
                >
                  <span className="w-2 h-2 rounded-full" style={{ background: f.swatch }} />
                  {f.name}
                </button>
              ))}
            </div>

            {/* Filter intensity — subtle on the left, most dramatic on the right */}
            {activeFilter !== 'none' && (
              <div className="w-full flex items-center gap-3 px-2 py-0.5 shrink-0">
                <span className="text-[9px] uppercase tracking-[0.25em] text-neutral-500">Effect</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={filterIntensity}
                  onChange={(e) => setFilterIntensity(parseFloat(e.target.value))}
                  aria-label={`${activeFilterObj.name} intensity`}
                  className="filter-slider flex-1"
                />
                <span className="text-[9px] uppercase tracking-widest text-amber-500/90 w-9 text-right tabular-nums">{Math.round(filterIntensity * 100)}%</span>
              </div>
            )}

            <footer className="w-full flex flex-col items-center space-y-4 pb-2">
              <button
                onClick={handleShutterSnap}
                disabled={uploading || photoCount >= getActiveLimit()}
                aria-label="Take photo"
                className="shutter-3d disabled:opacity-40 disabled:cursor-not-allowed transition-transform duration-200 active:scale-95"
              >
                <span className="lip" />
              </button>
              <p className="text-xs tracking-wider text-neutral-500 uppercase">
                {photoCount >= getActiveLimit() ? "Roll Finished" : "Mechanical Shutter Release"}
              </p>
            </footer>
          </div>

          {/* LAYER B: 10-SECOND "OUT OF FILMS" MESSAGE */}
          <div aria-hidden={rollState !== 'collapsing'} className={`absolute inset-0 flex items-center justify-center transition-all duration-700 ease-in-out ${rollState === 'collapsing' ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}>
            <div className="text-center space-y-6 px-6">
              <div className="mx-auto w-20 h-20 rounded-full border border-amber-500/40 flex items-center justify-center">
                <div className="w-4 h-4 bg-amber-500 rounded-full animate-pulse"></div>
              </div>
              <p className="text-amber-500/90 text-xl font-light italic tracking-wide leading-relaxed max-w-xs mx-auto">
                "idk about your luck but you're definitely out of films"
              </p>
            </div>
          </div>

          {/* LAYER C: ROLL FINISHED — WAITING FOR DEVELOPMENT */}
          <div aria-hidden={rollState !== 'finished'} className={`absolute inset-0 flex flex-col items-center justify-center text-center space-y-5 px-6 transition-all duration-700 ease-in-out ${rollState === 'finished' ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}>
            <p className="text-xs uppercase tracking-widest text-neutral-500">{eventData.name}</p>
            <h2 className="text-2xl font-light text-white tracking-tight">Roll finished — developing…</h2>
            <FlipClock seconds={timeLeft} size="lg" />
            <p className="text-xs text-neutral-500 max-w-xs leading-relaxed">
              Your exposures are processing. The gallery unlocks automatically when the timer ends.
            </p>
          </div>
        </div>
      )}

      {/* VIEW 4: DEPLOYED POST-COUNTDOWN UNLOCKED ARCHIVE */}
      {view === 'gallery' && eventData && (
        <div className="w-full max-w-4xl p-2">
          <header className="text-center my-12 space-y-2">
            <span className="text-xs uppercase tracking-widest text-amber-500 font-semibold bg-amber-500/10 px-3 py-1 rounded-full">Roll Fully Developed</span>
            <h2 className="text-3xl font-light text-white tracking-tight pt-2">{eventData.name}</h2>
            <p className="text-xs text-neutral-500 tracking-wide">{photos.length} raw exposures unspooled.</p>

            {deliveryStatus !== 'idle' && (
              <div className="flex justify-center pt-2">
                {deliveryStatus === 'sending' && (
                  <p className="text-xs text-amber-500/90 bg-amber-500/5 border border-amber-500/20 rounded-full px-4 py-2">
                    📬 Developing albums… {deliveryInfo.done}/{deliveryInfo.total}
                  </p>
                )}
                {deliveryStatus === 'sent' && (
                  <p className="text-xs text-emerald-400/90 bg-emerald-500/5 border border-emerald-500/20 rounded-full px-4 py-2">
                    📬 Albums emailed — every guest who opted in got their photos, and you got the full film.
                  </p>
                )}
                {deliveryStatus === 'partial' && (
                  <button
                    onClick={() => deliverAlbums(photos, eventData)}
                    className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-full px-4 py-2 hover:bg-amber-500/20 transition"
                  >
                    ⚠️ {deliveryInfo.failed} album(s) failed — tap to retry
                  </button>
                )}
              </div>
            )}

            {/* Manual album actions — every guest + host has a button */}
            <div className="flex flex-wrap justify-center gap-2 pt-3">
              {(eventData.host_email || user?.email) && (
                <button
                  onClick={handleHostAlbumEmail}
                  className="text-xs text-amber-300 bg-[#1A1A1E] border border-[#2C2C2E] rounded-full px-4 py-2 hover:border-amber-500/50 hover:text-amber-200 transition"
                >
                  📧 Email me the full film
                </button>
              )}
              <button
                onClick={() => { setGalleryEmailOpen(!galleryEmailOpen); setGalleryEmailMsg(''); }}
                className="text-xs text-neutral-300 bg-[#1A1A1E] border border-[#2C2C2E] rounded-full px-4 py-2 hover:border-amber-500/50 hover:text-white transition"
              >
                📬 Get my album by email
              </button>
            </div>
            {galleryEmailOpen && (
              <form onSubmit={handleGalleryGuestEmail} className="flex flex-col items-center gap-2 pt-2">
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={galleryEmail}
                  onChange={(e) => setGalleryEmail(e.target.value)}
                  className="w-64 bg-[#121214] border border-[#2C2C2E] rounded-xl px-4 py-2 text-sm text-center text-white focus:outline-none focus:border-amber-500/50"
                />
                <button type="submit" className="text-xs text-black bg-amber-400 rounded-full px-5 py-2 font-semibold hover:bg-amber-300 transition">
                  Send my album
                </button>
              </form>
            )}
            {galleryEmailMsg && (
              <p className="pt-2 text-xs text-amber-300/90">{galleryEmailMsg}</p>
            )}
          </header>

          {photos.length === 0 ? (
            <div className="text-center py-20 text-neutral-600 font-light text-sm">No captures survived chemical development.</div>
          ) : (
            <main className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {photos.map((photo) => (
                <div key={photo.id} className="group relative bg-[#121214] border border-[#1C1C1E] rounded-xl overflow-hidden shadow-xl">
                  <img 
                    src={photo.downloadUrl} alt="Developed source" 
                    className="w-full aspect-[3/4] object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-3 pt-8">
                    <p className="text-xs text-neutral-300">By <span className="text-white font-medium">{photo.guest_name}</span></p>
                  </div>
                </div>
              ))}
            </main>
          )}
        </div>
      )}
      {/* VIEW 5: EVENTS — the film library */}
      {view === 'events' && (
        <div className="w-full max-w-4xl p-4">
          <header className="flex items-center justify-between">
            <button onClick={() => setView('landing')} className="font-display text-lg tracking-tight text-white">
              Dispo<span className="text-amber-500">Cam</span>.
            </button>
            <div className="flex items-center gap-3">
              <button onClick={handleEnterApp} className="bg-white text-black text-xs font-medium px-4 py-2 rounded-full hover:bg-amber-400 transition">
                + Create an Event
              </button>
              <button onClick={() => setView('landing')} className="border border-[#2C2C2E] text-neutral-300 text-xs px-4 py-2 rounded-full hover:border-amber-500/50 transition">
                Home
              </button>
            </div>
          </header>

          <div className="text-center my-10 md:my-14">
            <p className="text-[11px] uppercase tracking-[0.3em] text-amber-500/90 mb-3 font-medium">The film library</p>
            <h1 className="font-display text-4xl md:text-5xl tracking-tight text-white">Events.</h1>
            <p className="mt-3 text-sm text-neutral-400 max-w-md mx-auto">Every film roll — developed, or still sealed in the darkroom.</p>
          </div>

          {user && (
            <section className="mb-14">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-xl text-white tracking-tight">My film rolls</h2>
                {myEvents !== null && (
                  <button onClick={loadMyEvents} className="text-[11px] text-amber-400 uppercase tracking-widest hover:text-amber-300 transition">
                    Refresh ↻
                  </button>
                )}
              </div>
              {myEventsBusy ? (
                <p className="text-sm text-neutral-500 animate-pulse">Loading your rolls…</p>
              ) : myEvents === null ? (
                <button onClick={loadMyEvents} className="w-full rounded-2xl border border-dashed border-[#2C2C2E] py-8 text-sm text-neutral-500 hover:border-amber-500/40 hover:text-neutral-300 transition">
                  Show my film rolls
                </button>
              ) : myEvents.length === 0 ? (
                <p className="text-sm text-neutral-600">No events yet — the first one you create will appear here.</p>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {myEvents.map((ev) => {
                    const developed = new Date() > new Date(ev.reveal_at);
                    const link = `${typeof window !== 'undefined' ? window.location.origin : ''}?room=${ev.id}`;
                    const pct = Math.min(100, Math.round((ev.photoCount / Math.max(1, ev.max_photos_limit)) * 100));
                    const isOwner = ev.owner_id === user.id;
                    return (
                      <div key={ev.id} className="rounded-2xl border border-amber-500/20 bg-[#121214] overflow-hidden flex flex-col">
                        <button onClick={() => evaluateRoomRoute(ev.id)} className="text-left p-5 flex-1 group">
                          <div className="flex items-center justify-between gap-2">
                            <span className={`text-[10px] uppercase tracking-widest px-2.5 py-1 rounded-full border ${developed ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : 'text-amber-400 border-amber-500/30 bg-amber-500/10'}`}>
                              {developed ? 'Developed' : 'Developing'}
                            </span>
                            <span className="text-[10px] text-neutral-600">{new Date(ev.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                          </div>
                          <h3 className="font-display text-xl text-white mt-3 tracking-tight group-hover:text-amber-300 transition-colors">{ev.name}</h3>
                          <p className="text-xs text-neutral-500 mt-1.5">{ev.photoCount} / {ev.max_photos_limit} shots</p>
                          <div className="mt-2 h-1.5 rounded-full bg-[#1C1C1E] overflow-hidden">
                            <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-300 transition-all duration-700" style={{ width: `${pct}%` }} />
                          </div>
                        </button>
                        <div className="p-3 border-t border-[#1C1C1E] bg-[#0F0F11] space-y-2">
                          <div className="grid grid-cols-3 gap-2">
                            <button onClick={() => shareOnWhatsApp(link, ev.name)} className="flex items-center justify-center gap-1 bg-[#25D366] text-black text-[11px] font-semibold py-2 rounded-lg hover:bg-[#1fb457] transition">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 14.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.5 0 1.47 1.07 2.9 1.22 3.1.15.2 2.1 3.2 5.1 4.49.71.3 1.27.49 1.7.63.72.23 1.37.2 1.88.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35zM12.04 21.5h-.01a9.4 9.4 0 0 1-4.8-1.32l-.34-.2-3.56.93.95-3.47-.22-.36a9.42 9.42 0 0 1-1.44-5.02c0-5.2 4.24-9.44 9.45-9.44a9.4 9.4 0 0 1 6.68 2.77 9.39 9.39 0 0 1 2.76 6.69c0 5.2-4.24 9.43-9.46 9.43z"/></svg>
                              Share
                            </button>
                            <button onClick={() => { navigator.clipboard.writeText(link); alert('Link copied!'); }} className="flex items-center justify-center border border-[#2C2C2E] text-neutral-300 text-[11px] py-2 rounded-lg hover:border-amber-500/50 hover:text-white transition">Copy</button>
                            <button onClick={() => downloadEventQr(link, ev.name)} className="flex items-center justify-center border border-[#2C2C2E] text-neutral-300 text-[11px] py-2 rounded-lg hover:border-amber-500/50 hover:text-white transition">QR</button>
                          </div>
                          {isOwner && !developed && (
                            <button
                              onClick={() => revealNow(ev.id)}
                              disabled={revealBusyId === ev.id}
                              className="w-full flex items-center justify-center gap-2 bg-amber-400 text-black text-[11px] font-semibold py-2 rounded-lg hover:bg-amber-300 transition disabled:opacity-50"
                            >
                              {revealBusyId === ev.id ? 'Developing…' : '🎞 Reveal film now'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {eventsList === null && eventsBusy ? (
            <p className="text-center py-16 text-neutral-500 text-sm animate-pulse">Developing the library…</p>
          ) : eventsError ? (
            <div className="text-center py-16 space-y-3">
              <p className="text-neutral-500 font-light text-sm">Couldn't load events: {eventsError}</p>
              <button onClick={loadEvents} className="border border-[#2C2C2E] text-amber-400 text-xs px-5 py-2.5 rounded-full hover:border-amber-500/50 transition">
                Retry
              </button>
            </div>
          ) : eventsList === null || eventsList.length === 0 ? (
            <p className="text-center py-16 text-neutral-600 font-light text-sm">No events yet — create the first roll.</p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {eventsList.map((ev) => {
                const developed = new Date() > new Date(ev.reveal_at);
                const link = `${typeof window !== 'undefined' ? window.location.origin : ''}?room=${ev.id}`;
                const tierLabel = ev.plan === 'free' ? 'Free roll' : TIERS[ev.plan] ? `${ev.max_guests} guests · paid` : ev.plan;
                return (
                  <div key={ev.id} className="rounded-2xl border border-[#1C1C1E] bg-[#121214] overflow-hidden flex flex-col hover:border-amber-500/40 transition-colors duration-500">
                    <button onClick={() => evaluateRoomRoute(ev.id)} className="text-left p-5 flex-1 group">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-[10px] uppercase tracking-widest px-2.5 py-1 rounded-full border ${developed ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : 'text-amber-400 border-amber-500/30 bg-amber-500/10'}`}>
                          {developed ? 'Developed' : 'Developing'}
                        </span>
                        <span className="text-[10px] text-neutral-600">{new Date(ev.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                      </div>
                      <h3 className="font-display text-xl text-white mt-3 tracking-tight group-hover:text-amber-300 transition-colors">{ev.name}</h3>
                      <p className="text-xs text-neutral-500 mt-1.5">{ev.photoCount} shots · {ev.max_guests} guests · {tierLabel}</p>
                      <p className="text-[11px] text-amber-500/80 mt-4 uppercase tracking-widest">Open film →</p>
                    </button>
                    <div className="grid grid-cols-3 gap-2 p-3 border-t border-[#1C1C1E] bg-[#0F0F11]">
                      <button
                        onClick={() => shareOnWhatsApp(link, ev.name)}
                        className="flex items-center justify-center gap-1 bg-[#25D366] text-black text-[11px] font-semibold py-2 rounded-lg hover:bg-[#1fb457] transition"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 14.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.5 0 1.47 1.07 2.9 1.22 3.1.15.2 2.1 3.2 5.1 4.49.71.3 1.27.49 1.7.63.72.23 1.37.2 1.88.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35zM12.04 21.5h-.01a9.4 9.4 0 0 1-4.8-1.32l-.34-.2-3.56.93.95-3.47-.22-.36a9.42 9.42 0 0 1-1.44-5.02c0-5.2 4.24-9.44 9.45-9.44a9.4 9.4 0 0 1 6.68 2.77 9.39 9.39 0 0 1 2.76 6.69c0 5.2-4.24 9.43-9.46 9.43z"/></svg>
                        Share
                      </button>
                      <button
                        onClick={() => { navigator.clipboard.writeText(link); alert('Link copied!'); }}
                        className="flex items-center justify-center border border-[#2C2C2E] text-neutral-300 text-[11px] py-2 rounded-lg hover:border-amber-500/50 hover:text-white transition"
                      >
                        Copy
                      </button>
                      <button
                        onClick={() => downloadEventQr(link, ev.name)}
                        className="flex items-center justify-center border border-[#2C2C2E] text-neutral-300 text-[11px] py-2 rounded-lg hover:border-amber-500/50 hover:text-white transition"
                      >
                        QR
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      </div>
      )}

      {/* AUTH MODAL — Google or phone OTP */}
      {authModal === 'phone' && (
        <div className="fixed inset-0 z-[100] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4" onClick={closeAuthModal}>
          <div className="w-full max-w-sm bg-[#121214] border border-[#2C2C2E] rounded-3xl p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-display text-xl text-white tracking-tight">Sign in to DispoCam</h3>
              <button onClick={closeAuthModal} aria-label="Close" className="w-8 h-8 rounded-full border border-[#2C2C2E] text-neutral-400 hover:text-white transition">✕</button>
            </div>

            <button
              onClick={signInWithGoogle}
              className="w-full flex items-center justify-center gap-2.5 border border-[#2C2C2E] rounded-xl py-3 text-sm text-white hover:border-amber-500/50 hover:bg-[#1A1A1E] transition"
            >
              <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.46a5.53 5.53 0 0 1-2.4 3.63v3h3.87c2.27-2.1 3.57-5.17 3.57-8.82z"/><path fill="#34A853" d="M12 24c3.24 0 5.96-1.08 7.93-2.91l-3.87-3c-1.07.72-2.44 1.15-4.06 1.15-3.13 0-5.78-2.11-6.72-4.95H1.28v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.28 14.29a7.2 7.2 0 0 1 0-4.58v-3.1H1.28a12 12 0 0 0 0 10.78l4-3.1z"/><path fill="#EA4335" d="M12 4.76c1.76 0 3.34.61 4.58 1.8l3.43-3.43A11.97 11.97 0 0 0 1.28 6.6l4 3.1C6.22 6.87 8.87 4.76 12 4.76z"/></svg>
              Continue with Google
            </button>

            <div className="flex items-center gap-3 my-4 text-[10px] uppercase tracking-widest text-neutral-600">
              <span className="flex-1 h-px bg-[#2C2C2E]" /> or <span className="flex-1 h-px bg-[#2C2C2E]" />
            </div>

            {phoneStep === 'input' ? (
              <form onSubmit={sendPhoneOtp} className="space-y-3">
                <input
                  type="tel"
                  required
                  placeholder="+91 98765 43210"
                  value={authPhone}
                  onChange={(e) => setAuthPhone(e.target.value)}
                  className="w-full bg-[#1A1A1E] border border-[#2C2C2E] rounded-xl px-4 py-3 text-sm text-white text-center focus:outline-none focus:border-amber-500/50 transition"
                />
                <button
                  disabled={authBusy}
                  className="w-full bg-amber-400 text-black font-semibold py-3 rounded-xl text-sm hover:bg-amber-300 transition disabled:opacity-50"
                >
                  {authBusy ? 'Sending…' : 'Send code by SMS'}
                </button>
              </form>
            ) : (
              <form onSubmit={verifyPhoneOtp} className="space-y-3">
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  placeholder="6-digit code"
                  value={authOtp}
                  onChange={(e) => setAuthOtp(e.target.value.replace(/\D/g, ''))}
                  className="w-full bg-[#1A1A1E] border border-[#2C2C2E] rounded-xl px-4 py-3 text-sm text-white text-center tracking-[0.4em] focus:outline-none focus:border-amber-500/50 transition"
                />
                <button
                  disabled={authBusy}
                  className="w-full bg-amber-400 text-black font-semibold py-3 rounded-xl text-sm hover:bg-amber-300 transition disabled:opacity-50"
                >
                  {authBusy ? 'Verifying…' : 'Verify & Sign in'}
                </button>
                <button type="button" onClick={() => setPhoneStep('input')} className="w-full text-[11px] text-neutral-500 hover:text-neutral-300 transition">
                  ← Change number
                </button>
              </form>
            )}

            {authMsg && <p className="mt-4 text-[11px] text-amber-300/90 leading-relaxed">{authMsg}</p>}
          </div>
        </div>
      )}
    </>
  );
}

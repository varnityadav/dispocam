import { useState, useEffect, useRef, Fragment } from 'react';
import QRCode from 'qrcode';
import { supabase } from '../lib/supabase';
import Landing from '../components/Landing';

// Cloudflare R2 upload worker — signs presigned URLs for direct browser uploads.
// Set via NEXT_PUBLIC_R2_WORKER_URL in .env.local (deploy from /workers).
const R2_WORKER_URL = process.env.NEXT_PUBLIC_R2_WORKER_URL;

// Optional: public custom domain bound to the R2 bucket (e.g. https://media.example.com).
// When set, gallery images load from plain public URLs instead of signed URLs.
const MEDIA_BASE_URL = process.env.NEXT_PUBLIC_MEDIA_BASE_URL || '';

const NOT_CONFIGURED = 'Missing Supabase or R2 configuration. Check your .env.local and build.';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Event pricing tiers — free forever up to 10 guests; paid capacity = 25 shots/guest.
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
const TIER_LIST = Object.entries(TIERS).map(([id, t]) => ({ id, ...t }));

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
  
  // Hardware Camera Viewport Reference Layers
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rollTimerRef = useRef(null);
  // Recipients already attempted this session (the Worker's R2 marker handles cross-session dedupe)
  const deliveredSetRef = useRef(new Set());

  // Unlocked Developed Gallery State
  const [photos, setPhotos] = useState([]);

  // Photo delivery status ('idle' | 'sending' | 'sent' | 'partial')
  const [deliveryStatus, setDeliveryStatus] = useState('idle');
  const [deliveryInfo, setDeliveryInfo] = useState({ done: 0, total: 0, failed: 0 });

  // Google sign-in session (Supabase Auth)
  const [user, setUser] = useState(null);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

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
        video: { facingMode: { ideal: "environment" } },
        audio: false
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
      }
    } catch (err) {
      alert("Camera access denied. Please grant camera permissions in your browser settings.");
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
            host_email: albumEmail
          })
          .select('id')
          .single();
        // Graceful guard: if the paid-tier columns aren't in the DB yet
        // (schema.sql not re-run), retry with the original shape.
        if (error && /max_guests|plan|host_email/.test(error.message)) {
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

  // Capture current video stream canvas context framework frame and push raw data payload straight to bucket storage
  const handleShutterSnap = async () => {
    if (uploading) return;
    
    const params = new URLSearchParams(window.location.search);
    const limitConstraint = parseInt(params.get('limit')) || eventData?.max_photos_limit || 10;

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
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
      if (!blob) {
        throw new Error("Failed to capture image from camera feed");
      }
      const fileId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
      const storagePath = `once-films/${eventData.id}/${fileId}.jpg`;
      
      // Ask the Worker for a presigned URL, then upload the photo straight to R2
      if (!R2_WORKER_URL) throw new Error(NOT_CONFIGURED);
      const signedRes = await fetch(`${R2_WORKER_URL}/upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: storagePath, contentType: 'image/jpeg' })
      });
      const signedJson = await signedRes.json();
      if (!signedJson.url) throw new Error(signedJson.error || 'Failed to get upload URL');

      await fetch(signedJson.url, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
        body: blob
      });

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
    if (fresh.length === 0) return;

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

  const getActiveLimit = () => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return parseInt(params.get('limit')) || eventData?.max_photos_limit || 10;
    }
    return 10;
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

  return (
    <>
      {/* LANDING PAGE — the new home (skipped when arriving via a ?room= link) */}
      {view === 'landing' && (
        <Landing onCreateEvent={handleEnterApp} onChooseTier={handleChooseTier} user={user} onSignIn={signInWithGoogle} onSignOut={handleSignOut} />
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

            <div className="w-full aspect-[3/4] border border-[#1C1C1E] bg-black rounded-2xl relative overflow-hidden shadow-inner flex items-center justify-center">
              <video 
                ref={videoRef} autoPlay playsInline muted 
                className="w-full h-full object-cover filter saturate-[1.05] contrast-[1.02]"
              />
              
              <div className="absolute top-6 right-6 font-mono text-base tracking-wider text-amber-500 bg-black/80 border border-neutral-800 px-3 py-1 rounded-md backdrop-blur-md">
                {photoCount} / {getActiveLimit()}
              </div>

              {uploading && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center">
                  <p className="text-xs tracking-widest text-amber-500 uppercase animate-pulse">Winding Film Roll...</p>
                </div>
              )}
            </div>

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
      </div>
      )}
    </>
  );
}

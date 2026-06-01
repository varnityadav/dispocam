import { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase Client using standard Vercel Environment Variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function DispcamApp() {
  // Navigation Routing States
  const [view, setView] = useState('host'); // 'host' | 'join' | 'camera' | 'gallery'
  const [eventId, setEventId] = useState('');
  
  // Host Configuration States
  const [eventName, setEventName] = useState('');
  const [duration, setDuration] = useState('2');
  const [generatedLink, setGeneratedLink] = useState('');

  // Guest & Camera Capture States
  const [eventData, setEventData] = useState(null);
  const [guestName, setGuestName] = useState('');
  const [photoCount, setPhotoCount] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');
  const fileInputRef = useRef(null);

  // Unlocked Gallery States
  const [photos, setPhotos] = useState([]);

  // Intercept and parse incoming deep links (e.g., yourdomain.com/?room=UUID)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room) {
      setEventId(room);
      evaluateRoomRoute(room);
    }
  }, []);

  // Time Lock Countdown Loop
  useEffect(() => {
    if (!eventData || view !== 'camera') return;
    const interval = setInterval(() => {
      const now = new Date().getTime();
      const target = new Date(eventData.reveal_at).getTime();
      const diff = target - now;

      if (diff <= 0) {
        clearInterval(interval);
        loadDevelopedGallery(eventData.id);
      } else {
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [eventData, view]);

  // Route evaluation helper
  const evaluateRoomRoute = async (idToTrack) => {
    const { data, error } = await supabase.from('events').select('*').eq('id', idToTrack).single();
    if (error || !data) {
      alert("Darkroom room session not found.");
      return;
    }
    setEventData(data);
    const expired = new Date() > new Date(data.reveal_at);
    if (expired) {
      loadDevelopedGallery(data.id);
    } else {
      setView('join');
    }
  };

  // Host Action: Create a new film roll session
  const handleCreateEvent = async (e) => {
    e.preventDefault();
    if (!eventName) return;

    const revealAt = new Date();
    revealAt.setHours(revealAt.getHours() + parseInt(duration));

    const { data, error } = await supabase
      .from('events')
      .insert([{ name: eventName, reveal_at: revealAt.toISOString() }])
      .select().single();

    if (error) {
      alert(error.message);
    } else {
      const roomUrl = `${window.location.origin}?room=${data.id}`;
      setGeneratedLink(roomUrl);
    }
  };

  // Camera Action: Upload blind shot directly to private bucket
  const handleCapture = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    const pathName = `${eventData.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from('once-films')
      .upload(pathName, file);

    if (!uploadError) {
      await supabase.from('photos').insert([
        { event_id: eventData.id, guest_name: guestName, storage_path: pathName }
      ]);
      setPhotoCount(prev => prev + 1);
    } else {
      alert("Exposure upload issue encountered. Retry capture.");
    }
    setUploading(false);
  };

  // Gallery Action: Load developed assets
  const loadDevelopedGallery = async (idToFetch) => {
    const { data } = await supabase
      .from('photos')
      .select('*')
      .eq('event_id', idToFetch)
      .order('created_at', { ascending: false });
    
    if (data) setPhotos(data);
    setView('gallery');
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#F5F5F7] flex flex-col justify-center items-center p-4 font-sans antialiased">
      
      {/* VIEW 1: HOST ENTRY DASHBOARD */}
      {view === 'host' && (
        <div className="w-full max-w-md border border-[#1C1C1E] bg-[#121214] rounded-3xl p-8 shadow-2xl">
          <h1 className="text-3xl font-light tracking-tight text-center mb-1 text-white">Dispcam.</h1>
          <p className="text-xs text-neutral-500 text-center mb-8 uppercase tracking-widest">Shared Darkroom Studio</p>

          {!generatedLink ? (
            <form onSubmit={handleCreateEvent} className="space-y-6">
              <div>
                <label className="block text-xs uppercase tracking-wider text-neutral-400 mb-2 font-medium">Event Name</label>
                <input 
                  type="text" required placeholder="e.g., Warehouse Party"
                  className="w-full bg-[#1A1A1E] border border-[#2C2C2E] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-neutral-500 transition"
                  value={eventName} onChange={(e) => setEventName(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-neutral-400 mb-2 font-medium">Develop Film After</label>
                <select 
                  className="w-full bg-[#1A1A1E] border border-[#2C2C2E] rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-neutral-500 transition"
                  value={duration} onChange={(e) => setDuration(e.target.value)}
                >
                  <option value="1">1 Hour</option>
                  <option value="2">2 Hours</option>
                  <option value="6">6 Hours</option>
                  <option value="12">12 Hours</option>
                </select>
              </div>
              <button type="submit" className="w-full bg-white text-black font-medium py-3 rounded-xl hover:opacity-90 transition text-sm shadow-md">
                Generate Film Roll
              </button>
            </form>
          ) : (
            <div className="space-y-6 text-center">
              <p className="text-xs text-neutral-400 tracking-wide uppercase">Share this deployment link with guests:</p>
              <div className="p-4 bg-[#1A1A1E] border border-[#2C2C2E] rounded-xl break-all text-sm font-mono text-amber-500 select-all">
                {generatedLink}
              </div>
              <button 
                onClick={() => { navigator.clipboard.writeText(generatedLink); alert('Link copied!'); }}
                className="w-full border border-[#2C2C2E] text-white hover:bg-[#1A1A1E] py-3 rounded-xl text-sm transition"
              >
                Copy Live App URL
              </button>
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: GUEST DEEP LINK ONBOARDING */}
      {view === 'join' && eventData && (
        <div className="w-full max-w-sm text-center space-y-6 p-4">
          <div className="space-y-2">
            <h1 className="text-xs uppercase tracking-widest text-neutral-500">Shared Film Invitation</h1>
            <h2 className="text-3xl font-light text-white tracking-tight">{eventData.name}</h2>
          </div>
          <p className="text-sm text-neutral-400 leading-relaxed max-w-xs mx-auto">
            Photos stay hidden in total darkness until the event ends. No digital snapshots or previews allowed.
          </p>
          <div className="space-y-3 pt-4">
            <input 
              type="text" placeholder="Enter full name"
              className="w-full bg-[#121214] border border-[#2C2C2E] rounded-xl px-4 py-3 text-sm text-center text-white focus:outline-none focus:border-neutral-500"
              value={guestName} onChange={(e) => setGuestName(e.target.value)}
            />
            <button 
              disabled={!guestName} onClick={() => setView('camera')}
              className="w-full bg-white text-black font-medium py-3 rounded-xl text-sm disabled:opacity-40 transition shadow-md"
            >
              Open Analogue Shutter
            </button>
          </div>
        </div>
      )}

      {/* VIEW 3: SIMULATED LENS HARDWARE VIEWPORT */}
      {view === 'camera' && eventData && (
        <div className="w-full max-w-md h-[90vh] flex flex-col justify-between items-center py-4 px-2">
          <header className="text-center w-full">
            <h1 className="text-xs uppercase tracking-widest text-neutral-500">{eventData.name}</h1>
            <p className="text-lg font-mono font-light text-amber-500 mt-1">{timeLeft || 'Developing soon...'}</p>
          </header>

          <div className="w-full aspect-[3/4] border border-[#1C1C1E] bg-[#121214] rounded-2xl relative flex items-center justify-center overflow-hidden shadow-inner">
            <div className="absolute inset-4 border border-dashed border-neutral-800 rounded-xl flex items-center justify-center">
              {uploading ? (
                <p className="text-xs tracking-widest text-amber-500 uppercase animate-pulse">Exposing silver halide...</p>
              ) : (
                <p className="text-xs tracking-widest text-neutral-600 uppercase">Mechanical Viewfinder Locked</p>
              )}
            </div>
            <div className="absolute top-6 right-6 font-mono text-xl text-amber-500 bg-[#1A1A1E] border border-neutral-800 px-3 py-1 rounded-md">
              {String(photoCount).padStart(2, '0')}
            </div>
          </div>

          <footer className="w-full flex flex-col items-center space-y-4 pb-4">
            <input 
              type="file" accept="image/*" capture="environment" 
              ref={fileInputRef} onChange={handleCapture} className="hidden" 
            />
            <button 
              onClick={() => !uploading && fileInputRef.current.click()}
              disabled={uploading}
              className="w-20 h-20 rounded-full border-4 border-neutral-800 bg-[#F5F5F7] active:bg-neutral-400 transition transform active:scale-95 flex items-center justify-center"
            >
              <div className="w-16 h-16 rounded-full border-2 border-black bg-transparent"></div>
            </button>
            <p className="text-xs tracking-wider text-neutral-500 uppercase">Trigger Exposure</p>
          </footer>
        </div>
      )}

      {/* VIEW 4: POST-COUNTDOWN UNLOCKED ARCHIVE */}
      {view === 'gallery' && eventData && (
        <div className="w-full max-w-4xl p-2">
          <header className="text-center my-12 space-y-2">
            <span className="text-xs uppercase tracking-widest text-amber-500 font-semibold bg-amber-500/10 px-3 py-1 rounded-full">Roll Fully Developed</span>
            <h2 className="text-3xl font-light text-white tracking-tight pt-2">{eventData.name}</h2>
            <p className="text-xs text-neutral-500 tracking-wide">{photos.length} raw exposures unspooled.</p>
          </header>

          {photos.length === 0 ? (
            <div className="text-center py-20 text-neutral-600 font-light text-sm">No captures survived chemical development.</div>
          ) : (
            <main className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {photos.map((photo) => {
                const storageUrl = `${supabaseUrl}/storage/v1/object/public/once-films/${photo.storage_path}`;
                return (
                  <div key={photo.id} className="group relative bg-[#121214] border border-[#1C1C1E] rounded-xl overflow-hidden shadow-xl">
                    <img 
                      src={storageUrl} alt="Developed source" 
                      className="w-full aspect-[3/4] object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 to-transparent p-3 pt-8">
                      <p className="text-xs text-neutral-300">By <span className="text-white font-medium">{photo.guest_name}</span></p>
                    </div>
                  </div>
                );
              })}
            </main>
          )}
        </div>
      )}
    </div>
  );
}

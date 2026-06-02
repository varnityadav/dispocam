import { useState, useEffect, useRef } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, collection, addDoc, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';

// Inline programmatic initialization of Firebase SDK matching Vercel configurations
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);
const storage = getStorage(app);

export default function DispcamApp() {
  // Navigation & Session States
  const [view, setView] = useState('host'); // 'host' | 'join' | 'camera' | 'gallery'
  const [eventId, setEventId] = useState('');
  
  // Host Configuration States
  const [eventName, setEventName] = useState('');
  const [duration, setDuration] = useState('2');
  const [maxPhotos, setMaxPhotos] = useState('10');
  const [generatedLink, setGeneratedLink] = useState('');

  // Guest & Real-time Lens States
  const [eventData, setEventData] = useState(null);
  const [guestName, setGuestName] = useState('');
  const [photoCount, setPhotoCount] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');
  
  // Hardware Camera Viewport Reference Layers
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  // Unlocked Developed Gallery State
  const [photos, setPhotos] = useState([]);

  // Intercept incoming room deep links
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room) {
      setEventId(room);
      evaluateRoomRoute(room);
    }
  }, []);

  // Time-lock countdown loop
  useEffect(() => {
    if (!eventData || view !== 'camera') return;
    const interval = setInterval(() => {
      const now = new Date().getTime();
      const target = new Date(eventData.reveal_at).getTime();
      const diff = target - now;

      if (diff <= 0) {
        clearInterval(interval);
        stopCameraHardware();
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
      const docRef = doc(db, 'events', idToTrack);
      const docSnap = await getDoc(docRef);
      
      if (!docSnap.exists()) {
        alert("Event not found. Check that the link is correct.");
        return;
      }
      
      const data = { id: docSnap.id, ...docSnap.data() };
      setEventData(data);
      
      if (new Date() > new Date(data.reveal_at)) {
        loadDevelopedGallery(data.id);
      } else {
        setView('join');
      }
    } catch (e) {
      alert("Error loading event: " + e.message);
    }
  };

  const handleCreateEvent = async (e) => {
    e.preventDefault();
    if (!eventName) return;

    const revealAt = new Date();
    revealAt.setHours(revealAt.getHours() + parseInt(duration));

    try {
      const docRef = await addDoc(collection(db, 'events'), {
        name: eventName,
        reveal_at: revealAt.toISOString(),
        max_photos_limit: parseInt(maxPhotos),
        created_at: new Date().toISOString()
      });

      const roomUrl = `${window.location.origin}?room=${docRef.id}`;
      setGeneratedLink(roomUrl);
    } catch (error) {
      alert("Error creating event: " + error.message);
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
      
      // Upload raw file bytes stream to Firebase Cloud Storage storage system bucket
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, blob);

      // Save structural transaction document index log inside Firestore collection map metadata storage
      await addDoc(collection(db, 'photos'), {
        event_id: eventData.id,
        guest_name: guestName,
        storage_path: storagePath,
        created_at: new Date().toISOString()
      });

      setPhotoCount(prev => prev + 1);
    } catch (err) {
      alert("Failed to capture photo: " + err.message + (err.code ? " (" + err.code + ")" : ""));
    }
    setUploading(false);
  };

  const loadDevelopedGallery = async (idToFetch) => {
    try {
      const q = query(
        collection(db, 'photos'), 
        where('event_id', '==', idToFetch)
      );
      const querySnapshot = await getDocs(q);
      
      const photosList = [];
      for (const docSnap of querySnapshot.docs) {
        const data = docSnap.data();
        // Generate secure downloadable display public URL pointers from Storage pointers
        const fileRef = ref(storage, data.storage_path);
        const downloadUrl = await getDownloadURL(fileRef);
        photosList.push({ id: docSnap.id, downloadUrl, ...data });
      }
      
      // Sort photos newest-first client-side (avoids needing a composite Firestore index)
      photosList.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      
      setPhotos(photosList);
      setView('gallery');
    } catch (e) {
      alert("Failed to load gallery: " + e.message);
    }
  };

  const handleEnterCamera = () => {
    if (!guestName) return;
    setView('camera');
    setTimeout(() => {
      startCameraHardware();
    }, 100);
  };

  const getActiveLimit = () => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return parseInt(params.get('limit')) || eventData?.max_photos_limit || 10;
    }
    return 10;
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#F5F5F7] flex flex-col justify-center items-center p-4 font-sans antialiased">
      
      {/* VIEW 1: HOST ENTRY DASHBOARD */}
      {view === 'host' && (
        <div className="w-full max-w-md border border-[#1C1C1E] bg-[#121214] rounded-3xl p-8 shadow-2xl">
          <h1 className="text-3xl font-light tracking-tight text-center mb-1 text-white">Dispcam.</h1>
          <p className="text-xs text-neutral-500 text-center mb-8 uppercase tracking-widest">No Previews. No Retakes.</p>

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
              <div className="grid grid-cols-2 gap-4">
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
                  <label className="block text-xs uppercase tracking-wider text-neutral-400 mb-2 font-medium">Film Roll Limit</label>
                  <select 
                    className="w-full bg-[#1A1A1E] border border-[#2C2C2E] rounded-xl px-4 py-3 text-sm text-white focus:outline-none"
                    value={maxPhotos} onChange={(e) => setMaxPhotos(e.target.value)}
                  >
                    <option value="3">3 Shots</option>
                    <option value="5">5 Shots</option>
                    <option value="10">10 Shots</option>
                    <option value="27">27 Shots</option>
                  </select>
                </div>
              </div>
              <button type="submit" className="w-full bg-white text-black font-medium py-3 rounded-xl text-sm shadow-md">
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
                Copy Link
              </button>
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
            <button 
              disabled={!guestName} onClick={handleEnterCamera}
              className="w-full bg-white text-black font-medium py-3 rounded-xl text-sm disabled:opacity-40 shadow-md"
            >
              Unlock Shutter Camera
            </button>
          </div>
        </div>
      )}

      {/* VIEW 3: LIVE HARDWARE CAMERA STREAM VIEWPORT */}
      {view === 'camera' && eventData && (
        <div className="w-full max-w-md h-[92vh] flex flex-col justify-between items-center py-2 px-2">
          <header className="text-center w-full">
            <h1 className="text-xs uppercase tracking-widest text-neutral-500">{eventData.name}</h1>
            <p className="text-lg font-mono font-light text-amber-500 mt-1">{timeLeft || 'Developing soon...'}</p>
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
              className="w-22 h-22 rounded-full border-4 border-neutral-800 bg-[#F5F5F7] active:bg-neutral-500 disabled:bg-neutral-800 disabled:opacity-40 transition transform active:scale-95 flex items-center justify-center shadow-2xl"
            >
              <div className="w-16 h-16 rounded-full border-2 border-black bg-transparent"></div>
            </button>
            <p className="text-xs tracking-wider text-neutral-500 uppercase">
              {photoCount >= getActiveLimit() ? "Roll Finished" : "Mechanical Shutter Release"}
            </p>
          </footer>
        </div>
      )}

      {/* VIEW 4: DEPLOYED POST-COUNTDOWN UNLOCKED ARCHIVE */}
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
  );
}

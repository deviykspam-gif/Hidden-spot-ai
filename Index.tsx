import { useEffect, useMemo, useRef, useState } from "react";
import Map, { Marker, useMap, AttributionControl } from "react-map-gl/maplibre";
import type { StyleSpecification } from "maplibre-gl";
import { AnimatePresence, motion } from "motion/react";
import {
  Compass,
  LocateFixed,
  MapPin,
  Search,
  Globe2,
  User,
  Route,
  X,
  PersonStanding,
  Sparkles,
  Layers,
  Heart,
  ChevronRight,
  Navigation,
  Download,
} from "lucide-react";

import type { User as SupabaseUser } from "@supabase/supabase-js";
import { fetchSpots, type Spot, type SpotCategory } from "@/data/spots";
import { supabase } from "@/integrations/supabase/client";
import { generateLocalSpots, hyderabad } from "@/data/localSpots";

const categories: Array<"All" | SpotCategory> = [
  "All",
  "Waterfalls",
  "Viewpoints",
  "Lakes",
  "Trekking",
];

type Coordinates = { latitude: number; longitude: number };
type LocatedSpot = Spot & { distanceKm: number };
type Vibe = "all" | "solitude" | "thrill" | "scenic";
type Radius = 10 | 25 | 50 | "all";
type MapMode = "dark" | "satellite";

const fallbackLocation: Coordinates = { latitude: 17.385, longitude: 78.4866 };

function haversineDistance(a: Coordinates, b: Coordinates) {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function getStickerForCategory(category: string) {
  switch (category.toLowerCase()) {
    case "waterfalls": return "https://img.icons8.com/color/96/waterfall.png";
    case "viewpoints": return "https://img.icons8.com/color/96/binoculars.png";
    case "lakes": return "https://img.icons8.com/color/96/lake.png";
    case "trekking": return "https://img.icons8.com/color/96/trekking.png";
    default: return "https://img.icons8.com/color/96/marker--v1.png";
  }
}

function SpotMarkerGraphic({ spot, active, onSelect }: { spot: Spot; active: boolean; onSelect: () => void }) {
  return (
    <motion.div
      key={`${spot.id}-${active ? "selected" : "visible"}`}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: [0, 1.25, 1], opacity: 1 }}
      transition={{
        scale: { delay: active ? 0.2 : 0, duration: 0.4, times: [0, 0.7, 1], ease: [0.32, 0.72, 0, 1] },
        opacity: { duration: 0.18 },
      }}
      className={`relative ${active ? "z-50" : "z-10"}`}
    >
      <motion.div animate={{ y: [0, -4, 0] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}>
        <motion.button
          type="button"
          onClick={onSelect}
          aria-label={`Open ${spot.title}`}
          className="group relative flex items-center justify-center outline-none"
          whileHover={{ scale: 1.15 }}
          whileTap={{ scale: 0.95 }}
        >
          <div className={`relative flex h-12 w-12 items-center justify-center rounded-full bg-black/50 backdrop-blur-xl border border-white/30 shadow-[0_8px_24px_rgba(0,0,0,0.6)] transition-all duration-300 group-hover:bg-black/70 group-hover:shadow-[0_8px_32px_rgba(255,255,255,0.3)] ${active ? 'ring-2 ring-primary bg-black/80' : ''}`}>
            <img 
              className="relative z-10 h-7 w-7 drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] transition-transform duration-300 group-hover:scale-110" 
              src={getStickerForCategory(spot.category)} 
              alt={spot.category} 
              draggable={false} 
            />
          </div>
          <div className="absolute -bottom-2 left-1/2 h-1.5 w-6 -translate-x-1/2 rounded-[100%] bg-black/70 blur-[3px]" />
        </motion.button>
      </motion.div>
    </motion.div>
  );
}

function MapController({ selected, userLocation, recenterToken }: { selected: LocatedSpot | null; userLocation: Coordinates | null; recenterToken: number }) {
  const { current: map } = useMap();
  const selectedId = useRef<string | null>(null);
  const lastRecenterToken = useRef(0);
  const hasFlownIn = useRef(false);
  const easing = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  useEffect(() => {
    if (!map || hasFlownIn.current) return;
    hasFlownIn.current = true;
    setTimeout(() => {
      map.flyTo({ center: [78.4866, 17.385], zoom: 11, pitch: 45, duration: 3000, easing, essential: true });
    }, 500);
  }, [map]);

  useEffect(() => {
    if (!map || !selected || selectedId.current === selected.id) return;
    selectedId.current = selected.id;
    map.flyTo({ center: [selected.longitude, selected.latitude], duration: 1600, pitch: 50, zoom: 14, easing, essential: true });
  }, [map, selected]);

  useEffect(() => {
    if (!map || recenterToken === 0 || recenterToken === lastRecenterToken.current || !userLocation) return;
    lastRecenterToken.current = recenterToken;
    map.flyTo({ center: [userLocation.longitude, userLocation.latitude], duration: 1600, pitch: 50, zoom: 14, easing, essential: true });
  }, [map, recenterToken, userLocation]);

  return null;
}

export default function Index() {
  const [category, setCategory] = useState<(typeof categories)[number]>("All");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<LocatedSpot | null>(null);
  const [radius, setRadius] = useState<Radius>("all");
  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [locationState, setLocationState] = useState<"locating" | "ready" | "unavailable">("locating");
  const [dbSpots, setDbSpots] = useState<Spot[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "local">("loading");
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [mapMode, setMapMode] = useState<MapMode>("satellite");
  const [recenterToken, setRecenterToken] = useState(0);
  const [showProjectCard, setShowProjectCard] = useState(true);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", true);
  }, []);

  function toggleMapMode() {
    setMapMode((prev) => (prev === "dark" ? "satellite" : "dark"));
  }

  const mapStyleUrl = useMemo<StyleSpecification>(() => {
    if (mapMode === "dark") {
      return {
        version: 8,
        projection: { type: "globe" },
        sources: {
          "esri-dark": { 
            type: "raster", 
            tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"], 
            tileSize: 256, 
            attribution: "Imagery © Esri",
            maxzoom: 16
          }
        },
        layers: [
          { id: "background", type: "background", paint: { "background-color": "rgba(2,3,8,1)" } },
          { id: "dark-layer", type: "raster", source: "esri-dark", minzoom: 0, maxzoom: 22 }
        ]
      } as StyleSpecification;
    }
    
    return {
      version: 8,
      projection: { type: "globe" },
      sources: {
        "esri-satellite": { 
          type: "raster", 
          tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], 
          tileSize: 256, 
          attribution: "Imagery © Esri", 
          maxzoom: 18 
        }
      },
      layers: [
        { id: "background", type: "background", paint: { "background-color": "rgba(2,3,8,1)" } },
        { id: "satellite-layer", type: "raster", source: "esri-satellite", minzoom: 0, maxzoom: 22 }
      ]
    } as StyleSpecification;
  }, [mapMode]);

  useEffect(() => {
    fetchSpots()
      .then((rows) => { setDbSpots(rows); setLoadState(rows.length ? "ready" : "local"); })
      .catch(() => setLoadState("local"));
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!("geolocation" in navigator)) { setLocationState("unavailable"); return; }
    const watchId = navigator.geolocation.watchPosition(
      ({ coords }) => { setUserLocation({ latitude: coords.latitude, longitude: coords.longitude }); setLocationState("ready"); },
      () => setLocationState("unavailable"),
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 12000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const usingLocal = loadState === "local";
  const discoveryOrigin = userLocation ?? (usingLocal ? hyderabad : fallbackLocation);
  const localSeed = userLocation ?? (locationState === "locating" ? null : hyderabad);
  const localSpots = useMemo(() => (usingLocal && localSeed ? generateLocalSpots(localSeed) : []), [usingLocal, localSeed?.latitude, localSeed?.longitude]);
  const sourceSpots = usingLocal ? localSpots : dbSpots;
  
  const nearbySpots = useMemo<LocatedSpot[]>(() => {
    return sourceSpots
      .filter((spot) => Number.isFinite(spot.latitude) && Number.isFinite(spot.longitude))
      .map((spot) => ({ ...spot, distanceKm: haversineDistance(discoveryOrigin, spot) }));
  }, [sourceSpots, discoveryOrigin.latitude, discoveryOrigin.longitude]);

  const visibleSpots = useMemo(() => {
    const term = query.trim().toLowerCase();
    return nearbySpots.filter((spot) => 
      (category === "All" || spot.category === category) && 
      (radius === "all" || spot.distanceKm <= radius) && 
      (!term || `${spot.title} ${spot.category} ${spot.description}`.toLowerCase().includes(term))
    );
  }, [category, nearbySpots, query, radius]);

  return (
    <main className="relative h-dvh min-h-[620px] overflow-hidden bg-black font-sans text-foreground">
      <style>{`
        @keyframes space-drift { from { background-position: 0% 0%; } to { background-position: -200% -100%; } }
        .starfield-bg {
          background-color: #020308;
          background-image: 
            radial-gradient(circle at 50% 50%, rgba(20, 30, 60, 0.4) 0%, rgba(0, 0, 0, 1) 100%),
            url('https://www.transparenttextures.com/patterns/stardust.png');
          animation: space-drift 180s linear infinite;
        }
        @keyframes pulse-ring {
          0% { transform: scale(0.95); opacity: 0.8; }
          50% { transform: scale(1.6); opacity: 0.3; }
          100% { transform: scale(0.95); opacity: 0.8; }
        }
        .user-radar {
          width: 24px;
          height: 24px;
          background: rgba(59, 130, 246, 0.8);
          border: 3px solid #ffffff;
          border-radius: 50%;
          box-shadow: 0 0 15px rgba(59, 130, 246, 0.9);
          position: relative;
        }
        .user-radar::after {
          content: '';
          position: absolute;
          inset: -8px;
          border: 2px solid rgba(59, 130, 246, 0.6);
          border-radius: 50%;
          animation: pulse-ring 2s infinite ease-in-out;
        }
      `}</style>
      
      {/* 3D Globe Map Container */}
      <div className="absolute inset-0 z-0 starfield-bg">
        <Map
          id="hidden-spots-map"
          projection="globe"
          minZoom={1}
          maxZoom={19}
          initialViewState={{ longitude: 78.4866, latitude: 17.385, zoom: 11, pitch: 45, bearing: 0 }}
          mapStyle={mapStyleUrl}
          mapLib={import("maplibre-gl")}
          style={{ width: "100%", height: "100%", backgroundColor: "transparent" }}
          reuseMaps
        >
          <AttributionControl position="bottom-right" style={{ zIndex: 10 }} />
          <MapController selected={selected} userLocation={userLocation} recenterToken={recenterToken} />
          
          {userLocation && (
            <Marker longitude={userLocation.longitude} latitude={userLocation.latitude} anchor="center" style={{ zIndex: 1000 }}>
              <div className="user-radar" role="img" aria-label="Your location" />
            </Marker>
          )}
          
          {visibleSpots.map((spot) => {
            const isSelected = selected?.id === spot.id;
            return (
              <Marker key={spot.id} longitude={spot.longitude} latitude={spot.latitude} anchor="bottom" style={{ zIndex: isSelected ? 900 : 700 }}>
                <SpotMarkerGraphic spot={spot} active={isSelected} onSelect={() => setSelected(spot)} />
              </Marker>
            );
          })}
        </Map>
      </div>

      {/* Google Earth Style Top Header Bar */}
      <header className="absolute inset-x-0 top-0 z-[500] px-3 pt-[max(12px,env(safe-area-inset-top))] sm:px-4">
        <div className="mx-auto flex max-w-4xl items-center gap-2.5">
          <div className="relative flex-1 rounded-full bg-[#202124]/90 backdrop-blur-2xl border border-white/10 shadow-[0_4px_20px_rgba(0,0,0,0.5)] px-4 py-2.5 flex items-center gap-3">
            <Search className="size-5 text-white/70 shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search Hidden Spots or Categories..."
              className="w-full bg-transparent text-sm text-white placeholder:text-white/60 outline-none"
            />
            {query && (
              <button onClick={() => setQuery("")} className="text-white/50 hover:text-white">
                <X className="size-4" />
              </button>
            )}
            <div className="size-7 rounded-full bg-primary/30 border border-primary/40 flex items-center justify-center text-xs font-bold text-primary-foreground shrink-0 shadow-sm">
              {user?.email ? user.email[0].toUpperCase() : <User className="size-3.5" />}
            </div>
          </div>

          <button 
            onClick={toggleMapMode}
            className="size-11 shrink-0 rounded-2xl bg-[#202124]/90 backdrop-blur-2xl border border-white/20 shadow-[0_4px_20px_rgba(0,0,0,0.5)] overflow-hidden relative flex items-center justify-center group hover:scale-105 transition-all"
            title="Switch map style"
          >
            <div className="absolute inset-0 bg-cover bg-center opacity-80" style={{ backgroundImage: `url('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/3/2/3')` }} />
            <div className="absolute inset-0 bg-black/30 group-hover:bg-black/15 transition-colors" />
            <Globe2 className="relative z-10 size-5 text-white drop-shadow" />
          </button>
        </div>
      </header>

      {/* Right Side Vertical Action Stack */}
      <div className="absolute right-4 top-24 z-[500] flex flex-col gap-2.5">
        <button className="size-11 rounded-2xl bg-[#202124]/90 backdrop-blur-2xl border border-white/15 text-white shadow-lg flex items-center justify-center hover:bg-[#3c4043] transition-all">
          <Compass className="size-5" />
        </button>
        <button className="size-11 rounded-2xl bg-[#202124]/90 backdrop-blur-2xl border border-white/15 text-white shadow-lg flex items-center justify-center hover:bg-[#3c4043] transition-all">
          <PersonStanding className="size-5" />
        </button>
        <button 
          onClick={() => setRecenterToken((v) => v + 1)}
          className="size-11 rounded-2xl bg-[#202124]/90 backdrop-blur-2xl border border-white/15 text-white shadow-lg flex items-center justify-center hover:bg-[#3c4043] transition-all"
          title="Re-center"
        >
          <LocateFixed className="size-5 text-primary" />
        </button>
      </div>

      {/* Bottom Floating Info Card */}
      <AnimatePresence>
        {showProjectCard && !selected && (
          <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="absolute bottom-20 left-4 z-[500] max-w-[280px] rounded-2xl bg-[#202124]/95 backdrop-blur-2xl border border-white/15 p-4 text-white shadow-2xl"
          >
            <p className="text-xs leading-relaxed text-white/90">Explore hidden natural spots and wild landscapes interactively in 3D globe view.</p>
            <button 
              onClick={() => setShowProjectCard(false)} 
              className="mt-3 text-xs font-semibold text-primary hover:underline"
            >
              Dismiss
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Navigation Toolbar Dock */}
      <nav className="absolute inset-x-0 bottom-3 z-[500] px-4 flex justify-center">
        <div className="flex items-center gap-2 rounded-full bg-[#202124]/95 backdrop-blur-3xl border border-white/15 px-4 py-2 shadow-2xl">
          <button onClick={() => setCategory("All")} className="flex size-10 items-center justify-center rounded-full bg-primary/20 text-primary hover:bg-primary/30 transition-colors" title="All Spots">
            <Globe2 className="size-5" />
          </button>
          <button onClick={() => setCategory("Waterfalls")} className={`flex size-10 items-center justify-center rounded-full transition-colors ${category === 'Waterfalls' ? 'bg-white/20 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'}`} title="Waterfalls">
            <MapPin className="size-5" />
          </button>
          <button onClick={() => setCategory("Trekking")} className={`flex size-10 items-center justify-center rounded-full transition-colors ${category === 'Trekking' ? 'bg-white/20 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'}`} title="Trekking">
            <Route className="size-5" />
          </button>
        </div>
      </nav>
    </main>
  );
};